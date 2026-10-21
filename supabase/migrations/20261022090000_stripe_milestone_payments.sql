-- Stripe Connect milestone payments ("separate charges and transfers").
--
-- Money flow: the customer pays each milestone into Evntly's Stripe balance
-- (a Checkout charge tagged with the plan's transfer_group). Evntly transfers
-- the vendor's share (amount minus commission) to the vendor's connected
-- account only once the milestone is releasable — customer-approved work, or
-- for the deposit, a booking the vendor has confirmed under a plan both
-- parties agreed. Stripe's card fees come out of Evntly's commission.
--
-- Who can write what:
--   * Parties change work/agreement state only through the SECURITY DEFINER
--     functions below, which identify the caller with auth.uid() and enforce
--     the allowed transitions.
--   * Funding, payout and Stripe ids are written only by the server with the
--     service role (Checkout webhook, transfer creation, refunds).
--   * Nobody signed in can insert/update/delete these tables directly.

-- ── Connected accounts ──────────────────────────────────────────────────
create table public.stripe_accounts (
  user_id uuid primary key references auth.users (id) on delete restrict,
  account_id text not null unique,
  details_submitted boolean not null default false,
  transfers_active boolean not null default false,
  payouts_enabled boolean not null default false,
  requirements_due text[] not null default '{}',
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stripe_accounts enable row level security;
create policy stripe_accounts_select_own on public.stripe_accounts
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.stripe_accounts from anon, authenticated;
grant select on public.stripe_accounts to authenticated;

-- ── Payment plans (one per booking) ─────────────────────────────────────
create table public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null unique references public.bookings (id) on delete restrict,
  vendor_user_id uuid not null,
  customer_user_id uuid not null,
  plan_type text not null check (plan_type in ('deposit_milestones', 'full', 'milestones')),
  currency text not null default 'aud' check (currency = 'aud'),
  total_cents integer not null check (total_cents > 0),
  commission_bps integer not null default 700 check (commission_bps between 0 and 3000),
  status text not null default 'proposed'
    check (status in ('proposed', 'changes_requested', 'agreed', 'active', 'completed', 'cancelled')),
  change_note text,
  vendor_agreed_at timestamptz,
  customer_agreed_at timestamptz,
  transfer_group text not null unique default ('plan_' || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_plans enable row level security;
create policy payment_plans_select_party on public.payment_plans
  for select to authenticated
  using (vendor_user_id = (select auth.uid()) or customer_user_id = (select auth.uid()) or public.is_admin());
revoke all on public.payment_plans from anon, authenticated;
grant select on public.payment_plans to authenticated;

-- ── Milestones ──────────────────────────────────────────────────────────
-- Three independent tracks:
--   work_status    — what the parties agreed has happened to the work
--   funding_status — the customer's payment into Evntly
--   payout_status  — Evntly's transfer to the vendor
create table public.payment_milestones (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.payment_plans (id) on delete cascade,
  position integer not null,
  kind text not null check (kind in ('deposit', 'milestone', 'full')),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 2000),
  deliverables text check (deliverables is null or length(deliverables) <= 2000),
  amount_cents integer not null check (amount_cents > 0),
  due_date date,
  work_status text not null default 'pending'
    check (work_status in ('pending', 'in_progress', 'submitted', 'approved', 'rejected', 'disputed', 'cancelled')),
  funding_status text not null default 'unfunded'
    check (funding_status in ('unfunded', 'processing', 'funded', 'failed', 'refunded', 'partially_refunded')),
  payout_status text not null default 'not_started'
    check (payout_status in ('not_started', 'processing', 'paid', 'failed', 'reversed')),
  vendor_note text check (vendor_note is null or length(vendor_note) <= 2000),
  customer_note text check (customer_note is null or length(customer_note) <= 2000),
  evidence_paths text[] not null default '{}',
  checkout_session_id text,
  payment_intent_id text,
  charge_id text,
  transfer_id text,
  refund_id text,
  payout_cents integer,
  last_error text,
  submitted_at timestamptz,
  approved_at timestamptz,
  funded_at timestamptz,
  paid_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, position)
);
create index payment_milestones_plan_idx on public.payment_milestones (plan_id);
create unique index payment_milestones_checkout_idx on public.payment_milestones (checkout_session_id)
  where checkout_session_id is not null;
alter table public.payment_milestones enable row level security;
create policy payment_milestones_select_party on public.payment_milestones
  for select to authenticated
  using (exists (
    select 1 from public.payment_plans p
    where p.id = plan_id
      and (p.vendor_user_id = (select auth.uid()) or p.customer_user_id = (select auth.uid()) or public.is_admin())
  ));
revoke all on public.payment_milestones from anon, authenticated;
grant select on public.payment_milestones to authenticated;

-- ── Activity history (append-only) ──────────────────────────────────────
create table public.payment_events (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.payment_plans (id) on delete cascade,
  milestone_id uuid references public.payment_milestones (id) on delete cascade,
  actor_user_id uuid,
  actor_role text not null check (actor_role in ('vendor', 'customer', 'admin', 'system')),
  event text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index payment_events_plan_idx on public.payment_events (plan_id, created_at);
alter table public.payment_events enable row level security;
create policy payment_events_select_party on public.payment_events
  for select to authenticated
  using (exists (
    select 1 from public.payment_plans p
    where p.id = plan_id
      and (p.vendor_user_id = (select auth.uid()) or p.customer_user_id = (select auth.uid()) or public.is_admin())
  ));
revoke all on public.payment_events from anon, authenticated;
grant select on public.payment_events to authenticated;

-- ── Webhook idempotency (server only) ───────────────────────────────────
create table public.stripe_webhook_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

-- updated_at upkeep
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
create trigger touch_stripe_accounts before update on public.stripe_accounts
  for each row execute function public.touch_updated_at();
create trigger touch_payment_plans before update on public.payment_plans
  for each row execute function public.touch_updated_at();
create trigger touch_payment_milestones before update on public.payment_milestones
  for each row execute function public.touch_updated_at();

-- ── Helpers ─────────────────────────────────────────────────────────────
create or replace function public.log_payment_event(
  p_plan_id uuid, p_milestone_id uuid, p_role text, p_event text, p_detail jsonb default '{}'
) returns void language sql security definer set search_path = '' as $$
  insert into public.payment_events (plan_id, milestone_id, actor_user_id, actor_role, event, detail)
  values (p_plan_id, p_milestone_id, auth.uid(), p_role, p_event, coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function public.log_payment_event(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_payment_event(uuid, uuid, text, text, jsonb) to service_role;

-- ── Vendor: propose (or re-propose) a plan ──────────────────────────────
-- p_milestones: [{"kind","name","description","deliverables","amount_cents","due_date"}]
create or replace function public.propose_payment_plan(p_booking_id text, p_plan_type text, p_milestones jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  existing public.payment_plans;
  has_existing boolean;
  v_plan_id uuid;
  total integer;
  item jsonb;
  pos integer := 0;
  sum_cents integer := 0;
  n integer;
  deposit_cents integer;
  item_kind text;
  item_due date;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.provider_owner_user_id is distinct from auth.uid() then
    raise exception 'Only the vendor on this booking can propose a payment plan.';
  end if;
  if b.status not in ('pending', 'confirmed') then
    raise exception 'This booking can''t take a payment plan in its current state.';
  end if;
  if p_plan_type not in ('deposit_milestones', 'full', 'milestones') then
    raise exception 'Unknown payment option.';
  end if;
  if jsonb_typeof(p_milestones) <> 'array' then raise exception 'Add at least one payment.'; end if;
  n := jsonb_array_length(p_milestones);
  if n < 1 or n > 12 then raise exception 'A plan needs between 1 and 12 payments.'; end if;

  total := round(b.total_price * 100)::integer;
  if total is null or total <= 0 then raise exception 'This booking has no agreed price.'; end if;

  select * into existing from public.payment_plans where booking_id = p_booking_id for update;
  has_existing := found;
  if has_existing and existing.status not in ('proposed', 'changes_requested') then
    raise exception 'The payment plan is already agreed. Contact support to change it.';
  end if;

  -- Shape rules per option.
  for item in select * from jsonb_array_elements(p_milestones) loop
    item_kind := item ->> 'kind';
    if item_kind not in ('deposit', 'milestone', 'full') then raise exception 'Unknown payment type.'; end if;
    if coalesce((item ->> 'amount_cents')::integer, 0) <= 0 then raise exception 'Every payment needs an amount.'; end if;
    if length(btrim(coalesce(item ->> 'name', ''))) = 0 then raise exception 'Every payment needs a name.'; end if;
    item_due := nullif(item ->> 'due_date', '')::date;
    if item_due is not null and item_due < (now() at time zone 'Australia/Sydney')::date then
      raise exception 'Due dates can''t be in the past.';
    end if;
    sum_cents := sum_cents + (item ->> 'amount_cents')::integer;
  end loop;
  if sum_cents <> total then
    raise exception 'Payments must add up to the booking total of $%.', to_char(total / 100.0, 'FM999999990.00');
  end if;

  if p_plan_type = 'full' then
    if n <> 1 or p_milestones -> 0 ->> 'kind' <> 'full' then raise exception 'Full payment is a single payment.'; end if;
  elsif p_plan_type = 'deposit_milestones' then
    if p_milestones -> 0 ->> 'kind' <> 'deposit' then raise exception 'The first payment must be the deposit.'; end if;
    if n < 2 then raise exception 'Add at least one milestone after the deposit.'; end if;
    if (select count(*) from jsonb_array_elements(p_milestones) e where e ->> 'kind' <> 'milestone') <> 1 then
      raise exception 'Only the first payment can be a deposit.';
    end if;
    deposit_cents := (p_milestones -> 0 ->> 'amount_cents')::integer;
    if deposit_cents * 100 < total * 10 or deposit_cents * 100 > total * 50 then
      raise exception 'The deposit must be between 10%% and 50%% of the total.';
    end if;
  else
    if exists (select 1 from jsonb_array_elements(p_milestones) e where e ->> 'kind' <> 'milestone') then
      raise exception 'Staged payments without a deposit can only contain milestones.';
    end if;
  end if;

  if has_existing then
    -- Nothing has been paid on a proposed plan, so replacing milestones is safe.
    delete from public.payment_milestones where plan_id = existing.id;
    update public.payment_plans
      set plan_type = p_plan_type, total_cents = total, status = 'proposed', change_note = null,
          vendor_agreed_at = now(), customer_agreed_at = null
      where id = existing.id;
    v_plan_id := existing.id;
  else
    insert into public.payment_plans (booking_id, vendor_user_id, customer_user_id, plan_type, total_cents, status, vendor_agreed_at)
    values (b.id, b.provider_owner_user_id, b.client_user_id, p_plan_type, total, 'proposed', now())
    returning id into v_plan_id;
  end if;

  for item in select * from jsonb_array_elements(p_milestones) loop
    insert into public.payment_milestones (plan_id, position, kind, name, description, deliverables, amount_cents, due_date)
    values (v_plan_id, pos, item ->> 'kind', btrim(item ->> 'name'), nullif(btrim(item ->> 'description'), ''),
            nullif(btrim(item ->> 'deliverables'), ''), (item ->> 'amount_cents')::integer,
            nullif(item ->> 'due_date', '')::date);
    pos := pos + 1;
  end loop;

  perform public.log_payment_event(v_plan_id, null, 'vendor', 'plan_proposed',
    jsonb_build_object('plan_type', p_plan_type, 'total_cents', total, 'payments', n));
  return v_plan_id;
end; $$;

-- ── Customer: agree, or ask for changes ─────────────────────────────────
create or replace function public.respond_to_payment_plan(p_plan_id uuid, p_agree boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.payment_plans;
begin
  select * into p from public.payment_plans where id = p_plan_id for update;
  if not found or p.customer_user_id is distinct from auth.uid() then
    raise exception 'Only the customer on this booking can respond to the plan.';
  end if;
  if p.status <> 'proposed' then raise exception 'This plan isn''t waiting for your response.'; end if;
  if p_agree then
    update public.payment_plans set status = 'agreed', customer_agreed_at = now() where id = p.id;
    perform public.log_payment_event(p.id, null, 'customer', 'plan_agreed');
  else
    update public.payment_plans set status = 'changes_requested', change_note = left(nullif(btrim(p_note), ''), 2000)
      where id = p.id;
    perform public.log_payment_event(p.id, null, 'customer', 'plan_changes_requested',
      jsonb_build_object('note', left(p_note, 2000)));
  end if;
end; $$;

-- ── Vendor: work progress ───────────────────────────────────────────────
-- pending → in_progress → submitted; a rejected milestone can be resubmitted.
create or replace function public.update_milestone_work(
  p_milestone_id uuid, p_status text, p_note text default null, p_evidence text[] default null
) returns void language plpgsql security definer set search_path = '' as $$
declare m public.payment_milestones; p public.payment_plans;
begin
  select * into m from public.payment_milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found.'; end if;
  select * into p from public.payment_plans where id = m.plan_id;
  if p.vendor_user_id is distinct from auth.uid() then raise exception 'Only the vendor can update this milestone.'; end if;
  if p.status not in ('agreed', 'active') then raise exception 'The payment plan isn''t agreed yet.'; end if;
  if m.kind = 'deposit' then raise exception 'The deposit is released when you confirm the booking.'; end if;

  if p_status = 'in_progress' and m.work_status = 'pending' then
    update public.payment_milestones set work_status = 'in_progress' where id = m.id;
  elsif p_status = 'submitted' and m.work_status in ('pending', 'in_progress', 'rejected') then
    -- Evidence must live in this plan's folder of the private bucket.
    if p_evidence is not null and exists (
      select 1 from unnest(p_evidence) e where e not like (p.id::text || '/%') or e like '%..%'
    ) then
      raise exception 'Invalid evidence file.';
    end if;
    update public.payment_milestones
      set work_status = 'submitted', submitted_at = now(),
          vendor_note = left(nullif(btrim(p_note), ''), 2000),
          evidence_paths = coalesce(p_evidence, evidence_paths)
      where id = m.id;
  else
    raise exception 'That change isn''t allowed for this milestone.';
  end if;
  perform public.log_payment_event(p.id, m.id, 'vendor', 'work_' || p_status,
    jsonb_build_object('note', left(p_note, 2000)));
end; $$;

-- ── Customer: approve or reject submitted work ──────────────────────────
-- Approval never moves money by itself: the server releases the payout
-- only if the milestone is also funded and the vendor can receive transfers.
create or replace function public.review_milestone(p_milestone_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.payment_milestones; p public.payment_plans;
begin
  select * into m from public.payment_milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found.'; end if;
  select * into p from public.payment_plans where id = m.plan_id;
  if p.customer_user_id is distinct from auth.uid() then raise exception 'Only the customer can review this milestone.'; end if;
  if m.work_status <> 'submitted' then raise exception 'This milestone isn''t waiting for your review.'; end if;
  if not p_approve and length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'Tell the vendor what needs to change.';
  end if;
  update public.payment_milestones
    set work_status = case when p_approve then 'approved' else 'rejected' end,
        approved_at = case when p_approve then now() else null end,
        customer_note = left(nullif(btrim(p_note), ''), 2000)
    where id = m.id;
  perform public.log_payment_event(p.id, m.id, 'customer', case when p_approve then 'work_approved' else 'work_rejected' end,
    jsonb_build_object('note', left(p_note, 2000)));
end; $$;

-- ── Either party: raise a dispute (freezes the payout) ──────────────────
create or replace function public.dispute_milestone(p_milestone_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.payment_milestones; p public.payment_plans; v_role text;
begin
  select * into m from public.payment_milestones where id = p_milestone_id for update;
  if not found then raise exception 'Milestone not found.'; end if;
  select * into p from public.payment_plans where id = m.plan_id;
  v_role := case when p.vendor_user_id = auth.uid() then 'vendor' when p.customer_user_id = auth.uid() then 'customer' end;
  if v_role is null then raise exception 'Only the vendor or customer can raise a dispute.'; end if;
  if m.payout_status in ('processing', 'paid') then
    raise exception 'This payment has already been released — contact support.';
  end if;
  if m.work_status in ('disputed', 'cancelled') then raise exception 'This milestone can''t be disputed.'; end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Describe the problem (at least a sentence).'; end if;
  update public.payment_milestones set work_status = 'disputed' where id = m.id;
  perform public.log_payment_event(p.id, m.id, v_role, 'disputed', jsonb_build_object('note', left(p_note, 2000)));
end; $$;

-- ── Server: atomically claim a releasable milestone for payout ──────────
-- Returns the row only if every condition holds right now; the caller then
-- creates the Stripe transfer (with an idempotency key on the milestone id).
create or replace function public.claim_milestone_payout(p_milestone_id uuid)
returns setof public.payment_milestones language plpgsql security definer set search_path = '' as $$
declare m public.payment_milestones; p public.payment_plans; b public.bookings; a public.stripe_accounts;
begin
  select * into m from public.payment_milestones where id = p_milestone_id for update;
  if not found then return; end if;
  select * into p from public.payment_plans where id = m.plan_id;
  select * into b from public.bookings where id = p.booking_id;
  select * into a from public.stripe_accounts where user_id = p.vendor_user_id;

  if p.status not in ('agreed', 'active') then return; end if;
  if m.funding_status <> 'funded' or m.charge_id is null then return; end if;
  if m.payout_status not in ('not_started', 'failed') then return; end if;
  if a.account_id is null or not a.transfers_active then return; end if;
  if m.kind = 'deposit' then
    if b.status not in ('confirmed', 'completed') or m.work_status in ('disputed', 'cancelled') then return; end if;
  elsif m.work_status <> 'approved' then
    return;
  end if;

  update public.payment_milestones set payout_status = 'processing', last_error = null
    where id = m.id returning * into m;
  return next m;
end; $$;

-- Grants: party RPCs for signed-in users, server RPCs for the service role.
revoke all on function public.propose_payment_plan(text, text, jsonb) from public, anon;
revoke all on function public.respond_to_payment_plan(uuid, boolean, text) from public, anon;
revoke all on function public.update_milestone_work(uuid, text, text, text[]) from public, anon;
revoke all on function public.review_milestone(uuid, boolean, text) from public, anon;
revoke all on function public.dispute_milestone(uuid, text) from public, anon;
grant execute on function public.propose_payment_plan(text, text, jsonb) to authenticated;
grant execute on function public.respond_to_payment_plan(uuid, boolean, text) to authenticated;
grant execute on function public.update_milestone_work(uuid, text, text, text[]) to authenticated;
grant execute on function public.review_milestone(uuid, boolean, text) to authenticated;
grant execute on function public.dispute_milestone(uuid, text) to authenticated;
revoke all on function public.claim_milestone_payout(uuid) from public, anon, authenticated;
grant execute on function public.claim_milestone_payout(uuid) to service_role;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- ── Evidence files: private bucket, plan folder, parties only ───────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('milestone-evidence', 'milestone-evidence', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create or replace function public.is_payment_plan_party(p_plan_id text, p_vendor_only boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.payment_plans p
    where p.id::text = p_plan_id
      and (p.vendor_user_id = auth.uid() or (not p_vendor_only and (p.customer_user_id = auth.uid() or public.is_admin())))
  );
$$;
revoke all on function public.is_payment_plan_party(text, boolean) from public, anon;
grant execute on function public.is_payment_plan_party(text, boolean) to authenticated;

create policy milestone_evidence_read on storage.objects for select to authenticated
  using (bucket_id = 'milestone-evidence' and public.is_payment_plan_party((storage.foldername(name))[1]));
create policy milestone_evidence_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'milestone-evidence' and public.is_payment_plan_party((storage.foldername(name))[1], true));

-- ── Settings + honest booking payment state ─────────────────────────────
-- Payments stay off until an admin flips this (and Stripe keys are set).
insert into public.app_settings (key, value) values ('payments_enabled', 'false'), ('commission_bps', '700')
on conflict (key) do nothing;

-- No payment has ever been taken, so nothing is "held". Bookings now start
-- as 'unpaid'; the payment plan carries the real state.
create or replace function public.enforce_bookings_lockdown()
returns trigger language plpgsql set search_path to 'public' as $function$
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

update public.bookings set escrow_status = 'unpaid' where escrow_status = 'held' and stripe_payment_intent_id is null;

create or replace function public.accept_quote(p_quote_id text)
returns text language plpgsql security definer set search_path to '' as $function$
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
