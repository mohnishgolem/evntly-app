-- Trust & safety: booking disputes and fraud-risk monitoring.
--
--   booking_disputes / booking_dispute_messages
--       Either party to a booking can raise a problem (no-show, quality,
--       cancellation, payment, conduct). Both parties and Evntly share one
--       thread. Only admins move a dispute to review or resolve it, with a
--       recorded outcome; every admin change is audit-logged. Writes go
--       through RPCs only, so status and roles can't be forged.
--
--   admin_risk_overview() / risk_reviews
--       Ranks accounts by signals the database already holds: off-platform
--       contact attempts, reports, blocks, quick cancellations after a quote
--       is accepted, quote-request bursts, disputes raised against them and
--       ABNs shared between different vendor accounts. Flags only — nothing
--       is suspended automatically. Admins mark accounts reviewed (with a
--       note); an account reappears when there's a new signal.
--
-- Rollback: supabase/rollbacks/20261028090000_disputes_and_risk.down.sql

-- ── disputes ────────────────────────────────────────────────────────────
create table if not exists public.booking_disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings (id) on delete cascade,
  opened_by_user_id uuid not null references auth.users (id),
  opened_by_role text not null check (opened_by_role in ('customer', 'vendor')),
  -- The two parties, copied from the booking when the dispute is opened.
  customer_user_id uuid,
  vendor_user_id uuid,
  reason text not null check (reason in ('no_show', 'quality', 'cancellation', 'payment', 'conduct', 'other')),
  description text not null check (char_length(description) between 20 and 4000),
  desired_outcome text check (desired_outcome is null or char_length(desired_outcome) <= 1000),
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'withdrawn')),
  outcome text check (outcome in ('customer_favour', 'vendor_favour', 'partial', 'mutual', 'no_action')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 4000),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (outcome is not null))
);

create unique index if not exists booking_disputes_one_live
  on public.booking_disputes (booking_id) where status in ('open', 'under_review');
create index if not exists booking_disputes_status_idx on public.booking_disputes (status, created_at);
create index if not exists booking_disputes_customer_idx on public.booking_disputes (customer_user_id);
create index if not exists booking_disputes_vendor_idx on public.booking_disputes (vendor_user_id);

