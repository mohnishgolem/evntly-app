-- Vendor acquisition pipeline: prospects found by research (not the opted-in
-- waitlist), tracked from discovery to an approved, active vendor.
--
--   discovered → verified → contact_eligible → outreach_approved → contacted → interested
--   (registered / profile completed / listing approved / active are read from
--    beta_applications and service_providers by the app, matched by email)
--
-- Rules the database enforces, whatever the app does:
--   * admin-only (is_admin(): admin role + MFA); no table grants for writes,
--     everything goes through the RPCs below, each audit-logged in
--     vendor_prospect_events
--   * a prospect can't become contact-eligible without a consent basis
--     (Spam Act 2003) and a way to reach them
--   * do-not-contact is permanent: declined / "no thanks" / unsubscribed
--     prospects can't be moved, approved or contacted again
--   * at most ONE follow-up, at least 7 days after first contact
--   * imports skip anyone already a prospect, on the waitlist, with an
--     Evntly account, or with a listing of the same name
-- Nothing here sends anything: contact is recorded after Sai sends it.
--
-- Rollback: supabase/rollbacks/20261106090000_vendor_acquisition.down.sql

create table if not exists public.vendor_prospects (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(btrim(business_name)) between 1 and 160),
  business_name_normalized text generated always as (lower(btrim(business_name))) stored,
  category text check (char_length(category) <= 40),
  suburb text check (char_length(suburb) <= 80),
  website text check (char_length(website) <= 300),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  email_normalized text generated always as (lower(btrim(email))) stored,
  instagram text check (char_length(instagram) <= 80),
  phone text check (char_length(phone) <= 60),
  source_url text check (char_length(source_url) <= 500),
  lead_quality text not null default 'B' check (lead_quality in ('A', 'B', 'C')),
  -- Why we may contact them. 'published_business_address' = inferred consent
  -- (address conspicuously published, no refusal notice, message about their
  -- business). 'verbal' = said yes on a call.
  consent_basis text not null default 'none'
    check (consent_basis in ('none', 'published_business_address', 'verbal', 'referral')),
  consent_note text check (char_length(consent_note) <= 300),
  stage text not null default 'discovered'
    check (stage in ('discovered', 'verified', 'contact_eligible', 'outreach_approved', 'contacted', 'interested')),
  contacted_at timestamptz,
  last_contacted_at timestamptz,
  follow_up_count integer not null default 0 check (follow_up_count between 0 and 1),
  next_follow_up_at timestamptz,
  replied_at timestamptz,
  do_not_contact boolean not null default false,
  do_not_contact_reason text check (char_length(do_not_contact_reason) <= 200),
  do_not_contact_at timestamptz,
  notes text check (char_length(notes) <= 1000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_prospects_email_unique unique (email_normalized),
  constraint vendor_prospects_name_unique unique (business_name_normalized),
  constraint vendor_prospects_dnc_has_time check (not do_not_contact or do_not_contact_at is not null)
);
create index if not exists vendor_prospects_stage_idx on public.vendor_prospects (stage) where not do_not_contact;
create index if not exists vendor_prospects_follow_up_idx on public.vendor_prospects (next_follow_up_at) where not do_not_contact;

