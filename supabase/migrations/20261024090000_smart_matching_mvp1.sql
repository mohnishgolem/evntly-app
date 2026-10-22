-- Smart vendor matching, MVP 1: the data the matching engine needs.
--
--   events            start/end time (Sydney wall-clock) + per-category budgets
--   service_providers travel fees, minimum hours, regional travel, and when
--                     the vendor last touched their calendar
--   vendor_packages   priced packages (integer cents), vendor-managed
--   bookings          start/end time, a generated time slot, and an exclusion
--                     constraint so a vendor can never hold two overlapping
--                     confirmed bookings — enforced by Postgres, so two
--                     simultaneous confirmations can't both succeed
--
-- Everything is additive. Rollback: supabase/rollbacks/20261024090000_smart_matching_mvp1.down.sql

create extension if not exists btree_gist with schema extensions;

-- ── events ──────────────────────────────────────────────────────────────
-- Times are Sydney wall-clock. An end time at or before the start means the
-- event runs past midnight.
alter table public.events add column if not exists start_time time;
alter table public.events add column if not exists end_time time;
alter table public.events drop constraint if exists events_times_pair;
alter table public.events
  add constraint events_times_pair check ((start_time is null) = (end_time is null) and (start_time is null or start_time <> end_time));

-- {"photographer": 100000, …} — the customer's budget for one category, in
-- cents. Categories without an entry share whatever the total has left.
alter table public.events add column if not exists category_budgets jsonb not null default '{}'::jsonb;
alter table public.events drop constraint if exists events_category_budgets_object;
alter table public.events
  add constraint events_category_budgets_object check (jsonb_typeof(category_budgets) = 'object');

-- ── service_providers ───────────────────────────────────────────────────
alter table public.service_providers add column if not exists min_booking_hours numeric(3, 1);
alter table public.service_providers add column if not exists free_travel_km integer not null default 0;
alter table public.service_providers add column if not exists travel_fee_cents_per_km integer not null default 0;
alter table public.service_providers add column if not exists travels_regional boolean not null default false;
alter table public.service_providers add column if not exists availability_confirmed_at timestamptz;

alter table public.service_providers drop constraint if exists service_providers_min_booking_hours_range;
alter table public.service_providers
  add constraint service_providers_min_booking_hours_range
  check (min_booking_hours is null or (min_booking_hours > 0 and min_booking_hours <= 24));
alter table public.service_providers drop constraint if exists service_providers_travel_ranges;
alter table public.service_providers
  add constraint service_providers_travel_ranges
  check (free_travel_km between 0 and 1000 and travel_fee_cents_per_km between 0 and 2000);
alter table public.service_providers drop constraint if exists service_providers_radius_range;
alter table public.service_providers
  add constraint service_providers_radius_range
  check (service_radius_km is null or (service_radius_km >= 1 and service_radius_km <= 1000));

-- Public listing columns are granted one by one (contact details are not).
grant select (min_booking_hours, free_travel_km, travel_fee_cents_per_km, travels_regional, availability_confirmed_at)
  on public.service_providers to anon, authenticated;

-- "Calendar last updated" is always the server's clock: any change to the
-- vendor's availability (or a deliberate "still up to date" touch) stamps
-- now(), so a vendor can't post-date it to look permanently current.
create or replace function public.stamp_availability_confirmed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.availability_confirmed_at := null;
  elsif new.availability_confirmed_at is distinct from old.availability_confirmed_at
     or new.unavailable_dates is distinct from old.unavailable_dates
     or new.weekly_unavailable_days is distinct from old.weekly_unavailable_days
     or new.available is distinct from old.available then
    new.availability_confirmed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists stamp_availability_confirmed on public.service_providers;
create trigger stamp_availability_confirmed
  before insert or update on public.service_providers
  for each row execute function public.stamp_availability_confirmed();

revoke execute on function public.stamp_availability_confirmed() from public, anon, authenticated;

create index if not exists service_providers_status_type_idx on public.service_providers (status, service_type);

