-- AI phone recruitment agent (Dec 2026). NOT APPLIED; needs Sai's approval.
-- Depends on 20261106090000_vendor_acquisition (vendor_prospects) and
-- 20261130100000_growth_dashboard (acquisition_spend, internal_test_user_ids).
--
-- An AI voice agent (Retell AI, Australian number via Twilio SIP) calls vendors
-- who agreed to be called, explains Evntly, and records what happened here.
--
-- Rules the database enforces, whatever the app or the voice agent does:
--   * calling is OFF until an admin switches mode to 'prototype' (only numbers
--     on the prototype allow-list, i.e. Sai's own phone) or 'pilot';
--   * a pilot call needs: a prospect who isn't do-not-contact or already an
--     Evntly vendor, an unexpired EXPRESS consent to be called (a publicly
--     listed number is not consent), a Do Not Call Register check in the last
--     30 days showing the number isn't registered, a number not on the
--     permanent suppression list, the legal calling window (Telemarketing
--     Standard 2017 s8, Sydney time, national public holidays off) AND our
--     narrower business-hours window, the attempt limit, the pilot call cap
--     and the A$ budget;
--   * the suppression list is permanent: rows can't be updated or deleted;
--   * call recording is off, and can only be switched on with a recorded
--     legal-review note (NSW Surveillance Devices Act 2007: all-party consent);
--     the agent must then also get the person's consent on the call;
--   * the voice agent never gets database credentials. Our server verifies
--     the provider's signed webhook, then calls phone_agent_tool() with the
--     service role; that function only acts on the ONE call it was given and
--     only through the actions listed below.
--   * every agent action and admin action is logged in phone_call_events.
--
-- Rollback: supabase/rollbacks/20261202090000_phone_agent.down.sql

-- Settings (one row) ---------------------------------------------------------
create table if not exists public.phone_agent_settings (
  id boolean primary key default true check (id),
  mode text not null default 'off' check (mode in ('off', 'prototype', 'pilot')),
  -- Numbers the prototype may call (Sai's own approved phone), E.164.
  prototype_numbers text[] not null default '{}',
  -- Where interested vendors are transferred / who takes callbacks (Sai).
  owner_name text not null default 'Sai' check (char_length(owner_name) between 1 and 40),
  owner_transfer_number text check (owner_transfer_number is null or owner_transfer_number ~ '^\+61[2-478][0-9]{8}$'),
  -- Sydney-time window when Sai can take a live transfer (else: offer a callback).
  transfer_start time not null default '10:00',
  transfer_end time not null default '16:30',
  -- Our own (narrower) calling window, Sydney time, Monday–Friday only.
  call_start time not null default '10:00',
  call_end time not null default '16:30',
  pilot_max_calls integer not null default 10 check (pilot_max_calls between 0 and 200),
  max_attempts_per_prospect integer not null default 2 check (max_attempts_per_prospect between 1 and 3),
  daily_call_cap integer not null default 10 check (daily_call_cap between 0 and 100),
  budget_aud_cents integer not null default 5000 check (budget_aud_cents between 0 and 100000),
  usd_to_aud numeric(6, 4) not null default 1.55 check (usd_to_aud between 1 and 3),
  recording_enabled boolean not null default false,
  recording_review_note text check (recording_review_note is null or char_length(recording_review_note) between 20 and 1000),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint phone_agent_recording_reviewed check (not recording_enabled or recording_review_note is not null),
  constraint phone_agent_prototype_numbers check (
    array_length(prototype_numbers, 1) is null
    or (array_length(prototype_numbers, 1) <= 3 and array_to_string(prototype_numbers, ',') ~ '^(\+61[2-478][0-9]{8})(,\+61[2-478][0-9]{8})*$')
  )
);
insert into public.phone_agent_settings (id) values (true) on conflict do nothing;

-- National public holidays (s8(3)): no calls at all. Conservative: where a
-- holiday falls on a weekend, the weekday in lieu is blocked too.
create table if not exists public.phone_national_holidays (
  day date primary key,
  name text not null
);
insert into public.phone_national_holidays (day, name) values
  ('2026-01-01', 'New Year''s Day'), ('2026-01-26', 'Australia Day'), ('2026-04-03', 'Good Friday'),
  ('2026-04-06', 'Easter Monday'), ('2026-04-25', 'Anzac Day'), ('2026-12-25', 'Christmas Day'),
  ('2026-12-26', 'Boxing Day'), ('2026-12-28', 'Boxing Day (in lieu)'),
  ('2027-01-01', 'New Year''s Day'), ('2027-01-26', 'Australia Day'), ('2027-03-26', 'Good Friday'),
  ('2027-03-29', 'Easter Monday'), ('2027-04-25', 'Anzac Day'), ('2027-04-26', 'Anzac Day (in lieu, conservative)'),
  ('2027-12-25', 'Christmas Day'), ('2027-12-26', 'Boxing Day'), ('2027-12-27', 'Christmas Day (in lieu)'),
  ('2027-12-28', 'Boxing Day (in lieu)')
on conflict do nothing;

-- Permanent suppression list ---------------------------------------------------
create table if not exists public.phone_suppression (
  phone_e164 text primary key check (phone_e164 ~ '^\+61[2-478][0-9]{8}$'),
  reason text not null check (char_length(reason) between 1 and 200),
  source text not null check (source in ('call_opt_out', 'admin', 'dncr_registered', 'sms_stop', 'email', 'complaint')),
  prospect_id uuid references public.vendor_prospects (id) on delete set null,
  call_id uuid,
  created_at timestamptz not null default now()
);

create or replace function public.phone_suppression_is_permanent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The suppression list is permanent: numbers can''t be changed or removed.' using errcode = 'P0001';
end;
$$;
drop trigger if exists phone_suppression_permanent on public.phone_suppression;
create trigger phone_suppression_permanent before update or delete on public.phone_suppression
  for each row execute function public.phone_suppression_is_permanent();

-- Consent records ----------------------------------------------------------------
-- kind: 'call' (agreed to receive a call from us), 'callback' (asked for a call
-- at a particular time), 'sms_link' / 'email_link' (agreed to receive the
-- registration link that way), 'recording' (agreed to this call being recorded).
create table if not exists public.phone_consents (
  id bigserial primary key,
  prospect_id uuid references public.vendor_prospects (id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+61[2-478][0-9]{8}$'),
  kind text not null check (kind in ('call', 'callback', 'sms_link', 'email_link', 'recording', 'assisted_listing')),
  basis text not null check (basis in ('express_written', 'express_verbal_on_call', 'express_web_form', 'express_dm_reply', 'owner_self')),
  -- What they said / wrote, where, and when (quote it).
  evidence text not null check (char_length(evidence) between 10 and 1000),
  call_id uuid,
  recorded_by uuid,
  given_at timestamptz not null default now(),
  -- DNCR guidance: express consent with no stated period lasts 3 months.
  expires_at timestamptz not null default now() + interval '3 months',
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists phone_consents_phone_idx on public.phone_consents (phone_e164, kind) where withdrawn_at is null;

-- Do Not Call Register checks (washing is valid for 30 days).
create table if not exists public.phone_dncr_checks (
  id bigserial primary key,
  phone_e164 text not null check (phone_e164 ~ '^\+61[2-478][0-9]{8}$'),
  on_register boolean not null,
  method text not null check (method in ('quick_check', 'wash')),
  reference text check (reference is null or char_length(reference) <= 120),
  checked_by uuid,
  checked_at timestamptz not null default now()
);
create index if not exists phone_dncr_checks_phone_idx on public.phone_dncr_checks (phone_e164, checked_at desc);

-- Calls ---------------------------------------------------------------------------
create table if not exists public.phone_calls (
  id uuid primary key default gen_random_uuid(),
  -- Short public reference: in the registration link (?c=aicall-<ref>) and logs.
  ref text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) check (ref ~ '^[a-z0-9]{10}$'),
  mode text not null check (mode in ('prototype', 'pilot')),
  prospect_id uuid references public.vendor_prospects (id) on delete set null,
  phone_e164 text not null check (phone_e164 ~ '^\+61[2-478][0-9]{8}$'),
  -- What the agent is told about the vendor (no contact details beyond first name).
  vendor_name text check (vendor_name is null or char_length(vendor_name) <= 160),
  contact_first_name text check (contact_first_name is null or char_length(contact_first_name) <= 60),
  category text check (category is null or char_length(category) <= 40),
  provider text not null default 'retell',
  provider_call_id text unique check (provider_call_id is null or char_length(provider_call_id) <= 120),
  status text not null default 'dialing' check (status in ('dialing', 'in_progress', 'ended', 'failed')),
  requested_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  disconnection_reason text check (disconnection_reason is null or char_length(disconnection_reason) <= 80),
  outcome text check (outcome is null or outcome in (
    'interested', 'link_sent', 'assisted_requested', 'callback_booked', 'transferred', 'busy_call_later',
    'not_interested', 'already_registered', 'opted_out', 'voicemail', 'no_answer', 'wrong_number', 'other')),
  interest text check (interest is null or interest in ('high', 'medium', 'low', 'none')),
  objections text[] not null default '{}',
  summary text check (summary is null or char_length(summary) <= 2000),
  link_sent_at timestamptz,
  link_channel text check (link_channel is null or link_channel in ('sms', 'email')),
  link_to text check (link_to is null or char_length(link_to) <= 254),
  assisted_requested_at timestamptz,
  transferred_at timestamptz,
  opted_out_at timestamptz,
  -- Kept only when recording is enabled AND the person agreed on the call.
  transcript text check (transcript is null or char_length(transcript) <= 60000),
  recording_consented boolean not null default false,
  cost_usd_cents integer check (cost_usd_cents is null or cost_usd_cents >= 0),
  cost_aud_cents integer check (cost_aud_cents is null or cost_aud_cents >= 0),
  -- Sai's review of the conversation (1 = poor, 5 = excellent).
  quality_score smallint check (quality_score is null or quality_score between 1 and 5),
  quality_note text check (quality_note is null or char_length(quality_note) <= 500),
  updated_at timestamptz not null default now()
);
create index if not exists phone_calls_prospect_idx on public.phone_calls (prospect_id, created_at desc);
create index if not exists phone_calls_phone_idx on public.phone_calls (phone_e164, created_at desc);

-- Things for Sai to do after a call: call back, or prepare an assisted listing.
create table if not exists public.phone_followups (
  id bigserial primary key,
  call_id uuid not null references public.phone_calls (id) on delete cascade,
  prospect_id uuid references public.vendor_prospects (id) on delete set null,
  kind text not null check (kind in ('callback', 'assisted_listing')),
  due_at timestamptz,
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists phone_followups_open_idx on public.phone_followups (due_at) where status = 'open';

create table if not exists public.phone_call_events (
  id bigserial primary key,
  call_id uuid references public.phone_calls (id) on delete cascade,
  actor text not null check (actor in ('agent', 'admin', 'provider', 'system')),
  actor_user_id uuid,
  action text not null check (char_length(action) <= 40),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 8192),
  created_at timestamptz not null default now()
);
create index if not exists phone_call_events_call_idx on public.phone_call_events (call_id, created_at);

-- Access: admins (MFA) read; nobody writes directly. Writes go through the
-- functions below (admin_* as the signed-in admin, phone_agent_* as the
-- service role from our verified webhook routes).
alter table public.phone_agent_settings enable row level security;
alter table public.phone_national_holidays enable row level security;
alter table public.phone_suppression enable row level security;
alter table public.phone_consents enable row level security;
alter table public.phone_dncr_checks enable row level security;
alter table public.phone_calls enable row level security;
alter table public.phone_followups enable row level security;
alter table public.phone_call_events enable row level security;
revoke all on public.phone_agent_settings, public.phone_national_holidays, public.phone_suppression, public.phone_consents,
  public.phone_dncr_checks, public.phone_calls, public.phone_followups, public.phone_call_events from public, anon, authenticated;
revoke all on sequence public.phone_consents_id_seq, public.phone_dncr_checks_id_seq, public.phone_followups_id_seq,
  public.phone_call_events_id_seq from public, anon, authenticated;
grant select on public.phone_agent_settings, public.phone_national_holidays, public.phone_suppression, public.phone_consents,
  public.phone_dncr_checks, public.phone_calls, public.phone_followups, public.phone_call_events to authenticated;

do $$
declare t text;
begin
  foreach t in array array['phone_agent_settings', 'phone_national_holidays', 'phone_suppression', 'phone_consents',
                           'phone_dncr_checks', 'phone_calls', 'phone_followups', 'phone_call_events'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_admin()))', t || '_admin_read', t);
  end loop;
end $$;

-- AI phone spend shows up in the growth dashboard's acquisition cost.
alter table public.acquisition_spend drop constraint if exists acquisition_spend_channel_check;
alter table public.acquisition_spend add constraint acquisition_spend_channel_check check (channel in (
  'meta_ads', 'google_ads', 'instagram', 'events', 'print', 'partnerships', 'referral_rewards', 'tools', 'other', 'ai_phone'));

-- Helpers ---------------------------------------------------------------------------

-- The clock used for calling-hours rules (tests replace it with a fixed time).
create or replace function public.phone_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;
grant execute on function public.phone_now() to authenticated, service_role;

-- Telemarketing Standard 2017 s8: weekdays 9am–8pm, Saturday 9am–5pm, never
-- Sunday or a national public holiday, in the call recipient's local time
-- (Sydney vendors: Australia/Sydney).
create or replace function public.phone_legal_window_ok(p_at timestamptz, p_tz text default 'Australia/Sydney')
returns boolean
language sql
stable
set search_path = ''
as $$
  with t as (select (p_at at time zone p_tz) as local)
  select case
    when exists (select 1 from public.phone_national_holidays h where h.day = (select local::date from t)) then false
    when extract(isodow from (select local from t)) = 7 then false
    when extract(isodow from (select local from t)) = 6 then (select local::time from t) >= '09:00' and (select local::time from t) < '17:00'
    else (select local::time from t) >= '09:00' and (select local::time from t) < '20:00'
  end;
$$;
grant execute on function public.phone_legal_window_ok(timestamptz, text) to authenticated, service_role;

-- Why a call can't be made now (empty array = it can). p_prospect_id is null
-- for prototype calls.
create or replace function public.phone_call_blockers(p_prospect_id uuid, p_phone text, p_at timestamptz default public.phone_now())
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.phone_agent_settings;
  p public.vendor_prospects;
  r text[] := '{}';
  v_local timestamp := p_at at time zone 'Australia/Sydney';
  spent integer;
begin
  select * into s from public.phone_agent_settings where id;
  if s.mode = 'off' then r := array_append(r, 'Calling is switched off.'); end if;
  if p_phone is null or p_phone !~ '^\+61[2-478][0-9]{8}$' then
    return array_append(r, 'Not a valid Australian phone number (+61…).');
  end if;
  if exists (select 1 from public.phone_suppression x where x.phone_e164 = p_phone) then
    r := array_append(r, 'Number is on the permanent do-not-call list.');
  end if;
  if not public.phone_legal_window_ok(p_at) then
    r := array_append(r, 'Outside legal calling hours (weekdays 9am–8pm, Sat 9am–5pm, no Sundays or national public holidays).');
  end if;
  if extract(isodow from v_local) > 5 or v_local::time < s.call_start or v_local::time >= s.call_end then
    r := array_append(r, format('Outside our calling window (Mon–Fri %s–%s Sydney).', to_char(s.call_start, 'HH24:MI'), to_char(s.call_end, 'HH24:MI')));
  end if;
  if exists (select 1 from public.phone_calls c where c.phone_e164 = p_phone and c.status in ('dialing', 'in_progress') and c.created_at > now() - interval '30 minutes') then
    r := array_append(r, 'A call to this number is already in progress.');
  end if;
  if (select count(*) from public.phone_calls c where (c.created_at at time zone 'Australia/Sydney')::date = (now() at time zone 'Australia/Sydney')::date) >= s.daily_call_cap then
    r := array_append(r, 'Daily call cap reached.');
  end if;
  select coalesce(sum(cost_aud_cents), 0) into spent from public.phone_calls;
  if spent >= s.budget_aud_cents then r := array_append(r, 'Testing budget used up.'); end if;

  if p_prospect_id is null then
    if s.mode = 'pilot' then r := array_append(r, 'Pilot calls must be to a prospect.'); end if;
    if not (p_phone = any (s.prototype_numbers)) then r := array_append(r, 'Prototype calls can only go to the approved prototype numbers.'); end if;
    return r;
  end if;

  -- Pilot call to a real vendor.
  if s.mode <> 'pilot' then r := array_append(r, 'Vendor calls need pilot mode.'); end if;
  select * into p from public.vendor_prospects where id = p_prospect_id;
  if not found then return array_append(r, 'Prospect not found.'); end if;
  if p.do_not_contact then r := array_append(r, 'Prospect is do-not-contact.'); end if;
  if p.email_normalized is not null and exists (select 1 from public.users u where lower(u.email) = p.email_normalized) then
    r := array_append(r, 'Already has an Evntly account.');
  end if;
  if not exists (
    select 1 from public.phone_consents c
    where c.phone_e164 = p_phone and c.kind in ('call', 'callback') and c.withdrawn_at is null and c.expires_at > p_at
      and (c.prospect_id is null or c.prospect_id = p.id)
  ) then
    r := array_append(r, 'No current express consent to be called (a published number is not consent).');
  end if;
  if not exists (
    select 1 from public.phone_dncr_checks d where d.phone_e164 = p_phone and d.checked_at > p_at - interval '30 days' and not d.on_register
  ) then
    r := array_append(r, 'Needs a Do Not Call Register check in the last 30 days showing it isn''t registered.');
  end if;
  if (select count(*) from public.phone_calls c where c.prospect_id = p.id) >= s.max_attempts_per_prospect then
    r := array_append(r, 'Attempt limit reached for this prospect.');
  end if;
  if exists (select 1 from public.phone_calls c where c.prospect_id = p.id and c.created_at > now() - interval '20 hours') then
    r := array_append(r, 'Already called in the last day.');
  end if;
  if (select count(distinct c.prospect_id) from public.phone_calls c where c.mode = 'pilot') >= s.pilot_max_calls
     and not exists (select 1 from public.phone_calls c where c.prospect_id = p.id) then
    r := array_append(r, 'Pilot vendor limit reached.');
  end if;
  return r;
end;
$$;
revoke all on function public.phone_call_blockers(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.phone_call_blockers(uuid, text, timestamptz) to service_role;

create or replace function public.admin_phone_call_blockers(p_prospect_id uuid, p_phone text)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  return public.phone_call_blockers(p_prospect_id, p_phone, public.phone_now());
end;
$$;
revoke all on function public.admin_phone_call_blockers(uuid, text) from public, anon;
grant execute on function public.admin_phone_call_blockers(uuid, text) to authenticated;

-- Admin functions ---------------------------------------------------------------------

create or replace function public.admin_phone_update_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare old public.phone_agent_settings;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into old from public.phone_agent_settings where id for update;
  update public.phone_agent_settings set
    mode = coalesce(p ->> 'mode', mode),
    prototype_numbers = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'prototype_numbers') x), case when p ? 'prototype_numbers' then '{}' else prototype_numbers end),
    owner_name = coalesce(p ->> 'owner_name', owner_name),
    owner_transfer_number = case when p ? 'owner_transfer_number' then nullif(p ->> 'owner_transfer_number', '') else owner_transfer_number end,
    transfer_start = coalesce((p ->> 'transfer_start')::time, transfer_start),
    transfer_end = coalesce((p ->> 'transfer_end')::time, transfer_end),
    call_start = coalesce((p ->> 'call_start')::time, call_start),
    call_end = coalesce((p ->> 'call_end')::time, call_end),
    pilot_max_calls = coalesce((p ->> 'pilot_max_calls')::int, pilot_max_calls),
    daily_call_cap = coalesce((p ->> 'daily_call_cap')::int, daily_call_cap),
    budget_aud_cents = coalesce((p ->> 'budget_aud_cents')::int, budget_aud_cents),
    recording_enabled = coalesce((p ->> 'recording_enabled')::boolean, recording_enabled),
    recording_review_note = case when p ? 'recording_review_note' then nullif(p ->> 'recording_review_note', '') else recording_review_note end,
    updated_by = auth.uid(), updated_at = now()
  where id;
  if (select call_start < '09:00' or call_end > '20:00' or call_start >= call_end from public.phone_agent_settings where id) then
    raise exception 'Our calling window must sit inside 9am–8pm and start before it ends.' using errcode = '22023';
  end if;
  insert into public.phone_call_events (actor, actor_user_id, action, detail)
  values ('admin', auth.uid(), 'settings', jsonb_build_object('before', to_jsonb(old) - 'updated_at', 'change', p));
