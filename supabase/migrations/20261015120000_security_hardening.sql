-- Security hardening (2026-10-15). Verified on a production-equivalent branch
-- (security_regression.sql: 23/23 PASS; legit_flows_regression.sql: all PASS).
--
-- Theme: RLS decided WHO may write a row, but INSERTs had no guard on WHAT
-- they contained (update "lockdown" triggers only covered UPDATE). Anyone with
-- the public anon key can call PostgREST directly, so every rule the app UI
-- applies must also hold here.
--
-- "Privileged" = the service role, or SECURITY DEFINER functions (accept_quote,
-- book_bundle, accept_event_application, rating recalculation, …), whose
-- statements run as the function owner rather than as authenticated/anon.

create or replace function public.is_privileged_writer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('authenticated', 'anon')
      or coalesce(auth.role(), '') = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- 1. CRITICAL: signup could self-assign role=admin via user metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.users (id, email, role)
  values (
    new.id::text,
    new.email,
    -- Only the two self-service roles may come from signup metadata.
    case when new.raw_user_meta_data ->> 'role' = 'vendor' then 'vendor' else 'customer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.guard_users_insert()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  if coalesce(new.role, 'customer') not in ('customer', 'vendor') then
    raise exception 'Not authorized to set role';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_users_insert_guard on public.users;
create trigger trg_users_insert_guard before insert on public.users
  for each row execute function public.guard_users_insert();

-- ---------------------------------------------------------------------------
-- 2. CRITICAL: new listings could be inserted already approved, verified and
--    with fake ratings; owners could edit rating/verified fields later.
-- ---------------------------------------------------------------------------
create or replace function public.guard_service_providers_insert()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  new.status := 'pending_review';
  new.rating := 0;
  new.rating_sum := 0;
  new.review_count := 0;
  new.verified := false;
  new.founding_vendor := false;
  new.acceptance_rate := null;
  new.avg_response_hours := null;
  return new;
end;
$$;
drop trigger if exists trg_service_providers_insert_guard on public.service_providers;
create trigger trg_service_providers_insert_guard before insert on public.service_providers
  for each row execute function public.guard_service_providers_insert();

create or replace function public.enforce_service_providers_lockdown()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  -- Rating recalculation runs inside a SECURITY DEFINER trigger.
  if public.is_privileged_writer() or is_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Not authorized to change listing status';
  end if;
  if new.owner_email is distinct from old.owner_email
     or new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Not authorized to reassign listing ownership';
  end if;
  if new.rating is distinct from old.rating
     or new.rating_sum is distinct from old.rating_sum
     or new.review_count is distinct from old.review_count
     or new.verified is distinct from old.verified
     or new.founding_vendor is distinct from old.founding_vendor
     or new.acceptance_rate is distinct from old.acceptance_rate
     or new.avg_response_hours is distinct from old.avg_response_hours then
    raise exception 'Not authorized to change ratings or verification';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. CRITICAL: bookings (and bundle bookings, their line items, group chat
--    threads) could be inserted directly — e.g. "confirmed", $1, escrow
--    "released", against any vendor. They are only ever created by
--    accept_quote / accept_event_application / book_bundle.
-- ---------------------------------------------------------------------------
create or replace function public.reject_direct_insert()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  raise exception '% can only be created through the booking flow', tg_table_name;
end;
$$;

drop trigger if exists trg_bookings_insert_guard on public.bookings;
create trigger trg_bookings_insert_guard before insert on public.bookings
  for each row execute function public.reject_direct_insert();
drop trigger if exists trg_bundle_bookings_insert_guard on public.bundle_bookings;
create trigger trg_bundle_bookings_insert_guard before insert on public.bundle_bookings
  for each row execute function public.reject_direct_insert();
drop trigger if exists trg_bundle_booking_items_insert_guard on public.bundle_booking_items;
create trigger trg_bundle_booking_items_insert_guard before insert on public.bundle_booking_items
  for each row execute function public.reject_direct_insert();
drop trigger if exists trg_group_chat_threads_insert_guard on public.group_chat_threads;
create trigger trg_group_chat_threads_insert_guard before insert on public.group_chat_threads
  for each row execute function public.reject_direct_insert();

-- ---------------------------------------------------------------------------
-- 4. HIGH: a customer could insert a quote request already "quoted" at a
--    price they chose, then accept it into a booking.
-- ---------------------------------------------------------------------------
create or replace function public.guard_quote_requests_insert()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  new.status := 'pending';
  new.quoted_amount := null;
  new.vendor_note := null;
  new.booking_id := null;
  new.stripe_session_id := null;
  -- Throttle: 20 requests per hour per customer.
  if (select count(*) from public.quote_requests q
      where q.client_user_id = auth.uid() and q.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many quote requests. Please try again later.';
  end if;
  return new;
end;
$$;
-- Named to fire after trg_quote_requests_fill_vendor and before
-- trg_quote_requests_set_expiry (triggers fire in name order).
drop trigger if exists trg_quote_requests_insert_guard on public.quote_requests;
create trigger trg_quote_requests_insert_guard before insert on public.quote_requests
  for each row execute function public.guard_quote_requests_insert();

-- ---------------------------------------------------------------------------
-- 5. HIGH: reviews needed no booking, had no rating range, and could be
--    re-pointed at another vendor after posting.
-- ---------------------------------------------------------------------------
create or replace function public.guard_reviews_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() or coalesce(auth.role(), '') = 'service_role' then return new; end if;

  if new.rating is null or new.rating <> trunc(new.rating) or new.rating < 1 or new.rating > 5 then
    raise exception 'Rating must be a whole number from 1 to 5';
  end if;

  if tg_op = 'UPDATE' then
    if new.provider_id is distinct from old.provider_id
       or new.booking_id is distinct from old.booking_id
       or new.reviewer_email is distinct from old.reviewer_email
       or new.reviewer_user_id is distinct from old.reviewer_user_id then
      raise exception 'Not authorized to change this field on a review';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from public.bookings b
    where b.id = new.booking_id
      and b.provider_id = new.provider_id
      and b.client_user_id = auth.uid()
      and b.status = 'completed'
  ) then
    raise exception 'You can only review a vendor after a completed booking';
  end if;
  if exists (
    select 1 from public.reviews r
    where r.booking_id = new.booking_id and r.reviewer_user_id = auth.uid()
  ) then
    raise exception 'You have already reviewed this booking';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reviews_write_guard on public.reviews;
create trigger trg_reviews_write_guard before insert or update on public.reviews
  for each row execute function public.guard_reviews_write();

-- ---------------------------------------------------------------------------
-- 6. HIGH: bundles could be created already "active", listing other vendors
--    as having accepted, and the initiator could flip status to active
--    without everyone accepting.
-- ---------------------------------------------------------------------------
create or replace function public.guard_combined_packages_insert()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  if not exists (
    select 1 from public.service_providers sp
    where sp.id = new.initiating_vendor_id and sp.owner_user_id = auth.uid()
  ) then
    raise exception 'You can only create bundles for your own listing';
  end if;
  -- Becomes active only once every participant (including the initiator's
  -- own row) has accepted — see sync_combined_package_status.
  new.status := 'pending';
  if coalesce(new.bundle_discount_amount, 0) < 0 then
    raise exception 'Bundle discount cannot be negative';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_combined_packages_insert_guard on public.combined_packages;
create trigger trg_combined_packages_insert_guard before insert on public.combined_packages
  for each row execute function public.guard_combined_packages_insert();

create or replace function public.enforce_combined_packages_lockdown()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if public.is_privileged_writer() or is_admin() then
    return new;
  end if;

  if new.total_price is distinct from old.total_price
     or new.bundle_discount_amount is distinct from old.bundle_discount_amount
     or new.initiating_vendor_email is distinct from old.initiating_vendor_email
     or new.initiating_vendor_id is distinct from old.initiating_vendor_id
     or new.participant_emails is distinct from old.participant_emails
  then
    raise exception 'Not authorized to change this field on a bundle';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'active' and exists (
      select 1 from public.combined_package_participants p
      where p.combined_package_id = new.id and p.acceptance_status <> 'accepted'
    ) then
      raise exception 'Every vendor must accept before the bundle goes live';
    end if;
    if new.status not in ('active', 'cancelled', 'pending') then
      raise exception 'Invalid bundle status';
    end if;
  end if;

  return new;
end;
$$;

-- Fires after zz_sync_user_ids so vendor_user_id is already resolved.
create or replace function public.guard_combined_package_participants_insert()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  if not exists (
    select 1 from public.combined_packages c
    where c.id = new.combined_package_id
      and c.initiating_vendor_user_id = auth.uid()
      and c.status = 'pending'
  ) then
    raise exception 'Only the bundle''s creator can add vendors, before it goes live';
  end if;
  new.is_initiator := new.vendor_user_id is not distinct from auth.uid();
  -- Nobody can accept on another vendor's behalf.
  if not new.is_initiator then
    new.acceptance_status := 'pending';
  end if;
  if coalesce(new.component_price, 0) < 0 then
    raise exception 'Component price cannot be negative';
  end if;
  return new;
end;
$$;
drop trigger if exists zzz_combined_package_participants_insert_guard on public.combined_package_participants;
create trigger zzz_combined_package_participants_insert_guard before insert on public.combined_package_participants
  for each row execute function public.guard_combined_package_participants_insert();

-- Activation/cancellation happens server-side when invitees respond (the
-- invitee can't update the package row under RLS, so the app's own update
-- silently did nothing). total_price is recomputed from the accepted
-- component prices rather than trusted from the browser.
create or replace function public.sync_combined_package_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare pkg_id text := coalesce(new.combined_package_id, old.combined_package_id);
begin
  if exists (select 1 from public.combined_package_participants
             where combined_package_id = pkg_id and acceptance_status = 'declined') then
    update public.combined_packages set status = 'cancelled'
    where id = pkg_id and status = 'pending';
  elsif not exists (select 1 from public.combined_package_participants
                    where combined_package_id = pkg_id and acceptance_status <> 'accepted') then
    update public.combined_packages c
    set status = 'active',
        total_price = (select coalesce(sum(component_price), 0)
                       from public.combined_package_participants where combined_package_id = pkg_id)
    where c.id = pkg_id and c.status = 'pending';
  end if;
  return null;
end;
$$;
drop trigger if exists trg_combined_package_participants_sync_status on public.combined_package_participants;
create trigger trg_combined_package_participants_sync_status
  after insert or update of acceptance_status on public.combined_package_participants
  for each row execute function public.sync_combined_package_status();

-- ---------------------------------------------------------------------------
-- 7. MEDIUM: portfolio items could be attached to another vendor's listing.
-- ---------------------------------------------------------------------------
create or replace function public.guard_portfolio_items_write()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  if not exists (
    select 1 from public.service_providers sp
    where sp.id = new.provider_id and sp.owner_user_id = auth.uid()
  ) then
    raise exception 'You can only add portfolio items to your own listing';
  end if;
  if new.media_url !~ '^https://' then
    raise exception 'Portfolio media must be an https URL';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_portfolio_items_write_guard on public.portfolio_items;
create trigger trg_portfolio_items_write_guard before insert or update on public.portfolio_items
  for each row execute function public.guard_portfolio_items_write();

-- ---------------------------------------------------------------------------
-- 8. MEDIUM: job cards could be inserted for arbitrary bookings. They're
--    created when a vendor confirms a booking; only allow that shape.
-- ---------------------------------------------------------------------------
create or replace function public.guard_job_cards_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if not exists (
    select 1 from public.bookings b
    where b.id = new.booking_id
      and b.status = 'confirmed'
      and auth.uid() in (b.provider_owner_user_id, b.client_user_id)
  ) then
    raise exception 'Job cards are created when a booking is confirmed';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_job_cards_insert_guard on public.job_cards;
create trigger trg_job_cards_insert_guard before insert on public.job_cards
  for each row execute function public.guard_job_cards_insert();

-- Event applications always start pending (accepting goes through
-- accept_event_application).
create or replace function public.guard_event_applications_insert()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  new.status := 'pending';
  return new;
end;
$$;
drop trigger if exists trg_event_applications_insert_guard on public.event_applications;
create trigger trg_event_applications_insert_guard before insert on public.event_applications
  for each row execute function public.guard_event_applications_insert();

-- ---------------------------------------------------------------------------
-- 9. MEDIUM: spam throttles that also hold for direct API calls.
-- ---------------------------------------------------------------------------
create or replace function public.throttle_user_inserts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recent integer;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if tg_table_name = 'messages' then
    select count(*) into recent from public.messages
    where sender_user_id = auth.uid() and created_at > now() - interval '1 minute';
    if recent >= 30 then raise exception 'You''re sending messages too quickly. Please slow down.'; end if;
    if char_length(coalesce(new.content, '')) > 5000 then raise exception 'Message is too long'; end if;
  elsif tg_table_name = 'group_chat_messages' then
    select count(*) into recent from public.group_chat_messages
    where sender_user_id = auth.uid() and created_at > now() - interval '1 minute';
    if recent >= 30 then raise exception 'You''re sending messages too quickly. Please slow down.'; end if;
  elsif tg_table_name = 'reports' then
    select count(*) into recent from public.reports
    where reporter_user_id = auth.uid() and created_at > now() - interval '1 hour';
    if recent >= 10 then raise exception 'Too many reports. Please try again later.'; end if;
  elsif tg_table_name = 'reviews' then
    select count(*) into recent from public.reviews
    where reviewer_user_id = auth.uid() and created_at > now() - interval '1 hour';
    if recent >= 10 then raise exception 'Too many reviews. Please try again later.'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_messages_throttle on public.messages;
create trigger trg_messages_throttle before insert on public.messages
  for each row execute function public.throttle_user_inserts();
drop trigger if exists trg_group_chat_messages_throttle on public.group_chat_messages;
create trigger trg_group_chat_messages_throttle before insert on public.group_chat_messages
  for each row execute function public.throttle_user_inserts();
drop trigger if exists trg_reports_throttle on public.reports;
create trigger trg_reports_throttle before insert on public.reports
  for each row execute function public.throttle_user_inserts();
drop trigger if exists trg_reviews_throttle on public.reviews;
create trigger trg_reviews_throttle before insert on public.reviews
  for each row execute function public.throttle_user_inserts();

-- IP/email-keyed limits for login, signup and password reset (called from
-- server actions with the service role — see src/lib/rate-limit.ts). Not
-- callable by anon/authenticated, so nobody can burn someone else's quota.
create unique index if not exists rate_limit_buckets_bucket_key_key
  on public.rate_limit_buckets (bucket_key);

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- rate_limit_buckets.timestamps is bigint[] of epoch milliseconds.
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  cutoff bigint := now_ms - p_window_seconds::bigint * 1000;
  kept bigint[];
begin
  insert into public.rate_limit_buckets (bucket_key, timestamps)
  values (p_key, '{}')
  on conflict (bucket_key) do nothing;

  select coalesce(array_agg(t order by t), '{}') into kept
  from public.rate_limit_buckets b, unnest(b.timestamps) as t
  where b.bucket_key = p_key and t > cutoff;

  if coalesce(array_length(kept, 1), 0) >= p_max then
    update public.rate_limit_buckets set timestamps = kept, updated_at = now() where bucket_key = p_key;
    return false;
  end if;

  update public.rate_limit_buckets
  set timestamps = kept || now_ms, updated_at = now()
  where bucket_key = p_key;
  return true;
end;
$$;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Housekeeping: drop idle buckets daily (pg_cron is already enabled for
-- quote expiry).
select cron.schedule(
  'prune-rate-limit-buckets',
  '17 3 * * *',
  $$delete from public.rate_limit_buckets where updated_at < now() - interval '2 days'$$
);

-- ---------------------------------------------------------------------------
-- 10. Admin audit log: who changed roles, listing status and reports.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  action text not null,
  target_table text not null,
  target_id text not null,
  old_value jsonb,
  new_value jsonb
);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
drop policy if exists admin_audit_log_select_admin on public.admin_audit_log;
create policy admin_audit_log_select_admin on public.admin_audit_log
  for select using (public.is_admin());