-- ── vendor_packages ─────────────────────────────────────────────────────
create table if not exists public.vendor_packages (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.service_providers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 1000),
  price_cents integer not null check (price_cents between 100 and 10000000),
  -- null = a flat package that isn't sold by the hour (e.g. a floral set).
  included_hours numeric(4, 1) check (included_hours is null or (included_hours > 0 and included_hours <= 72)),
  extra_hour_cents integer check (extra_hour_cents is null or extra_hour_cents between 100 and 1000000),
  inclusions text[] not null default '{}' check (cardinality(inclusions) <= 20),
  delivery_days integer check (delivery_days is null or delivery_days between 0 and 365),
  deposit_percent integer check (deposit_percent is null or deposit_percent between 0 and 100),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_packages_provider_idx on public.vendor_packages (provider_id);

alter table public.vendor_packages enable row level security;
revoke all on public.vendor_packages from anon, authenticated;
grant select on public.vendor_packages to anon, authenticated;
grant insert, update, delete on public.vendor_packages to authenticated;

-- Anyone sees active packages on approved listings; owners see all of
-- theirs; admins see everything.
drop policy if exists vendor_packages_select on public.vendor_packages;
create policy vendor_packages_select on public.vendor_packages
  for select to anon, authenticated
  using (
    (active and exists (select 1 from public.service_providers sp where sp.id = provider_id and sp.status = 'approved'))
    or (select public.owns_service_provider(provider_id))
    or (select public.is_admin())
  );

drop policy if exists vendor_packages_owner_write on public.vendor_packages;
create policy vendor_packages_owner_write on public.vendor_packages
  for all to authenticated
  using ((select public.owns_service_provider(provider_id)))
  with check ((select public.owns_service_provider(provider_id)));

create or replace function public.guard_vendor_package()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.provider_id is distinct from old.provider_id then
    raise exception 'A package can''t be moved to another listing.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.vendor_packages where provider_id = new.provider_id) >= 12 then
    raise exception 'A listing can have up to 12 packages.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(new.inclusions) i where char_length(i) not between 1 and 120) then
    raise exception 'Each inclusion must be 1–120 characters.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists guard_vendor_package on public.vendor_packages;
create trigger guard_vendor_package
  before insert or update on public.vendor_packages
  for each row execute function public.guard_vendor_package();

revoke execute on function public.guard_vendor_package() from public, anon, authenticated;

-- ── bookings: time slots + no double booking ────────────────────────────
alter table public.bookings add column if not exists start_time time;
alter table public.bookings add column if not exists end_time time;

-- Sydney wall-clock range the vendor is committed for. Unknown times block
-- the whole day — the safe default for an overlap check.
alter table public.bookings add column if not exists slot tsrange generated always as (
  case
    when start_time is null then tsrange(event_date::timestamp, (event_date + 1)::timestamp, '[)')
    when end_time is not null and end_time > start_time then tsrange(event_date + start_time, event_date + end_time, '[)')
    when end_time is not null then tsrange(event_date + start_time, (event_date + 1) + end_time, '[)')
    when duration_hours > 0 then
      tsrange(event_date + start_time, event_date + start_time + (duration_hours::double precision * interval '1 hour'), '[)')
    else tsrange(event_date::timestamp, (event_date + 1)::timestamp, '[)')
  end
) stored;

alter table public.bookings drop constraint if exists bookings_vendor_no_overlap;
alter table public.bookings
  add constraint bookings_vendor_no_overlap
  exclude using gist (provider_id with =, slot with &&)
  where (status in ('confirmed', 'completed'));

create index if not exists bookings_provider_date_idx on public.bookings (provider_id, event_date);

