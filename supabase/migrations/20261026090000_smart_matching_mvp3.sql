-- Smart vendor matching, MVP 3: reliability data, match history, admin
-- controls and reporting.
--
--   quote_requests.responded_at   when the vendor first quoted/declined
--                                 (server clock only)
--   refresh_vendor_reliability()  daily: acceptance_rate (0–1) and
--                                 avg_response_hours from real requests,
--                                 null until there are 3+ to judge by
--   match_runs                    one row per event × category × day the
--                                 board ran matching: counts, top score,
--                                 why vendors were excluded (admin-only)
--   admin_set_matching_settings() switch + weights, admin (aal2) only,
--                                 audit-logged
--   admin_matching_report()       the numbers for /admin/matching
--
-- Rollback: supabase/rollbacks/20261026090000_smart_matching_mvp3.down.sql

-- ── response time ───────────────────────────────────────────────────────
alter table public.quote_requests add column if not exists responded_at timestamptz;

-- Stamped by the server when a pending request is first answered; nobody
-- can set or move it (it feeds vendors' reliability scores).
create or replace function public.stamp_quote_responded_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.responded_at := null;
  elsif old.responded_at is null and old.status = 'pending' and new.status in ('quoted', 'declined') then
    new.responded_at := now();
  else
    new.responded_at := old.responded_at;
  end if;
  return new;
end $$;

drop trigger if exists trg_quote_requests_responded_at on public.quote_requests;
create trigger trg_quote_requests_responded_at
  before insert or update on public.quote_requests
  for each row execute function public.stamp_quote_responded_at();

revoke execute on function public.stamp_quote_responded_at() from public, anon, authenticated;

-- ── reliability ─────────────────────────────────────────────────────────
-- Same definitions as the vendor's Smart Opportunities stats: requests still
-- waiting and ones the customer cancelled don't count either way.
create or replace function public.refresh_vendor_reliability()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  with stats as (
    select
      q.vendor_id,
      count(*) filter (where not (q.status = 'pending' and (q.expires_at is null or q.expires_at > now())) and q.status <> 'cancelled') as decidable,
      count(*) filter (where q.status in ('quoted', 'declined', 'accepted') or q.responded_at is not null
                          or (q.status = 'expired' and q.quoted_amount is not null)) as answered,
      count(q.responded_at) as timed,
      avg(extract(epoch from (q.responded_at - q.created_at)) / 3600.0) as avg_hours
    from public.quote_requests q
    where q.created_at > now() - interval '180 days'
    group by q.vendor_id
  ),
  target as (
    select sp.id,
      case when coalesce(s.decidable, 0) >= 3 then round((s.answered::numeric / s.decidable), 3)::double precision end as rate,
      case when coalesce(s.timed, 0) >= 3 then round(s.avg_hours::numeric, 1)::double precision end as hours
    from public.service_providers sp
    left join stats s on s.vendor_id = sp.id
  )
  update public.service_providers sp
  set acceptance_rate = t.rate, avg_response_hours = t.hours
  from target t
  where sp.id = t.id
    and (sp.acceptance_rate is distinct from t.rate or sp.avg_response_hours is distinct from t.hours);
  get diagnostics changed = row_count;
  return changed;
end $$;

revoke execute on function public.refresh_vendor_reliability() from public, anon, authenticated;

select cron.unschedule('refresh-vendor-reliability') where exists (select 1 from cron.job where jobname = 'refresh-vendor-reliability');
select cron.schedule('refresh-vendor-reliability', '41 3 * * *', 'select public.refresh_vendor_reliability()');

-- ── match history ───────────────────────────────────────────────────────
create table if not exists public.match_runs (
  id bigint generated always as identity primary key,
  event_id text not null references public.events (id) on delete cascade,
  service text not null,
  run_date date not null,
  suburb text,
  event_date date,
  eligible integer not null default 0,
  unconfirmed integer not null default 0,
  excluded integer not null default 0,
  widened boolean not null default false,
  top_score smallint,
  -- {"over_budget": 3, "outside_area": 2, …}
  exclusion_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, service, run_date)
);

create index if not exists match_runs_run_date_idx on public.match_runs (run_date);

-- Written by the server (service role) and read through admin RPCs only.
alter table public.match_runs enable row level security;
revoke all on public.match_runs from anon, authenticated;

