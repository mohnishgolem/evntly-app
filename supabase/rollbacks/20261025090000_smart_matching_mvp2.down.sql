-- Undo 20261025090000_smart_matching_mvp2.sql. Structured quote details and
-- match scores on existing requests are lost (quoted_amount and vendor_note
-- stay). Restores the MVP-1-era insert guard and lockdown.

drop trigger if exists trg_quote_requests_invite_guard on public.quote_requests;
drop function if exists public.guard_quote_request_invites();
drop index if exists public.quote_requests_live_invite_uniq;

create or replace function public.guard_quote_requests_insert()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  new.status := 'pending';
  new.quoted_amount := null;
  new.vendor_note := null;
  new.booking_id := null;
  new.stripe_session_id := null;
  if (select count(*) from public.quote_requests q
      where q.client_user_id = auth.uid() and q.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many quote requests. Please try again later.';
  end if;
  return new;
end;
$function$;

create or replace function public.enforce_quote_requests_lockdown()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  actor uuid := auth.uid();
  is_expired boolean := old.status in ('pending', 'quoted') and old.expires_at is not null and old.expires_at <= now();
begin
  if new.status is distinct from old.status and new.status = 'expired' then
    if not is_expired then raise exception 'This quote request has not expired'; end if;
    if row(new.quoted_amount, new.vendor_note, new.booking_id) is distinct from row(old.quoted_amount, old.vendor_note, old.booking_id) then
      raise exception 'Only the status can change when a quote expires';
    end if;
    return new;
  end if;
  if is_expired and new.status is distinct from old.status and not (new.status = 'cancelled' and actor = old.client_user_id) then
    raise exception 'This quote request has expired';
  end if;
  if is_admin() then return new; end if;
  if new.client_email is distinct from old.client_email or new.vendor_email is distinct from old.vendor_email
     or new.vendor_id is distinct from old.vendor_id or new.event_id is distinct from old.event_id
     or new.service_type is distinct from old.service_type or new.event_date is distinct from old.event_date
     or new.location is distinct from old.location or new.details is distinct from old.details
     or new.budget_range is distinct from old.budget_range or new.estimated_guests is distinct from old.estimated_guests then
    raise exception 'Not authorized to change this field on a quote request';
  end if;
  if (new.quoted_amount is distinct from old.quoted_amount or new.vendor_note is distinct from old.vendor_note)
     and actor is distinct from old.vendor_user_id then
    raise exception 'Only the vendor can set the quoted amount';
  end if;
  if new.booking_id is distinct from old.booking_id and actor is distinct from old.client_user_id then
    raise exception 'Not authorized to set booking_id';
  end if;
  if new.status is distinct from old.status then
    if actor = old.vendor_user_id then
      if new.status not in ('quoted', 'declined') then raise exception 'Invalid status transition for vendor'; end if;
    elsif actor = old.client_user_id then
      if new.status not in ('accepted', 'cancelled') then raise exception 'Invalid status transition for customer'; end if;
    else
      raise exception 'Not authorized to change quote status';
    end if;
  end if;
  return new;
end;
$function$;

alter table public.quote_requests drop constraint if exists quote_requests_structured_checks;
alter table public.quote_requests
  drop column if exists match_score,
  drop column if exists match_reason,
  drop column if exists service_description,
  drop column if exists coverage_hours,
  drop column if exists travel_fee_cents,
  drop column if exists inclusions,
  drop column if exists delivery_days,
  drop column if exists deposit_cents,
  drop column if exists cancellation_terms;
