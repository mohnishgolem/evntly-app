-- Event Board: per-event vendor shortlists, an optional event name, the
-- event's approximate location for matching vendors by service area, and
-- admin read access for support.
--
-- Quotes, bookings and payments are NOT duplicated here — the board reads
-- quote_requests / bookings / payment_plans by event_id. A shortlist row is
-- only the organiser's private "I'm considering this vendor" marker; vendors
-- never see it (they see enquiries once a quote is requested).

-- ── events ──────────────────────────────────────────────────────────────
alter table public.events add column if not exists name text;
alter table public.events drop constraint if exists events_name_length;
alter table public.events
  add constraint events_name_length check (name is null or char_length(name) between 1 and 80);

-- Suburb-level only (geocoded from events.suburb), rounded like vendor pins.
alter table public.events add column if not exists latitude double precision;
alter table public.events add column if not exists longitude double precision;

create or replace function public.coarsen_event_coordinates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.latitude := round(new.latitude::numeric, 2)::double precision;
  new.longitude := round(new.longitude::numeric, 2)::double precision;
  return new;
end $$;

drop trigger if exists coarsen_event_coordinates on public.events;
create trigger coarsen_event_coordinates
  before insert or update of latitude, longitude on public.events
  for each row execute function public.coarsen_event_coordinates();

revoke execute on function public.coarsen_event_coordinates() from public, anon, authenticated;

-- Admins can read every event (support, oversight). Writes stay owner-only.
drop policy if exists events_select_admin on public.events;
create policy events_select_admin on public.events
  for select to authenticated
  using ((select public.is_admin()));

drop policy if exists event_budget_items_admin_read on public.event_budget_items;
create policy event_budget_items_admin_read on public.event_budget_items
  for select to authenticated
  using ((select public.is_admin()));

-- ── event_vendors (shortlist) ───────────────────────────────────────────
create table if not exists public.event_vendors (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  provider_id text not null references public.service_providers (id) on delete cascade,
  -- Copied from the listing by trigger, so the board can group without a join.
  service_type text not null,
  organiser_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, provider_id)
);

create index if not exists event_vendors_event_idx on public.event_vendors (event_id);
create index if not exists event_vendors_provider_idx on public.event_vendors (provider_id);

alter table public.event_vendors enable row level security;

revoke all on public.event_vendors from anon, authenticated;
grant select, insert, delete on public.event_vendors to authenticated;

drop policy if exists event_vendors_own on public.event_vendors;
create policy event_vendors_own on public.event_vendors
  for all to authenticated
  using (
    organiser_user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and e.organiser_user_id = (select auth.uid()))
  )
  with check (
    organiser_user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and e.organiser_user_id = (select auth.uid()))
  );

drop policy if exists event_vendors_admin_read on public.event_vendors;
create policy event_vendors_admin_read on public.event_vendors
  for select to authenticated
  using ((select public.is_admin()));

-- Only approved listings can be shortlisted, and service_type always comes
-- from the listing rather than the client.
create or replace function public.fill_event_vendor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  select sp.service_type into v_type
  from public.service_providers sp
  where sp.id = new.provider_id and sp.status = 'approved';

  if v_type is null then
    raise exception 'That vendor is not available.' using errcode = 'P0001';
  end if;

  new.service_type := v_type;
  new.organiser_user_id := auth.uid();
  return new;
end $$;

drop trigger if exists fill_event_vendor on public.event_vendors;
create trigger fill_event_vendor
  before insert on public.event_vendors
  for each row execute function public.fill_event_vendor();

revoke execute on function public.fill_event_vendor() from public, anon, authenticated;

-- ── availability ────────────────────────────────────────────────────────
-- Vendors already booked (confirmed) on a date. Customers can't read other
-- people's bookings, so this exposes only "busy that day" — nothing about
-- who booked them or for what.
create or replace function public.booked_vendor_ids_on(p_date date)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct b.provider_id
  from public.bookings b
  where b.event_date = p_date
    and b.status in ('confirmed', 'completed')
    and auth.uid() is not null;
$$;

revoke execute on function public.booked_vendor_ids_on(date) from public, anon;
grant execute on function public.booked_vendor_ids_on(date) to authenticated;