-- ── admin: settings ─────────────────────────────────────────────────────
create or replace function public.admin_set_matching_settings(p_enabled boolean, p_weights jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  total numeric := 0;
  old_value jsonb;
  new_weights jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  if p_enabled is null or p_weights is null or jsonb_typeof(p_weights) <> 'object' then
    raise exception 'Invalid matching settings.' using errcode = '22023';
  end if;
  foreach k in array array['suitability', 'budget', 'quality', 'location', 'reliability'] loop
    if jsonb_typeof(p_weights -> k) <> 'number' or (p_weights ->> k)::numeric < 0 or (p_weights ->> k)::numeric > 100 then
      raise exception 'Weight "%" must be a number from 0 to 100.', k using errcode = '22023';
    end if;
    total := total + (p_weights ->> k)::numeric;
  end loop;
  if total <= 0 then raise exception 'At least one weight must be above zero.' using errcode = '22023'; end if;

  new_weights := jsonb_build_object(
    'suitability', (p_weights ->> 'suitability')::numeric, 'budget', (p_weights ->> 'budget')::numeric,
    'quality', (p_weights ->> 'quality')::numeric, 'location', (p_weights ->> 'location')::numeric,
    'reliability', (p_weights ->> 'reliability')::numeric);

  select jsonb_build_object(
    'enabled', (select value from public.app_settings where key = 'smart_matching_enabled'),
    'weights', (select value::jsonb from public.app_settings where key = 'match_weights'))
  into old_value;

  insert into public.app_settings (key, value) values
    ('smart_matching_enabled', case when p_enabled then 'true' else 'false' end),
    ('match_weights', new_weights::text)
  on conflict (key) do update set value = excluded.value, updated_at = now();

  insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), 'matching_settings', 'app_settings', 'matching', old_value,
          jsonb_build_object('enabled', p_enabled, 'weights', new_weights));

  return public.matching_settings();
end $$;

revoke execute on function public.admin_set_matching_settings(boolean, jsonb) from public, anon;
grant execute on function public.admin_set_matching_settings(boolean, jsonb) to authenticated;

-- ── admin: report ───────────────────────────────────────────────────────
create or replace function public.admin_matching_report(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz;
  since_date date;
  result jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  since := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  since_date := (since at time zone 'Australia/Sydney')::date;

  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'searches', (
      select jsonb_build_object(
        'total', count(*),
        'events', count(distinct event_id),
        'with_matches', count(*) filter (where eligible + unconfirmed > 0),
        'with_confirmed', count(*) filter (where eligible > 0),
        'widened', count(*) filter (where widened))
      from public.match_runs where run_date >= since_date),
    'by_service', coalesce((
      select jsonb_agg(x order by x.total desc) from (
        select service, count(*) as total, count(*) filter (where eligible + unconfirmed = 0) as failures,
               round(avg(eligible + unconfirmed), 1) as avg_matches
        from public.match_runs where run_date >= since_date group by service) x), '[]'::jsonb),
    'failures', coalesce((
      select jsonb_agg(x) from (
        select event_id, service, suburb, event_date, run_date, excluded, exclusion_counts
        from public.match_runs
        where run_date >= since_date and eligible + unconfirmed = 0
        order by run_date desc, updated_at desc limit 25) x), '[]'::jsonb),
    'exclusions', coalesce((
      select jsonb_object_agg(code, n) from (
        select e.key as code, sum(e.value::int) as n
        from public.match_runs r, jsonb_each_text(r.exclusion_counts) e
        where r.run_date >= since_date group by e.key) x), '{}'::jsonb),
    'quotes', (
      select jsonb_build_object(
        'requests', count(*),
        'smart', count(*) filter (where origin = 'smart_match'),
        'responded', count(responded_at),
        'avg_response_hours', round(avg(extract(epoch from (responded_at - created_at)) / 3600.0)::numeric, 1),
        'quoted', count(*) filter (where quoted_amount is not null),
        'accepted', count(*) filter (where status = 'accepted'),
        'decided', count(*) filter (where quoted_amount is not null and status in ('accepted', 'expired')))
      from public.quote_requests where created_at >= since),
    'bookings', (
      select jsonb_build_object(
        'confirmed', count(*),
        'value', coalesce(sum(total_price), 0),
        'commission_bps', coalesce((select value::int from public.app_settings where key = 'commission_bps'), 0))
      from public.bookings where status in ('confirmed', 'completed') and created_at >= since),
    'vendors', (
      select jsonb_build_object(
        'approved', count(*) filter (where status = 'approved' and not is_demo),
        'with_packages', count(*) filter (where status = 'approved' and not is_demo
                                           and exists (select 1 from public.vendor_packages p where p.provider_id = sp.id and p.active)),
        'service_area_set', count(*) filter (where status = 'approved' and not is_demo and service_radius_km is not null),
        'calendar_current', count(*) filter (where status = 'approved' and not is_demo
                                              and availability_confirmed_at > now() - interval '45 days'),
        'responded', (select count(distinct vendor_id) from public.quote_requests where responded_at >= since),
        'invited', (select count(distinct vendor_id) from public.quote_requests where created_at >= since))
      from public.service_providers sp)
  ) into result;
  return result;
end $$;

revoke execute on function public.admin_matching_report(integer) from public, anon;
grant execute on function public.admin_matching_report(integer) to authenticated;
