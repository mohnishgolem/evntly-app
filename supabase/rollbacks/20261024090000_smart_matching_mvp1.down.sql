-- Undo 20261024090000_smart_matching_mvp1.sql. Drops the new columns and
-- the packages table (vendor-entered package data is lost — export first if
-- any exists) and restores the previous accept_quote / bookings lockdown.
-- Turning matching off without data loss: set app_settings
-- smart_matching_enabled = 'false' instead.

drop function if exists public.matching_settings();
delete from public.app_settings where key in ('smart_matching_enabled', 'match_weights');

drop function if exists public.vendor_busy_slots(timestamp, timestamp);

create or replace function public.accept_quote(p_quote_id text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare q public.quote_requests; new_booking_id text;
begin
  select * into q from public.quote_requests where id = p_quote_id and client_user_id = auth.uid() for update;
  if not found then raise exception 'Quote request not found.'; end if;
  if q.status = 'expired' or (q.status in ('pending', 'quoted') and q.expires_at is not null and q.expires_at <= now()) then
    raise exception 'This quote has expired. Ask the vendor for a new one.';
  end if;
  if q.status <> 'quoted' or q.quoted_amount is null then raise exception 'This quote isn''t ready to accept yet.'; end if;
  insert into public.bookings (provider_id, provider_name, provider_owner_email, service_type, event_date,
    total_price, status, escrow_status, client_email, client_name, event_address, event_id, notes)
  values (q.vendor_id, q.vendor_name, public.current_email(q.vendor_user_id, q.vendor_email),
    coalesce(q.service_type, 'event_planner'), q.event_date, q.quoted_amount, 'pending', 'unpaid',
    public.current_email(q.client_user_id, q.client_email), q.client_name, q.location, q.event_id, q.details)
  returning id into new_booking_id;
  update public.quote_requests set status = 'accepted', booking_id = new_booking_id where id = q.id;
  return new_booking_id;
end;
$function$;

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
     or new.event_date is distinct from old.event_date then
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

alter table public.bookings drop constraint if exists bookings_vendor_no_overlap;
alter table public.bookings drop column if exists slot;
alter table public.bookings drop column if exists start_time;
alter table public.bookings drop column if exists end_time;
drop index if exists public.bookings_provider_date_idx;

drop table if exists public.vendor_packages;
drop function if exists public.guard_vendor_package();

drop trigger if exists stamp_availability_confirmed on public.service_providers;
drop function if exists public.stamp_availability_confirmed();
alter table public.service_providers drop constraint if exists service_providers_min_booking_hours_range;
alter table public.service_providers drop constraint if exists service_providers_travel_ranges;
alter table public.service_providers drop constraint if exists service_providers_radius_range;
alter table public.service_providers drop column if exists min_booking_hours;
alter table public.service_providers drop column if exists free_travel_km;
alter table public.service_providers drop column if exists travel_fee_cents_per_km;
alter table public.service_providers drop column if exists travels_regional;
alter table public.service_providers drop column if exists availability_confirmed_at;
drop index if exists public.service_providers_status_type_idx;

alter table public.events drop constraint if exists events_times_pair;
alter table public.events drop constraint if exists events_category_budgets_object;
alter table public.events drop column if exists start_time;
alter table public.events drop column if exists end_time;
alter table public.events drop column if exists category_budgets;

drop index if exists public.quote_requests_event_idx;
drop index if exists public.quote_requests_vendor_status_idx;
-- btree_gist is left installed (harmless, may be used elsewhere).