-- Times (and duration) are part of the agreement: only the booking flow sets
-- them. Same rules as before, plus those three columns.
create or replace function public.enforce_bookings_lockdown()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare actor uuid := auth.uid();
begin
  if is_admin() or is_privileged_writer() then return new; end if;
  if new.total_price is distinct from old.total_price or new.commission_percent is distinct from old.commission_percent
     or new.escrow_status is distinct from old.escrow_status or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     or new.stripe_session_id is distinct from old.stripe_session_id or new.provider_id is distinct from old.provider_id
     or new.provider_owner_email is distinct from old.provider_owner_email or new.client_email is distinct from old.client_email
     or new.event_id is distinct from old.event_id or new.service_type is distinct from old.service_type
     or new.event_date is distinct from old.event_date
     or new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time
     or new.duration_hours is distinct from old.duration_hours then
    raise exception 'Not authorized to change this field on a booking';
  end if;
  if new.status is distinct from old.status then
    if actor = old.provider_owner_user_id then
      if new.status not in ('confirmed', 'completed', 'cancelled') then raise exception 'Invalid status transition for vendor'; end if;
    elsif actor = old.client_user_id then
      if new.status not in ('cancelled') then raise exception 'Invalid status transition for customer'; end if;
    else
      raise exception 'Not authorized to change booking status';
    end if;
  end if;
  return new;
end;
$function$;

-- Accepting a quote copies the event's times onto the booking, so the
-- overlap constraint knows how long the vendor is committed for.
create or replace function public.accept_quote(p_quote_id text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare q public.quote_requests; ev record; new_booking_id text;
begin
  select * into q from public.quote_requests where id = p_quote_id and client_user_id = auth.uid() for update;
  if not found then raise exception 'Quote request not found.'; end if;
  if q.status = 'expired' or (q.status in ('pending', 'quoted') and q.expires_at is not null and q.expires_at <= now()) then
    raise exception 'This quote has expired. Ask the vendor for a new one.';
  end if;
  if q.status <> 'quoted' or q.quoted_amount is null then raise exception 'This quote isn''t ready to accept yet.'; end if;
  select e.start_time, e.end_time into ev from public.events e where e.id = q.event_id and e.event_date = q.event_date;
  insert into public.bookings (provider_id, provider_name, provider_owner_email, service_type, event_date,
    total_price, status, escrow_status, client_email, client_name, event_address, event_id, notes,
    start_time, end_time, duration_hours)
  values (q.vendor_id, q.vendor_name, public.current_email(q.vendor_user_id, q.vendor_email),
    coalesce(q.service_type, 'event_planner'), q.event_date, q.quoted_amount, 'pending', 'unpaid',
    public.current_email(q.client_user_id, q.client_email), q.client_name, q.location, q.event_id, q.details,
    ev.start_time, ev.end_time, q.estimated_hours)
  returning id into new_booking_id;
  update public.quote_requests set status = 'accepted', booking_id = new_booking_id where id = q.id;
  return new_booking_id;
end;
$function$;

-- Confirmed time slots overlapping a window, for matching. Exposes only
-- "vendor X is busy then" — never who booked them or for what. The window is
-- capped so it can't be used to dump a vendor's whole schedule in one call.
create or replace function public.vendor_busy_slots(p_from timestamp, p_to timestamp)
returns table (provider_id text, slot_start timestamp, slot_end timestamp)
language sql
stable
security definer
set search_path = ''
as $$
  select b.provider_id, lower(b.slot), upper(b.slot)
  from public.bookings b
  where auth.uid() is not null
    and p_to > p_from
    and p_to - p_from <= interval '3 days'
    and b.status in ('confirmed', 'completed')
    and b.slot && tsrange(p_from, p_to, '[)');
$$;

revoke execute on function public.vendor_busy_slots(timestamp, timestamp) from public, anon;
grant execute on function public.vendor_busy_slots(timestamp, timestamp) to authenticated;

-- ── quote_requests ──────────────────────────────────────────────────────
create index if not exists quote_requests_event_idx on public.quote_requests (event_id);
create index if not exists quote_requests_vendor_status_idx on public.quote_requests (vendor_id, status);

-- ── settings ────────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('smart_matching_enabled', 'true'),
  ('match_weights', '{"suitability":30,"budget":25,"quality":20,"location":15,"reliability":10}')
on conflict (key) do nothing;

-- The two non-secret matching settings, for signed-in pages. app_settings
-- itself stays service-role only (it also holds secrets).
create or replace function public.matching_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce((select value from public.app_settings where key = 'smart_matching_enabled'), 'true') = 'true',
    'weights', (select value::jsonb from public.app_settings where key = 'match_weights')
  );
$$;

revoke execute on function public.matching_settings() from public, anon;
grant execute on function public.matching_settings() to authenticated;