create or replace function public.log_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Nested IFs: PL/pgSQL resolves new.<field> even inside an AND that would
  -- be false, so new.role must only be referenced on the users table.
  if tg_table_name = 'users' then
    if new.role is distinct from old.role then
      insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
      values (auth.uid(), 'role_change', 'users', new.id,
              jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
    end if;
  elsif new.status is distinct from old.status then
    insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
    values (auth.uid(),
            case tg_table_name when 'service_providers' then 'listing_status' else 'report_status' end,
            tg_table_name, new.id,
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return null;
end;
$$;
drop trigger if exists trg_users_audit on public.users;
create trigger trg_users_audit after update of role on public.users
  for each row execute function public.log_admin_change();
drop trigger if exists trg_service_providers_audit on public.service_providers;
create trigger trg_service_providers_audit after update of status on public.service_providers
  for each row execute function public.log_admin_change();
drop trigger if exists trg_reports_audit on public.reports;
create trigger trg_reports_audit after update of status on public.reports
  for each row execute function public.log_admin_change();

-- Data-level sanity checks (NOT VALID: existing rows aren't re-checked, new
-- writes are).
alter table public.reviews drop constraint if exists reviews_rating_range;
alter table public.reviews add constraint reviews_rating_range check (rating between 1 and 5) not valid;
alter table public.bookings drop constraint if exists bookings_total_price_nonneg;
alter table public.bookings add constraint bookings_total_price_nonneg check (total_price is null or total_price >= 0) not valid;
alter table public.quote_requests drop constraint if exists quote_requests_quoted_amount_positive;
alter table public.quote_requests add constraint quote_requests_quoted_amount_positive check (quoted_amount is null or quoted_amount > 0) not valid;

-- Trigger/helper functions are not API endpoints.
revoke execute on function
  public.guard_users_insert(), public.guard_service_providers_insert(), public.reject_direct_insert(),
  public.guard_quote_requests_insert(), public.guard_reviews_write(), public.guard_combined_packages_insert(),
  public.guard_combined_package_participants_insert(), public.sync_combined_package_status(),
  public.guard_portfolio_items_write(), public.guard_job_cards_insert(), public.guard_event_applications_insert(),
  public.throttle_user_inserts(), public.log_admin_change()
from public, anon, authenticated;