end;
$$;
revoke all on function public.admin_phone_update_settings(jsonb) from public, anon;
grant execute on function public.admin_phone_update_settings(jsonb) to authenticated;

-- Record a vendor's express consent to be called (pilot), with the evidence.
create or replace function public.admin_phone_record_consent(p_prospect_id uuid, p_phone text, p_basis text, p_evidence text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare new_id bigint; p public.vendor_prospects;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into p from public.vendor_prospects where id = p_prospect_id;
  if not found then raise exception 'Prospect not found.' using errcode = 'P0001'; end if;
  if p.do_not_contact then raise exception 'This prospect is do-not-contact.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.phone_suppression x where x.phone_e164 = p_phone) then
    raise exception 'That number is on the permanent do-not-call list.' using errcode = 'P0001';
  end if;
  if p_basis not in ('express_written', 'express_web_form', 'express_dm_reply') then
    raise exception 'Record express consent (written, web form or a DM reply). A published number is not consent.' using errcode = '22023';
  end if;
  insert into public.phone_consents (prospect_id, phone_e164, kind, basis, evidence, recorded_by)
  values (p_prospect_id, p_phone, 'call', p_basis, p_evidence, auth.uid()) returning id into new_id;
  update public.vendor_prospects set phone = p_phone, updated_at = now() where id = p_prospect_id and (phone is null or phone <> p_phone);
  insert into public.vendor_prospect_events (prospect_id, actor_user_id, action, from_stage, to_stage, note)
  values (p.id, auth.uid(), 'consent:call', p.stage, p.stage, left(p_evidence, 300));
  return new_id;
end;
$$;
revoke all on function public.admin_phone_record_consent(uuid, text, text, text) from public, anon;
grant execute on function public.admin_phone_record_consent(uuid, text, text, text) to authenticated;

create or replace function public.admin_phone_record_dncr(p_phone text, p_on_register boolean, p_method text, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  insert into public.phone_dncr_checks (phone_e164, on_register, method, reference, checked_by)
  values (p_phone, p_on_register, p_method, left(p_reference, 120), auth.uid());
  if p_on_register then
    insert into public.phone_suppression (phone_e164, reason, source)
    values (p_phone, 'On the Do Not Call Register', 'dncr_registered') on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.admin_phone_record_dncr(text, boolean, text, text) from public, anon;
grant execute on function public.admin_phone_record_dncr(text, boolean, text, text) to authenticated;

create or replace function public.admin_phone_suppress(p_phone text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  insert into public.phone_suppression (phone_e164, reason, source) values (p_phone, p_reason, 'admin') on conflict do nothing;
  update public.phone_consents set withdrawn_at = now() where phone_e164 = p_phone and withdrawn_at is null;
end;
$$;
revoke all on function public.admin_phone_suppress(text, text) from public, anon;
grant execute on function public.admin_phone_suppress(text, text) to authenticated;

-- Start a call: re-checks every rule, then creates the call row. The server
-- then asks the voice provider to dial and records its call id.
create or replace function public.admin_phone_start_call(p_prospect_id uuid, p_phone text)
returns table (call_id uuid, ref text, vendor_name text, contact_first_name text, category text, mode text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  blockers text[];
  s public.phone_agent_settings;
  p public.vendor_prospects;
  c public.phone_calls;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('phone_agent_start'));
  blockers := public.phone_call_blockers(p_prospect_id, p_phone, public.phone_now());
  if array_length(blockers, 1) > 0 then
    raise exception 'Can''t call: %', array_to_string(blockers, ' ') using errcode = 'P0001';
  end if;
  select * into s from public.phone_agent_settings where id;
  if p_prospect_id is not null then select * into p from public.vendor_prospects where id = p_prospect_id; end if;
  insert into public.phone_calls (mode, prospect_id, phone_e164, vendor_name, category, requested_by)
  values (case when p_prospect_id is null then 'prototype' else 'pilot' end, p_prospect_id, p_phone,
          coalesce(p.business_name, 'Evntly prototype test'), coalesce(p.category, 'photographer'), auth.uid())
  returning * into c;
  insert into public.phone_call_events (call_id, actor, actor_user_id, action, detail)
  values (c.id, 'admin', auth.uid(), 'start', jsonb_build_object('mode', c.mode));
  return query select c.id, c.ref, c.vendor_name, c.contact_first_name, c.category, c.mode;
end;
$$;
revoke all on function public.admin_phone_start_call(uuid, text) from public, anon;
grant execute on function public.admin_phone_start_call(uuid, text) to authenticated;

create or replace function public.admin_phone_call_dialed(p_call_id uuid, p_provider_call_id text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  update public.phone_calls
    set provider_call_id = coalesce(p_provider_call_id, provider_call_id),
        status = case when p_error is not null then 'failed' else status end,
        disconnection_reason = case when p_error is not null then left(p_error, 80) else disconnection_reason end,
        updated_at = now()
    where id = p_call_id;
  insert into public.phone_call_events (call_id, actor, actor_user_id, action, detail)
  values (p_call_id, 'admin', auth.uid(), case when p_error is null then 'dialed' else 'dial_failed' end,
          jsonb_build_object('provider_call_id', p_provider_call_id, 'error', left(p_error, 300)));
end;
$$;
revoke all on function public.admin_phone_call_dialed(uuid, text, text) from public, anon;
grant execute on function public.admin_phone_call_dialed(uuid, text, text) to authenticated;

create or replace function public.admin_phone_review_call(p_call_id uuid, p_score smallint, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  update public.phone_calls set quality_score = p_score, quality_note = left(p_note, 500), updated_at = now() where id = p_call_id;
end;
$$;
revoke all on function public.admin_phone_review_call(uuid, smallint, text) from public, anon;
grant execute on function public.admin_phone_review_call(uuid, smallint, text) to authenticated;

create or replace function public.admin_phone_followup_done(p_id bigint, p_status text default 'done')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  if p_status not in ('done', 'cancelled') then raise exception 'Unknown status.' using errcode = '22023'; end if;
  update public.phone_followups set status = p_status, done_at = now() where id = p_id;
end;
$$;
revoke all on function public.admin_phone_followup_done(bigint, text) from public, anon;
grant execute on function public.admin_phone_followup_done(bigint, text) to authenticated;

-- The voice agent's actions (service role only, from our signed routes) ---------------
--
-- p_ref + p_provider_call_id identify the call: the ref is ours (sent to the
-- provider as call metadata when dialling), the provider id is bound on first
-- use and must match afterwards. The agent can only touch that call.
create or replace function public.phone_agent_tool(p_ref text, p_provider_call_id text, p_tool text, p_args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.phone_calls;
  s public.phone_agent_settings;
  v_local timestamp;
  due timestamptz;
  v_email text;
  quote text;
  result jsonb;
  v_outcome text;
begin
  select * into c from public.phone_calls where ref = p_ref for update;
  if not found then raise exception 'Unknown call.' using errcode = 'P0001'; end if;
  if c.provider_call_id is null then
    update public.phone_calls pc set provider_call_id = p_provider_call_id where pc.id = c.id;
  elsif c.provider_call_id <> p_provider_call_id then
    raise exception 'Call id mismatch.' using errcode = '42501';
  end if;
  if c.status = 'failed' or (c.status = 'ended' and c.ended_at < now() - interval '10 minutes' and p_tool <> 'record_outcome') then
    raise exception 'This call has finished.' using errcode = 'P0001';
  end if;
  select * into s from public.phone_agent_settings where id;
  if jsonb_typeof(coalesce(p_args, '{}'::jsonb)) <> 'object' then raise exception 'Bad arguments.' using errcode = '22023'; end if;

  case p_tool
  -- Stop calling this number, for good.
  when 'opt_out' then
    -- Prototype calls go to Sai's own phone: record the opt-out (so the test
    -- is visible) but don't permanently block his own number.
    if c.mode = 'prototype' then
      update public.phone_calls pc set opted_out_at = now(), outcome = 'opted_out', interest = 'none', updated_at = now() where pc.id = c.id;
      insert into public.phone_call_events (call_id, actor, action, detail) values (c.id, 'agent', 'opt_out', jsonb_build_object('prototype', true));
      return jsonb_build_object('ok', true, 'prototype', true,
        'say', 'Confirm they won''t be contacted again, apologise for the interruption, and end the call.');
    end if;
    insert into public.phone_suppression (phone_e164, reason, source, prospect_id, call_id)
    values (c.phone_e164, left(coalesce(nullif(p_args ->> 'reason', ''), 'Asked not to be contacted again (AI call)'), 200), 'call_opt_out', c.prospect_id, c.id)
    on conflict do nothing;
    update public.phone_consents set withdrawn_at = now() where phone_e164 = c.phone_e164 and withdrawn_at is null;
    update public.phone_calls pc set opted_out_at = now(), outcome = 'opted_out', interest = 'none', updated_at = now() where pc.id = c.id;
    if c.prospect_id is not null then
      update public.vendor_prospects
        set do_not_contact = true, do_not_contact_at = coalesce(do_not_contact_at, now()),
            do_not_contact_reason = coalesce(do_not_contact_reason, 'Asked not to be contacted (AI phone call)'),
            next_follow_up_at = null, updated_at = now()
        where id = c.prospect_id;
      insert into public.vendor_prospect_events (prospect_id, action, note)
      values (c.prospect_id, 'do_not_contact', 'Asked not to be contacted on AI phone call ' || c.ref);
    end if;
    result := jsonb_build_object('ok', true, 'say', 'Confirm they won''t be contacted again, apologise for the interruption, and end the call.');

  -- Send the registration link, only after they said yes to receiving it.
  when 'send_registration_link' then
    if coalesce((p_args ->> 'consent_confirmed')::boolean, false) is not true then
      raise exception 'Ask for permission to send the link first.' using errcode = 'P0001';
    end if;
    quote := btrim(coalesce(p_args ->> 'consent_quote', ''));
    if char_length(quote) < 2 then raise exception 'Include what they said when agreeing (consent_quote).' using errcode = '22023'; end if;
    if c.link_sent_at is not null then
      return jsonb_build_object('ok', true, 'already_sent', true, 'say', 'The link was already sent on this call.');
    end if;
    if p_args ->> 'channel' = 'email' then
      v_email := lower(btrim(coalesce(p_args ->> 'email', '')));
      if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
        raise exception 'That email address doesn''t look right; read it back and ask again.' using errcode = '22023';
      end if;
    elsif p_args ->> 'channel' <> 'sms' then
      raise exception 'channel must be sms or email.' using errcode = '22023';
    end if;
    insert into public.phone_consents (prospect_id, phone_e164, kind, basis, evidence, call_id, expires_at)
    values (c.prospect_id, c.phone_e164, case when p_args ->> 'channel' = 'email' then 'email_link' else 'sms_link' end,
            'express_verbal_on_call', format('On AI call %s they agreed to receive the registration link by %s: "%s"', c.ref, p_args ->> 'channel', left(quote, 300)),
            c.id, now() + interval '30 days');
    update public.phone_calls pc
      set link_sent_at = now(), link_channel = p_args ->> 'channel',
          link_to = case when p_args ->> 'channel' = 'email' then v_email else c.phone_e164 end,
          outcome = case when pc.outcome is null or pc.outcome in ('interested', 'other') then 'link_sent' else pc.outcome end, updated_at = now()
      where pc.id = c.id;
    if c.prospect_id is not null and v_email is not null then
      update public.vendor_prospects vp set email = v_email, updated_at = now() where vp.id = c.prospect_id and vp.email is null
        and not exists (select 1 from public.vendor_prospects o where o.email_normalized = v_email);
    end if;
    -- The server sends it (SMS or email) using this.
    result := jsonb_build_object('ok', true, 'send', jsonb_build_object(
      'channel', p_args ->> 'channel',
      'to', case when p_args ->> 'channel' = 'email' then v_email else c.phone_e164 end,
      'campaign', 'aicall-' || c.ref),
      'say', 'Tell them the link is on its way and what it will come from (Evntly).');

  -- Our team prepares a draft listing for them to check and claim.
  when 'request_assisted_listing' then
    if coalesce((p_args ->> 'permission_confirmed')::boolean, false) is not true then
      raise exception 'Ask whether they''d like us to prepare the listing first.' using errcode = 'P0001';
    end if;
    v_email := nullif(lower(btrim(coalesce(p_args ->> 'email', ''))), '');
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'That email address doesn''t look right.' using errcode = '22023';
    end if;
    insert into public.phone_consents (prospect_id, phone_e164, kind, basis, evidence, call_id)
    values (c.prospect_id, c.phone_e164, 'assisted_listing', 'express_verbal_on_call',
            format('On AI call %s they asked Evntly to prepare a draft listing for them to review: "%s"', c.ref, left(coalesce(p_args ->> 'consent_quote', 'yes'), 300)), c.id);
    insert into public.phone_followups (call_id, prospect_id, kind, due_at, email, notes)
    values (c.id, c.prospect_id, 'assisted_listing', now() + interval '1 day', v_email, left(p_args ->> 'details', 1000));
    update public.phone_calls pc set assisted_requested_at = now(),
      outcome = case when pc.outcome is null or pc.outcome in ('interested', 'link_sent', 'other') then 'assisted_requested' else pc.outcome end, updated_at = now()
      where pc.id = c.id;
    result := jsonb_build_object('ok', true, 'say', format('Tell them %s will prepare a draft within one business day and email a private link so they can check every detail before anything goes live.', s.owner_name));

  -- A callback from Sai (or the agent) at a time they chose.
  when 'schedule_callback' then
    begin
      due := (p_args ->> 'when')::timestamptz;
    exception when others then
      raise exception 'Give the time as an ISO date-time in Sydney time, e.g. 2026-12-03T14:00:00+11:00.' using errcode = '22023';
    end;
    if due < public.phone_now() + interval '15 minutes' or due > public.phone_now() + interval '30 days' then
      raise exception 'Pick a time between 15 minutes and 30 days from now.' using errcode = '22023';
    end if;
    if not public.phone_legal_window_ok(due) then
      raise exception 'That time is outside permitted calling hours (weekdays 9am–8pm, Saturday 9am–5pm, not Sundays or public holidays). Offer another time.' using errcode = 'P0001';
    end if;
    insert into public.phone_consents (prospect_id, phone_e164, kind, basis, evidence, call_id, expires_at)
    values (c.prospect_id, c.phone_e164, 'callback', 'express_verbal_on_call',
            format('On AI call %s they asked for a callback at %s', c.ref, to_char(due at time zone 'Australia/Sydney', 'Dy DD Mon HH24:MI')), c.id, due + interval '7 days');
    insert into public.phone_followups (call_id, prospect_id, kind, due_at, notes)
    values (c.id, c.prospect_id, 'callback', due, left(p_args ->> 'notes', 1000));
    update public.phone_calls pc set outcome = case when pc.outcome is null or pc.outcome in ('interested', 'busy_call_later', 'other') then 'callback_booked' else pc.outcome end, updated_at = now()
      where pc.id = c.id;
    result := jsonb_build_object('ok', true, 'say', format('Confirm %s will call on %s.', s.owner_name, to_char(due at time zone 'Australia/Sydney', 'FMDay FMDD FMMonth "at" FMHH12:MI am')));

  -- Can Sai take a live transfer right now?
  when 'check_transfer' then
    v_local := public.phone_now() at time zone 'Australia/Sydney';
    if s.owner_transfer_number is not null and extract(isodow from v_local) <= 5
       and v_local::time >= s.transfer_start and v_local::time < s.transfer_end then
      result := jsonb_build_object('available', true, 'say', format('Say you''ll put them through to %s now, then use transfer_to_owner.', s.owner_name));
    else
      result := jsonb_build_object('available', false, 'say', format('%s can''t take a call right now. Offer a callback at a time that suits them.', s.owner_name));
    end if;

  when 'record_outcome' then
    v_outcome := p_args ->> 'outcome';
    if v_outcome is null or v_outcome not in ('interested', 'busy_call_later', 'not_interested', 'already_registered', 'voicemail', 'wrong_number', 'transferred', 'other') then
      raise exception 'Unknown outcome.' using errcode = '22023';
    end if;
    if p_args ->> 'interest' is not null and p_args ->> 'interest' not in ('high', 'medium', 'low', 'none') then
      raise exception 'interest must be high, medium, low or none.' using errcode = '22023';
    end if;
    update public.phone_calls pc set
      -- Stronger outcomes recorded by other actions win over a later generic one.
      outcome = case when pc.outcome in ('opted_out') then pc.outcome
                     when pc.outcome in ('link_sent', 'assisted_requested', 'callback_booked') and v_outcome in ('interested', 'other', 'busy_call_later') then pc.outcome
                     else v_outcome end,
      interest = coalesce(p_args ->> 'interest', pc.interest),
      objections = coalesce((select array_agg(left(x, 60)) from jsonb_array_elements_text(coalesce(p_args -> 'objections', '[]'::jsonb)) x), pc.objections),
      summary = coalesce(left(p_args ->> 'summary', 2000), pc.summary),
      transferred_at = case when v_outcome = 'transferred' then coalesce(pc.transferred_at, now()) else pc.transferred_at end,
      updated_at = now()
    where pc.id = c.id;
    result := jsonb_build_object('ok', true);
  else
    raise exception 'Unknown tool.' using errcode = '22023';
  end case;

  insert into public.phone_call_events (call_id, actor, action, detail)
  values (c.id, 'agent', p_tool, coalesce(p_args, '{}'::jsonb) - 'summary');
  return result;
end;
$$;
revoke all on function public.phone_agent_tool(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.phone_agent_tool(text, text, text, jsonb) to service_role;

-- Provider lifecycle webhook: call started / ended / analysed. On the end of
-- a pilot call the vendor outreach tracker is updated (contacted, replied,
-- interested) so the growth dashboard counts it, and the cost is logged as
-- acquisition spend.
create or replace function public.phone_agent_call_event(p_ref text, p_provider_call_id text, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.phone_calls;
  s public.phone_agent_settings;
  usd integer;
  connected boolean;
  p public.vendor_prospects;
begin
  select * into c from public.phone_calls where ref = p_ref for update;
  if not found then raise exception 'Unknown call.' using errcode = 'P0001'; end if;
  if c.provider_call_id is not null and c.provider_call_id <> p_provider_call_id then
    raise exception 'Call id mismatch.' using errcode = '42501';
  end if;
  select * into s from public.phone_agent_settings where id;

  if p_event = 'call_started' then
    update public.phone_calls set provider_call_id = p_provider_call_id, status = 'in_progress',
      started_at = coalesce(started_at, to_timestamp((p_payload ->> 'start_timestamp')::bigint / 1000.0), now()), updated_at = now()
      where id = c.id;
  elsif p_event in ('call_ended', 'call_analyzed') then
    usd := nullif(p_payload ->> 'cost_usd_cents', '')::numeric::int;
    update public.phone_calls set
      provider_call_id = p_provider_call_id,
      status = 'ended',
      started_at = coalesce(started_at, to_timestamp(nullif(p_payload ->> 'start_timestamp', '')::bigint / 1000.0)),
      ended_at = coalesce(ended_at, to_timestamp(nullif(p_payload ->> 'end_timestamp', '')::bigint / 1000.0), now()),
      duration_seconds = coalesce(nullif(p_payload ->> 'duration_seconds', '')::numeric::int, duration_seconds),
      disconnection_reason = coalesce(left(p_payload ->> 'disconnection_reason', 80), disconnection_reason),
      outcome = coalesce(outcome, case
        when p_payload ->> 'disconnection_reason' in ('voicemail_reached', 'machine_detected') then 'voicemail'
        when p_payload ->> 'disconnection_reason' in ('dial_no_answer', 'dial_busy', 'dial_failed', 'error_no_audio_received') then 'no_answer'
        when p_payload ->> 'disconnection_reason' like '%transfer%' then 'transferred'
        else null end),
      transferred_at = case when p_payload ->> 'disconnection_reason' like '%transfer%' then coalesce(transferred_at, now()) else transferred_at end,
      summary = coalesce(summary, left(p_payload ->> 'summary', 2000)),
      -- Transcript only with recording switched on AND consent given on the call.
      transcript = case when s.recording_enabled and c.recording_consented then left(p_payload ->> 'transcript', 60000) else null end,
      cost_usd_cents = coalesce(usd, cost_usd_cents),
      cost_aud_cents = coalesce(round(usd * s.usd_to_aud)::int, cost_aud_cents),
      updated_at = now()
    where id = c.id
    returning * into c;

    -- First time we see the end: outreach tracker + spend.
    if p_event = 'call_ended' and not exists (select 1 from public.phone_call_events e where e.call_id = c.id and e.action = 'call_ended') then
      if c.cost_aud_cents > 0 then
        insert into public.acquisition_spend (day, channel, audience, amount_cents, note)
        values ((now() at time zone 'Australia/Sydney')::date, 'ai_phone', 'vendor', c.cost_aud_cents, 'AI phone call ' || c.ref || ' (' || c.mode || ')');
      end if;
      connected := coalesce(c.outcome, 'other') not in ('voicemail', 'no_answer', 'wrong_number') and coalesce(c.duration_seconds, 0) >= 10;
      if c.prospect_id is not null then
        select * into p from public.vendor_prospects where id = c.prospect_id for update;
        update public.vendor_prospects set
          contacted_at = coalesce(contacted_at, now()), last_contacted_at = now(),
          replied_at = case when connected then coalesce(replied_at, now()) else replied_at end,
          stage = case when not p.do_not_contact and c.outcome in ('interested', 'link_sent', 'assisted_requested', 'callback_booked', 'transferred') then 'interested'
                       when p.stage in ('discovered', 'verified', 'contact_eligible', 'outreach_approved') then 'contacted'
                       else p.stage end,
          next_follow_up_at = case when connected then null else next_follow_up_at end,
          updated_at = now()
        where id = c.prospect_id;
        insert into public.vendor_prospect_events (prospect_id, action, from_stage, to_stage, note)
        values (c.prospect_id, 'contacted', p.stage, p.stage, 'AI phone call ' || c.ref);
        if connected then
          insert into public.vendor_prospect_events (prospect_id, action, note)
          values (c.prospect_id, 'replied', 'Spoke on AI phone call ' || c.ref || coalesce(': ' || c.outcome, ''));
        end if;
      end if;
    end if;
  elsif p_event like 'transfer_%' then
    if p_event = 'transfer_bridged' then
      update public.phone_calls set transferred_at = coalesce(transferred_at, now()), outcome = case when outcome = 'opted_out' then outcome else 'transferred' end, updated_at = now() where id = c.id;
    end if;
  else
    return; -- events we don't use
  end if;

  insert into public.phone_call_events (call_id, actor, action, detail)
  values (c.id, 'provider', p_event, jsonb_build_object('disconnection_reason', p_payload ->> 'disconnection_reason', 'duration_seconds', p_payload ->> 'duration_seconds', 'cost_usd_cents', p_payload ->> 'cost_usd_cents'));
end;
$$;
revoke all on function public.phone_agent_call_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.phone_agent_call_event(text, text, text, jsonb) to service_role;

-- SMS opt-out ("STOP" reply to the registration-link text), from our signed
-- Twilio webhook. Permanent, like every other opt-out.
create or replace function public.phone_agent_sms_stop(p_phone text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_phone !~ '^\+61[2-478][0-9]{8}$' then return; end if;
  insert into public.phone_suppression (phone_e164, reason, source)
  values (p_phone, left('Replied ' || coalesce(nullif(btrim(p_body), ''), 'STOP') || ' to SMS', 200), 'sms_stop') on conflict do nothing;
  update public.phone_consents set withdrawn_at = now() where phone_e164 = p_phone and withdrawn_at is null;
  update public.vendor_prospects
    set do_not_contact = true, do_not_contact_at = coalesce(do_not_contact_at, now()),
        do_not_contact_reason = coalesce(do_not_contact_reason, 'Replied STOP to SMS'), next_follow_up_at = null, updated_at = now()
    where phone = p_phone and not do_not_contact;
  insert into public.phone_call_events (actor, action, detail) values ('system', 'sms_stop', jsonb_build_object('phone_last3', right(p_phone, 3)));
end;
$$;
revoke all on function public.phone_agent_sms_stop(text, text) from public, anon, authenticated;
grant execute on function public.phone_agent_sms_stop(text, text) to service_role;

-- Pilot results for Admin → Growth and Admin → Phone agent --------------------------
-- Registrations / listings resulting from calls: a vendor account created after
-- the call whose email is the prospect's or the one the link was emailed to,
-- or a founding application / listing draft carrying the call's campaign tag
-- (aicall-<ref>). Test/internal accounts excluded.
create or replace function public.admin_phone_agent_summary()
returns table (measure text, value bigint)
language sql
stable
security definer
set search_path to ''
as $$
  with test_users as (select id from public.internal_test_user_ids() as t(id)),
  calls as (select * from public.phone_calls),
  emails as (
    select c.id as call_id, c.created_at, lower(x.email) as email
    from calls c
    left join public.vendor_prospects p on p.id = c.prospect_id
    cross join lateral (values (p.email), (case when c.link_channel = 'email' then c.link_to end)) as x(email)
    where x.email is not null
  ),
  registered as (
    select distinct u.id::text as user_id
    from public.users u
    join emails e on e.email = lower(u.email) and u.created_at >= e.created_at
    where u.role = 'vendor' and u.id::text not in (select id from test_users)
    union
    select distinct ba.user_id::text from public.beta_applications ba
    where ba.campaign like 'aicall-%' and ba.user_id is not null and ba.user_id::text not in (select id from test_users)
    union
    select distinct d.claimed_by::text from public.vendor_listing_drafts d
    where d.campaign like 'aicall-%' and d.claimed_by is not null and d.claimed_by::text not in (select id from test_users)
  ),
  listings as (
    select sp.id, sp.status,
      (select count(*) from public.portfolio_items pi where pi.provider_id = sp.id) as photos,
      (select count(*) from public.vendor_packages vp where vp.provider_id = sp.id and vp.active) as packages
    from public.service_providers sp
    where sp.owner_user_id::text in (select user_id from registered) and not coalesce(sp.is_demo, false)
  )
  select m.measure, m.value from (
    select 'calls'::text as measure, (select count(*) from calls) as value
    union all select 'pilot_calls', (select count(*) from calls where mode = 'pilot')
    union all select 'prototype_calls', (select count(*) from calls where mode = 'prototype')
    union all select 'connected', (select count(*) from calls where status = 'ended' and coalesce(outcome, 'other') not in ('voicemail', 'no_answer', 'wrong_number'))
    union all select 'talk_seconds', (select coalesce(sum(duration_seconds), 0) from calls)
    union all select 'interested', (select count(*) from calls where interest in ('high', 'medium') or outcome in ('interested', 'link_sent', 'assisted_requested', 'callback_booked', 'transferred'))
    union all select 'links_sent', (select count(*) from calls where link_sent_at is not null)
    union all select 'assisted_requested', (select count(*) from calls where assisted_requested_at is not null)
    union all select 'callbacks', (select count(*) from public.phone_followups where kind = 'callback')
    union all select 'transfers', (select count(*) from calls where transferred_at is not null)
    union all select 'opted_out', (select count(*) from calls where opted_out_at is not null)
    union all select 'registrations', (select count(*) from registered)
    union all select 'listings_created', (select count(*) from listings)
    union all select 'listings_completed', (select count(*) from listings where status = 'approved' and photos >= 3 and packages >= 1)
    union all select 'cost_aud_cents', (select coalesce(sum(cost_aud_cents), 0) from calls)
    union all select 'avg_quality_x10', (select coalesce(round(avg(quality_score) * 10), 0)::bigint from calls where quality_score is not null)
    union all select 'reviewed_calls', (select count(*) from calls where quality_score is not null)
  ) m
  where public.is_admin();
$$;
revoke all on function public.admin_phone_agent_summary() from public, anon;
grant execute on function public.admin_phone_agent_summary() to authenticated;