create table if not exists public.vendor_prospect_events (
  id bigserial primary key,
  prospect_id uuid not null references public.vendor_prospects(id) on delete cascade,
  actor_user_id uuid,
  action text not null check (char_length(action) <= 40),
  from_stage text,
  to_stage text,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists vendor_prospect_events_prospect_idx on public.vendor_prospect_events (prospect_id, created_at desc);

alter table public.vendor_prospects enable row level security;
alter table public.vendor_prospect_events enable row level security;
revoke all on public.vendor_prospects, public.vendor_prospect_events from public, anon, authenticated;
revoke all on sequence public.vendor_prospect_events_id_seq from public, anon, authenticated;
grant select on public.vendor_prospects, public.vendor_prospect_events to authenticated;
drop policy if exists vendor_prospects_select_admin on public.vendor_prospects;
create policy vendor_prospects_select_admin on public.vendor_prospects for select to authenticated using (public.is_admin());
drop policy if exists vendor_prospect_events_select_admin on public.vendor_prospect_events;
create policy vendor_prospect_events_select_admin on public.vendor_prospect_events for select to authenticated using (public.is_admin());

-- Check (p_commit = false) or import a research batch. p_rows is a JSON array
-- of {business_name, category, suburb, website, email, instagram, phone,
-- source_url, lead_quality, consent_basis, consent_note, notes}. Returns one
-- verdict per row, in order; only 'new' rows are inserted, and only when
-- p_commit is true.
create or replace function public.admin_import_prospects(p_rows jsonb, p_commit boolean default false)
returns table (row_index integer, verdict text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  i integer := 0;
  v text;
  em text;
  nm text;
  seen_emails text[] := '{}';
  seen_names text[] := '{}';
  new_id uuid;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Send between 1 and 500 rows.' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    em := nullif(lower(btrim(coalesce(r ->> 'email', ''))), '');
    nm := lower(btrim(coalesce(r ->> 'business_name', '')));
    v := case
      when nm = '' or char_length(nm) > 160 then 'invalid'
      when em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then 'invalid'
      when coalesce(r ->> 'consent_basis', 'none') not in ('none', 'published_business_address', 'verbal', 'referral') then 'invalid'
      when coalesce(r ->> 'lead_quality', 'B') not in ('A', 'B', 'C') then 'invalid'
      when (em is not null and em = any(seen_emails)) or nm = any(seen_names) then 'duplicate_in_file'
      when exists (select 1 from public.vendor_prospects p where p.business_name_normalized = nm or (em is not null and p.email_normalized = em)) then 'already_prospect'
      when em is not null and exists (select 1 from public.vendor_waitlist w where w.email_normalized = em) then 'on_waitlist'
      when em is not null and exists (select 1 from public.users u where lower(u.email) = em) then 'has_account'
      when exists (select 1 from public.service_providers sp where lower(btrim(sp.name)) = nm and not coalesce(sp.is_demo, false)) then 'has_listing'
      else 'new'
    end;
    if em is not null then seen_emails := seen_emails || em; end if;
    if nm <> '' then seen_names := seen_names || nm; end if;

    if v = 'new' and p_commit then
      insert into public.vendor_prospects (business_name, category, suburb, website, email, instagram, phone, source_url,
                                          lead_quality, consent_basis, consent_note, notes, created_by)
      values (btrim(r ->> 'business_name'), left(r ->> 'category', 40), left(r ->> 'suburb', 80), left(r ->> 'website', 300), em,
              left(r ->> 'instagram', 80), left(r ->> 'phone', 60), left(r ->> 'source_url', 500),
              coalesce(r ->> 'lead_quality', 'B'), coalesce(r ->> 'consent_basis', 'none'), left(r ->> 'consent_note', 300),
              left(r ->> 'notes', 1000), auth.uid())
      returning id into new_id;
      insert into public.vendor_prospect_events (prospect_id, actor_user_id, action, to_stage)
      values (new_id, auth.uid(), 'imported', 'discovered');
    end if;
    row_index := i;
    verdict := v;
    return next;
  end loop;
end;
$$;
revoke all on function public.admin_import_prospects(jsonb, boolean) from public, anon;
grant execute on function public.admin_import_prospects(jsonb, boolean) to authenticated;

-- Move a prospect along the pipeline or record what happened. Actions:
--   verify            discovered → verified (details checked on their own site)
--   eligible          verified → contact_eligible (needs a consent basis and a contact route)
--   approve_outreach  contact_eligible → outreach_approved (Sai approved the message)
--   contacted         outreach_approved → contacted (first message sent; follow-up due in 7 days)
--   follow_up_sent    the one follow-up was sent (contacted, ≥ 7 days after first contact)
--   replied           they replied (stage unchanged)
--   interested        contacted → interested
--   declined          they said no / "no thanks" → do-not-contact (permanent)
--   do_not_contact    stop all contact (permanent), e.g. bounced or asked not to be contacted
create or replace function public.admin_prospect_action(p_prospect_id uuid, p_action text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  next_stage text;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into p from public.vendor_prospects where id = p_prospect_id for update;
  if not found then raise exception 'Prospect not found.' using errcode = 'P0001'; end if;
  if p.do_not_contact then
    raise exception 'This prospect asked not to be contacted, or was marked do-not-contact. That can''t be undone.' using errcode = 'P0001';
  end if;

  next_stage := p.stage;
  case p_action
    when 'verify' then
      if p.stage <> 'discovered' then raise exception 'Only discovered prospects can be verified.' using errcode = 'P0001'; end if;
      next_stage := 'verified';
    when 'eligible' then
      if p.stage <> 'verified' then raise exception 'Verify the prospect first.' using errcode = 'P0001'; end if;
      if p.consent_basis = 'none' then
        raise exception 'Record why we may contact them (consent basis) first.' using errcode = 'P0001';
      end if;
      if p.email is null and p.instagram is null and p.phone is null then
        raise exception 'There is no way to contact this prospect.' using errcode = 'P0001';
      end if;
      if p.email_normalized is not null and exists (
        select 1 from public.vendor_waitlist w where w.email_normalized = p.email_normalized and w.unsubscribed_at is not null
      ) then
        raise exception 'This address unsubscribed from Evntly emails.' using errcode = 'P0001';
      end if;
      next_stage := 'contact_eligible';
    when 'approve_outreach' then
      if p.stage <> 'contact_eligible' then raise exception 'Only contact-eligible prospects can be approved for outreach.' using errcode = 'P0001'; end if;
      next_stage := 'outreach_approved';
    when 'contacted' then
      if p.stage <> 'outreach_approved' then raise exception 'Approve the outreach before recording it as sent.' using errcode = 'P0001'; end if;
      update public.vendor_prospects
        set contacted_at = now(), last_contacted_at = now(), next_follow_up_at = now() + interval '7 days'
        where id = p.id;
      next_stage := 'contacted';
    when 'follow_up_sent' then
      if p.stage <> 'contacted' then raise exception 'Only contacted prospects can get a follow-up.' using errcode = 'P0001'; end if;
      if p.follow_up_count >= 1 then raise exception 'One follow-up has already been sent. No more.' using errcode = 'P0001'; end if;
      if p.replied_at is not null then raise exception 'They already replied; no follow-up needed.' using errcode = 'P0001'; end if;
      if p.contacted_at > now() - interval '7 days' then
        raise exception 'Wait at least 7 days after the first message.' using errcode = 'P0001';
      end if;
      update public.vendor_prospects
        set follow_up_count = 1, last_contacted_at = now(), next_follow_up_at = null
        where id = p.id;
    when 'replied' then
      if p.stage not in ('contacted', 'interested') then raise exception 'Record the first contact before a reply.' using errcode = 'P0001'; end if;
      update public.vendor_prospects set replied_at = coalesce(replied_at, now()), next_follow_up_at = null where id = p.id;
    when 'interested' then
      if p.stage <> 'contacted' then raise exception 'Only contacted prospects can be marked interested.' using errcode = 'P0001'; end if;
      update public.vendor_prospects set replied_at = coalesce(replied_at, now()), next_follow_up_at = null where id = p.id;
      next_stage := 'interested';
    when 'declined', 'do_not_contact' then
      update public.vendor_prospects
        set do_not_contact = true, do_not_contact_at = now(),
            do_not_contact_reason = left(coalesce(p_note, case when p_action = 'declined' then 'Declined' else 'Do not contact' end), 200),
            replied_at = case when p_action = 'declined' then coalesce(replied_at, now()) else replied_at end,
            next_follow_up_at = null
        where id = p.id;
    else
      raise exception 'Unknown action.' using errcode = '22023';
  end case;

  update public.vendor_prospects set stage = next_stage, updated_at = now() where id = p.id;
  insert into public.vendor_prospect_events (prospect_id, actor_user_id, action, from_stage, to_stage, note)
  values (p.id, auth.uid(), p_action, p.stage, next_stage, left(p_note, 300));
  return next_stage;
end;
$$;
revoke all on function public.admin_prospect_action(uuid, text, text) from public, anon;
grant execute on function public.admin_prospect_action(uuid, text, text) to authenticated;

-- Record why we may contact a prospect (before they're contact-eligible).
create or replace function public.admin_set_prospect_consent(p_prospect_id uuid, p_basis text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  if p_basis not in ('none', 'published_business_address', 'verbal', 'referral') then
    raise exception 'Unknown consent basis.' using errcode = '22023';
  end if;
  select * into p from public.vendor_prospects where id = p_prospect_id for update;
  if not found then raise exception 'Prospect not found.' using errcode = 'P0001'; end if;
  if p.do_not_contact then raise exception 'This prospect is do-not-contact.' using errcode = 'P0001'; end if;
  if p.stage not in ('discovered', 'verified') then
    raise exception 'Consent can only be changed before the prospect is approved for contact.' using errcode = 'P0001';
  end if;
  update public.vendor_prospects set consent_basis = p_basis, consent_note = left(p_note, 300), updated_at = now() where id = p.id;
  insert into public.vendor_prospect_events (prospect_id, actor_user_id, action, from_stage, to_stage, note)
  values (p.id, auth.uid(), 'consent:' || p_basis, p.stage, p.stage, left(p_note, 300));
end;
$$;
revoke all on function public.admin_set_prospect_consent(uuid, text, text) from public, anon;
grant execute on function public.admin_set_prospect_consent(uuid, text, text) to authenticated;

-- Daily acquisition report: pg_cron calls the app once a day at 21:00 UTC
-- (8am AEDT / 7am AEST). The route emails admins only. Uses the same shared
-- secret as the quote follow-ups. Skipped where pg_cron isn't installed
-- (local tests).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'acquisition-report';
    perform cron.schedule(
      'acquisition-report',
      '0 21 * * *',
      $job$
      select net.http_post(
        url := (select value from public.app_settings where key = 'site_url') || '/api/cron/acquisition-report',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select value from public.app_settings where key = 'cron_secret'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
      $job$
    );
  end if;
end $$;
