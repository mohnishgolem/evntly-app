-- Smart vendor matching, MVP 2: quote invitations and structured quotes.
--
--   quote_requests  structured quote fields (vendor-only), the match score
--                   and reason at invitation time (server-only), one live
--                   request per vendor per event, at most 5 live requests per
--                   category per event, and the event must be the caller's
--
-- Rollback: supabase/rollbacks/20261025090000_smart_matching_mvp2.down.sql

-- ── columns ─────────────────────────────────────────────────────────────
alter table public.quote_requests add column if not exists match_score smallint;
alter table public.quote_requests add column if not exists match_reason text;
alter table public.quote_requests add column if not exists service_description text;
alter table public.quote_requests add column if not exists coverage_hours numeric(4, 1);
alter table public.quote_requests add column if not exists travel_fee_cents integer;
alter table public.quote_requests add column if not exists inclusions text[] not null default '{}';
alter table public.quote_requests add column if not exists delivery_days integer;
alter table public.quote_requests add column if not exists deposit_cents integer;
alter table public.quote_requests add column if not exists cancellation_terms text;

alter table public.quote_requests drop constraint if exists quote_requests_structured_checks;
alter table public.quote_requests
  add constraint quote_requests_structured_checks check (
    (match_score is null or match_score between 0 and 100)
    and (match_reason is null or char_length(match_reason) <= 500)
    and (service_description is null or char_length(service_description) <= 2000)
    and (coverage_hours is null or (coverage_hours > 0 and coverage_hours <= 72))
    and (travel_fee_cents is null or travel_fee_cents >= 0)
    and cardinality(inclusions) <= 20
    and (delivery_days is null or delivery_days between 0 and 365)
    and (deposit_cents is null or deposit_cents >= 0)
    and (cancellation_terms is null or char_length(cancellation_terms) <= 2000)
    -- Travel and deposit are parts of the total, never more than it.
    and (quoted_amount is null or travel_fee_cents is null or travel_fee_cents <= quoted_amount * 100)
    and (quoted_amount is null or deposit_cents is null or deposit_cents <= quoted_amount * 100)
  );

grant select (match_score, match_reason, service_description, coverage_hours, travel_fee_cents, inclusions,
  delivery_days, deposit_cents, cancellation_terms)
  on public.quote_requests to authenticated;

-- ── one live request per vendor per event ───────────────────────────────
create unique index if not exists quote_requests_live_invite_uniq
  on public.quote_requests (event_id, vendor_id)
  where event_id is not null and status in ('pending', 'quoted');

-- ── insert: clients can't preset vendor or server fields ────────────────
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
  new.match_score := null;
  new.match_reason := null;
  new.service_description := null;
  new.coverage_hours := null;
  new.travel_fee_cents := null;
  new.inclusions := '{}';
  new.delivery_days := null;
  new.deposit_cents := null;
  new.cancellation_terms := null;
  if (select count(*) from public.quote_requests q
      where q.client_user_id = auth.uid() and q.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many quote requests. Please try again later.';
  end if;
  return new;
end;
$function$;

-- Runs after fill_quote_request_vendor (which sets service_type).
create or replace function public.guard_quote_request_invites()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_id is null then return new; end if;
  if not public.is_privileged_writer()
     and not exists (select 1 from public.events e where e.id = new.event_id and e.organiser_user_id = auth.uid()) then
    raise exception 'You can only request quotes for your own events.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.quote_requests q
      where q.event_id = new.event_id
        and q.service_type is not distinct from new.service_type
        and q.status in ('pending', 'quoted')
        and (q.expires_at is null or q.expires_at > now())) >= 5 then
    raise exception 'You can have up to 5 open quote requests per vendor type for an event.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_quote_requests_invite_guard on public.quote_requests;
create trigger trg_quote_requests_invite_guard
  before insert on public.quote_requests
  for each row execute function public.guard_quote_request_invites();

revoke execute on function public.guard_quote_request_invites() from public, anon, authenticated;

-- ── update: quote details are the vendor's, scores are the server's ─────
create or replace function public.enforce_quote_requests_lockdown()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  actor uuid := auth.uid();
  is_expired boolean := old.status in ('pending', 'quoted') and old.expires_at is not null and old.expires_at <= now();
  quote_changed boolean :=
    row(new.quoted_amount, new.vendor_note, new.service_description, new.coverage_hours, new.travel_fee_cents,
        new.inclusions, new.delivery_days, new.deposit_cents, new.cancellation_terms)
    is distinct from
    row(old.quoted_amount, old.vendor_note, old.service_description, old.coverage_hours, old.travel_fee_cents,
        old.inclusions, old.delivery_days, old.deposit_cents, old.cancellation_terms);
begin
  if new.status is distinct from old.status and new.status = 'expired' then
    if not is_expired then raise exception 'This quote request has not expired'; end if;
    if quote_changed or new.booking_id is distinct from old.booking_id then
      raise exception 'Only the status can change when a quote expires';
    end if;
    return new;
  end if;
  if is_expired and new.status is distinct from old.status and not (new.status = 'cancelled' and actor = old.client_user_id) then
    raise exception 'This quote request has expired';
  end if;
  if (new.match_score is distinct from old.match_score or new.match_reason is distinct from old.match_reason
      or new.origin is distinct from old.origin) and not public.is_privileged_writer() then
    raise exception 'Not authorized to change match details';
  end if;
  if is_admin() then return new; end if;
  if new.client_email is distinct from old.client_email or new.vendor_email is distinct from old.vendor_email
     or new.vendor_id is distinct from old.vendor_id or new.event_id is distinct from old.event_id
     or new.service_type is distinct from old.service_type or new.event_date is distinct from old.event_date
     or new.location is distinct from old.location or new.details is distinct from old.details
     or new.budget_range is distinct from old.budget_range or new.estimated_guests is distinct from old.estimated_guests then
    raise exception 'Not authorized to change this field on a quote request';
  end if;
  if quote_changed then
    if actor is distinct from old.vendor_user_id then
      raise exception 'Only the vendor can set the quoted amount';
    end if;
    -- Once accepted, declined or cancelled, the quote is a record.
    if old.status not in ('pending', 'quoted') then
      raise exception 'This quote can no longer be changed';
    end if;
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