create table if not exists public.booking_dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.booking_disputes (id) on delete cascade,
  author_user_id uuid not null references auth.users (id),
  author_role text not null check (author_role in ('customer', 'vendor', 'admin')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists booking_dispute_messages_dispute_idx on public.booking_dispute_messages (dispute_id, created_at);

alter table public.booking_disputes enable row level security;
alter table public.booking_dispute_messages enable row level security;
revoke all on public.booking_disputes from anon, authenticated;
revoke all on public.booking_dispute_messages from anon, authenticated;
grant select on public.booking_disputes to authenticated;
grant select on public.booking_dispute_messages to authenticated;

drop policy if exists booking_disputes_read on public.booking_disputes;
create policy booking_disputes_read on public.booking_disputes
  for select to authenticated
  using ((select auth.uid()) in (customer_user_id, vendor_user_id) or (select public.is_admin()));

drop policy if exists booking_dispute_messages_read on public.booking_dispute_messages;
create policy booking_dispute_messages_read on public.booking_dispute_messages
  for select to authenticated
  using (exists (
    select 1 from public.booking_disputes d
    where d.id = dispute_id
      and ((select auth.uid()) in (d.customer_user_id, d.vendor_user_id) or (select public.is_admin()))
  ));

create or replace function public.open_booking_dispute(
  p_booking_id text, p_reason text, p_description text, p_desired_outcome text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  b record;
  role text;
  new_id uuid;
begin
  if me is null then raise exception 'Not logged in.' using errcode = '42501'; end if;
  select id, client_user_id, provider_owner_user_id, status, event_date into b
  from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found.' using errcode = 'P0001'; end if;
  role := case when me = b.client_user_id then 'customer' when me = b.provider_owner_user_id then 'vendor' end;
  if role is null then raise exception 'Booking not found.' using errcode = 'P0001'; end if;
  if b.status = 'declined' then raise exception 'This booking was declined, so there''s nothing to dispute.' using errcode = 'P0001'; end if;
  if b.event_date < (now() at time zone 'Australia/Sydney')::date - 90 then
    raise exception 'Disputes can be raised up to 90 days after the event.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.booking_disputes where opened_by_user_id = me and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Too many disputes today. Please contact support.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(trim(p_description), '')) < 20 then
    raise exception 'Please describe what happened (at least 20 characters).' using errcode = '22023';
  end if;

  insert into public.booking_disputes (booking_id, opened_by_user_id, opened_by_role, customer_user_id, vendor_user_id,
                                       reason, description, desired_outcome)
  values (b.id, me, role, b.client_user_id, b.provider_owner_user_id, p_reason, trim(p_description),
          nullif(trim(coalesce(p_desired_outcome, '')), ''))
  returning id into new_id;
  return new_id;
exception when unique_violation then
  raise exception 'There''s already an open dispute on this booking.' using errcode = 'P0001';
end $$;

create or replace function public.add_dispute_message(p_dispute_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  d record;
  role text;
  new_id uuid;
begin
  select * into d from public.booking_disputes where id = p_dispute_id;
  if not found then raise exception 'Dispute not found.' using errcode = 'P0001'; end if;
  role := case when me = d.customer_user_id then 'customer' when me = d.vendor_user_id then 'vendor'
               when public.is_admin() then 'admin' end;
  if role is null then raise exception 'Dispute not found.' using errcode = 'P0001'; end if;
  if d.status not in ('open', 'under_review') then raise exception 'This dispute is closed.' using errcode = 'P0001'; end if;
  if char_length(coalesce(trim(p_body), '')) = 0 then raise exception 'Write a message first.' using errcode = '22023'; end if;
  if role <> 'admin' and (select count(*) from public.booking_dispute_messages
                          where author_user_id = me and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages. Please wait a little.' using errcode = 'P0001';
  end if;
  insert into public.booking_dispute_messages (dispute_id, author_user_id, author_role, body)
  values (d.id, me, role, trim(p_body)) returning id into new_id;
  update public.booking_disputes set updated_at = now() where id = d.id;
  return new_id;
end $$;

create or replace function public.withdraw_booking_dispute(p_dispute_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.booking_disputes
  set status = 'withdrawn', updated_at = now()
  where id = p_dispute_id and opened_by_user_id = auth.uid() and status in ('open', 'under_review');
  if not found then raise exception 'Only the person who raised an open dispute can withdraw it.' using errcode = 'P0001'; end if;
end $$;

create or replace function public.admin_update_dispute(p_dispute_id uuid, p_status text, p_outcome text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare d record;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into d from public.booking_disputes where id = p_dispute_id for update;
  if not found then raise exception 'Dispute not found.' using errcode = 'P0001'; end if;
  if p_status not in ('open', 'under_review', 'resolved') then raise exception 'Invalid status.' using errcode = '22023'; end if;
  if p_status = 'resolved' and (p_outcome is null or char_length(coalesce(trim(p_note), '')) < 10) then
    raise exception 'Resolving needs an outcome and a note (10+ characters) for both parties.' using errcode = '22023';
  end if;
  if d.status = 'withdrawn' then raise exception 'This dispute was withdrawn.' using errcode = 'P0001'; end if;

  update public.booking_disputes set
    status = p_status,
    outcome = case when p_status = 'resolved' then p_outcome end,
    resolution_note = case when p_status = 'resolved' then trim(p_note) end,
    resolved_by = case when p_status = 'resolved' then auth.uid() end,
    resolved_at = case when p_status = 'resolved' then now() end,
    updated_at = now()
  where id = d.id;

  insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), 'dispute_' || p_status, 'booking_disputes', d.id::text,
          jsonb_build_object('status', d.status, 'outcome', d.outcome),
          jsonb_build_object('status', p_status, 'outcome', case when p_status = 'resolved' then p_outcome end,
                             'note', case when p_status = 'resolved' then left(trim(p_note), 500) end));
end $$;

revoke execute on function public.open_booking_dispute(text, text, text, text) from public, anon;
revoke execute on function public.add_dispute_message(uuid, text) from public, anon;
revoke execute on function public.withdraw_booking_dispute(uuid) from public, anon;
revoke execute on function public.admin_update_dispute(uuid, text, text, text) from public, anon;
grant execute on function public.open_booking_dispute(text, text, text, text) to authenticated;
grant execute on function public.add_dispute_message(uuid, text) to authenticated;
grant execute on function public.withdraw_booking_dispute(uuid) to authenticated;
grant execute on function public.admin_update_dispute(uuid, text, text, text) to authenticated;

-- ── risk monitoring ─────────────────────────────────────────────────────
create table if not exists public.risk_reviews (
  user_id text primary key,
  reviewed_by uuid not null,
  note text not null check (char_length(note) between 1 and 2000),
  reviewed_at timestamptz not null default now()
);
alter table public.risk_reviews enable row level security;
revoke all on public.risk_reviews from anon, authenticated;

create or replace function public.admin_risk_overview(p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz;
  result jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  since := now() - make_interval(days => greatest(7, least(coalesce(p_days, 90), 365)));

  with signals as (
    -- Off-platform contact attempts (messages carrying phone/email/handles).
    -- Older/attachment rows may only carry sender_id (an account id) or an email.
    select coalesce(sender_user_id::text,
                    case when sender_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then lower(sender_id) end,
                    (select u.id from public.users u where lower(u.email) = lower(le.sender_email) limit 1)) as user_id,
           'contact_attempt' as kind, 3 as weight, created_at as at, category as detail
    from public.leakage_events le where created_at >= since
    union all
    -- Reports from other users.
    -- Reports on a listing name the listing, not its owner: resolve through it.
    select coalesce(r.reported_user_id::text,
                    (select sp.owner_user_id::text from public.service_providers sp
                      where r.content_type = 'vendor' and sp.id = r.content_id),
                    (select u.id from public.users u where lower(u.email) = lower(r.reported_email) limit 1)),
           'reported', 4, r.created_at, r.reason
    from public.reports r where r.created_at >= since
    union all
    -- Blocked by another user.
    select coalesce(bu.blocked_user_id::text,
                    (select u.id from public.users u where lower(u.email) = lower(bu.blocked_email) limit 1)),
           'blocked', 2, bu.created_at, null
    from public.blocked_users bu where bu.created_at >= since
    union all
    -- Booking from an accepted quote cancelled within 72 hours: a common
    -- pattern when a deal moves off-platform. Counts for both parties.
    select u.uid::text, 'quick_cancel', 3, b.updated_at, b.id
    from public.bookings b
    cross join lateral (values (b.client_user_id), (b.provider_owner_user_id)) u(uid)
    where b.status = 'cancelled' and b.updated_at - b.created_at < interval '72 hours'
      and b.created_at >= since and u.uid is not null
      and exists (select 1 from public.quote_requests q where q.booking_id = b.id)
    union all
    -- Disputes raised against this user (by the other party).
    select (case when d.opened_by_role = 'customer' then d.vendor_user_id else d.customer_user_id end)::text,
           'dispute_against', 4, d.created_at, d.reason
    from public.booking_disputes d where d.created_at >= since
    union all
    -- Quote-request burst: 15+ requests from one customer in a day.
    select x.uid::text, 'request_burst', 5, x.day, x.n::text
    from (
      select client_user_id as uid, date_trunc('day', created_at) as day, count(*) as n
      from public.quote_requests where created_at >= since and client_user_id is not null
      group by 1, 2 having count(*) >= 15
    ) x
    union all
    -- An ABN used by listings under different owners.
    select sp.owner_user_id::text, 'shared_abn', 6, sp.created_at, sp.abn
    from public.service_providers sp
    where sp.abn is not null and sp.owner_user_id is not null and not sp.is_demo
      and exists (select 1 from public.service_providers o
                  where o.abn = sp.abn and o.owner_user_id is distinct from sp.owner_user_id and not o.is_demo)
  ),
  scored as (
    select s.user_id,
           sum(s.weight) as score,
           max(s.at) as latest_at,
           jsonb_agg(jsonb_build_object('kind', s.kind, 'at', s.at, 'detail', s.detail) order by s.at desc) as evidence
    from signals s where s.user_id is not null group by s.user_id
  )
  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.score desc, r.latest_at desc), '[]'::jsonb) into result
  from (
    select sc.user_id, u.email, u.role, sc.score,
           case when sc.score >= 12 then 'high' when sc.score >= 5 then 'medium' else 'low' end as level,
           sc.latest_at,
           (select jsonb_object_agg(k, n) from (
              select e->>'kind' as k, count(*) as n from jsonb_array_elements(sc.evidence) e group by 1) c) as counts,
           (select jsonb_agg(e) from (select e from jsonb_array_elements(sc.evidence) e limit 12) z) as evidence,
           (select coalesce(jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'status', sp.status)), '[]'::jsonb)
              from public.service_providers sp where sp.owner_user_id::text = sc.user_id) as listings,
           rv.reviewed_at, rv.note as review_note,
           (rv.reviewed_at is not null and rv.reviewed_at >= sc.latest_at) as reviewed
    from scored sc
    left join public.users u on u.id = sc.user_id
    left join public.risk_reviews rv on rv.user_id = sc.user_id
    limit 200
  ) r;
  return result;
end $$;

create or replace function public.admin_mark_risk_reviewed(p_user_id text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  if char_length(coalesce(trim(p_note), '')) = 0 then raise exception 'Add a note about what you found.' using errcode = '22023'; end if;
  insert into public.risk_reviews (user_id, reviewed_by, note, reviewed_at)
  values (p_user_id, auth.uid(), left(trim(p_note), 2000), now())
  on conflict (user_id) do update set reviewed_by = excluded.reviewed_by, note = excluded.note, reviewed_at = now();
  insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), 'risk_reviewed', 'users', p_user_id, '{}'::jsonb, jsonb_build_object('note', left(trim(p_note), 500)));
end $$;

revoke execute on function public.admin_risk_overview(integer) from public, anon;
revoke execute on function public.admin_mark_risk_reviewed(text, text) from public, anon;
grant execute on function public.admin_risk_overview(integer) to authenticated;
grant execute on function public.admin_mark_risk_reviewed(text, text) to authenticated;
