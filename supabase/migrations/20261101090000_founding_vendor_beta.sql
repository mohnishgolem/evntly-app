-- Founding vendor beta: waitlist, invitations, applications, capacity, feedback.
--
--   beta_program        one row: capacity (default 20 approved places), invite
--                       expiry, send limits. Changed only via admin_set_beta_program().
--   vendor_waitlist     vendor contacts (CSV import or the /founding-vendors
--                       form). Admin-read only; written by the service role.
--                       Only rows with invite_consent and no unsubscribed_at
--                       can be invited.
--   beta_invitations    one per waitlist contact. Stores only the SHA-256 of
--                       the link token. Prepared/recorded via admin RPCs,
--                       delivery updates via the service role (Resend webhook).
--   beta_applications   one per user (and per listing). Created/changed only
--                       through RPCs. Approval locks beta_program so two
--                       admins can't approve past capacity at the same time.
--   beta_feedback       feedback and bug reports from applicants.
--
-- An invitation never grants anything: it only links an application to the
-- waitlist contact for tracking. Listing approval stays with the admin.
--
-- Rollback: supabase/rollbacks/20261101090000_founding_vendor_beta.down.sql

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.beta_program (
  id smallint primary key default 1 check (id = 1),
  capacity integer not null default 20 check (capacity between 0 and 1000),
  invite_expiry_days integer not null default 14 check (invite_expiry_days between 1 and 90),
  daily_send_limit integer not null default 50 check (daily_send_limit between 1 and 1000),
  batch_size_limit integer not null default 10 check (batch_size_limit between 1 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.beta_program (id) values (1) on conflict (id) do nothing;

create table if not exists public.vendor_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_normalized text generated always as (lower(btrim(email))) stored,
  first_name text check (char_length(first_name) <= 80),
  business_name text check (char_length(business_name) <= 160),
  category text check (char_length(category) <= 40),
  suburb text check (char_length(suburb) <= 80),
  source text not null default 'import' check (source in ('import', 'founding_page', 'manual')),
  -- Express consent to be emailed about vendor early access (Spam Act 2003).
  invite_consent boolean not null default false,
  consent_note text check (char_length(consent_note) <= 300),
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  -- Not a secret worth hashing: it can only unsubscribe this contact.
  unsubscribe_token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_waitlist_email_unique unique (email_normalized),
  constraint vendor_waitlist_unsubscribe_token_unique unique (unsubscribe_token)
);

create table if not exists public.beta_invitations (
  id uuid primary key default gen_random_uuid(),
  waitlist_id uuid not null references public.vendor_waitlist(id) on delete cascade,
  token_hash text check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'claimed', 'revoked')),
  send_count integer not null default 0,
  attempt_count integer not null default 0,
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  last_attempt_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  resend_email_id text,
  delivery_status text
    check (delivery_status in ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed')),
  delivery_updated_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_invitations_waitlist_unique unique (waitlist_id),
  constraint beta_invitations_token_unique unique (token_hash)
);
create index if not exists beta_invitations_resend_email_id_idx on public.beta_invitations (resend_email_id);
create index if not exists beta_invitations_last_sent_idx on public.beta_invitations (last_sent_at);

create table if not exists public.beta_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text references public.service_providers(id) on delete set null,
  invitation_id uuid references public.beta_invitations(id) on delete set null,
  status text not null default 'started'
    check (status in ('started', 'submitted', 'approved', 'needs_changes', 'rejected', 'withdrawn')),
  source text not null default 'direct'
    check (source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'direct')),
  admin_note text check (char_length(admin_note) <= 1000),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_applications_user_unique unique (user_id),
  constraint beta_applications_provider_unique unique (provider_id),
  constraint beta_applications_invitation_unique unique (invitation_id)
);
create index if not exists beta_applications_status_idx on public.beta_applications (status);

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('feedback', 'bug')),
  area text not null default 'other'
    check (area in ('listing', 'enquiries', 'quotes', 'bookings', 'messages', 'other')),
  message text not null check (char_length(btrim(message)) between 5 and 4000),
  page text check (char_length(page) <= 300),
  rating smallint check (rating between 1 and 5),
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  created_at timestamptz not null default now()
);
create index if not exists beta_feedback_user_idx on public.beta_feedback (user_id);
create index if not exists beta_feedback_created_idx on public.beta_feedback (created_at desc);

-- ---------------------------------------------------------------------------
-- Access: RLS on everything; anon gets nothing; writes go through RPCs or the
-- service role, except feedback inserts and admin feedback status changes.
-- ---------------------------------------------------------------------------

alter table public.beta_program enable row level security;
alter table public.vendor_waitlist enable row level security;
alter table public.beta_invitations enable row level security;
alter table public.beta_applications enable row level security;
alter table public.beta_feedback enable row level security;

revoke all on public.beta_program, public.vendor_waitlist, public.beta_invitations,
  public.beta_applications, public.beta_feedback from anon, authenticated;

grant select on public.beta_program, public.vendor_waitlist, public.beta_invitations,
  public.beta_applications, public.beta_feedback to authenticated;
grant insert (kind, area, message, page, rating) on public.beta_feedback to authenticated;
grant update (status) on public.beta_feedback to authenticated;

drop policy if exists beta_program_select_admin on public.beta_program;
create policy beta_program_select_admin on public.beta_program for select to authenticated using (public.is_admin());

drop policy if exists vendor_waitlist_select_admin on public.vendor_waitlist;
create policy vendor_waitlist_select_admin on public.vendor_waitlist for select to authenticated using (public.is_admin());

drop policy if exists beta_invitations_select_admin on public.beta_invitations;
create policy beta_invitations_select_admin on public.beta_invitations for select to authenticated using (public.is_admin());

drop policy if exists beta_applications_select on public.beta_applications;
create policy beta_applications_select on public.beta_applications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists beta_feedback_select on public.beta_feedback;
create policy beta_feedback_select on public.beta_feedback for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Applicants (any status except rejected/withdrawn) can send feedback as themselves.
drop policy if exists beta_feedback_insert_own on public.beta_feedback;
create policy beta_feedback_insert_own on public.beta_feedback for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.beta_applications a
      where a.user_id = (select auth.uid()) and a.status not in ('rejected', 'withdrawn')
    )
  );

drop policy if exists beta_feedback_update_admin on public.beta_feedback;
create policy beta_feedback_update_admin on public.beta_feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Public: places left (real numbers for the landing page)
-- ---------------------------------------------------------------------------

create or replace function public.founding_vendor_places()
returns table (capacity integer, approved integer, remaining integer)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select count(*)::integer as n
    from public.beta_applications a
    join public.service_providers sp on sp.id = a.provider_id
    where a.status = 'approved' and not coalesce(sp.is_demo, false)
  )
  select p.capacity, c.n, greatest(p.capacity - c.n, 0)
  from public.beta_program p, c
  where p.id = 1;
$$;
revoke all on function public.founding_vendor_places() from public;
grant execute on function public.founding_vendor_places() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invitation link lookup (claim page). Marks the first click. Returns only
-- what the link holder needs: a masked address and first name.
-- ---------------------------------------------------------------------------

create or replace function public.beta_invite_lookup(p_token_hash text)
returns table (state text, masked_email text, first_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::text, null::text;
    return;
  end if;

  select i.id, i.status, i.expires_at, i.clicked_at, w.email_normalized, w.first_name
    into inv
  from public.beta_invitations i
  join public.vendor_waitlist w on w.id = i.waitlist_id
  where i.token_hash = p_token_hash;

  if not found or inv.status in ('revoked', 'pending', 'sending', 'failed') then
    return query select 'invalid'::text, null::text, null::text;
    return;
  end if;

  if inv.clicked_at is null then
    update public.beta_invitations set clicked_at = now(), updated_at = now() where id = inv.id;
  end if;

  return query select
    case
      when inv.status = 'claimed' then 'claimed'
      when inv.expires_at is null or inv.expires_at <= now() then 'expired'
      else 'valid'
    end,
    left(split_part(inv.email_normalized, '@', 1), 1) || '•••@' || split_part(inv.email_normalized, '@', 2),
    inv.first_name;
end;
$$;
revoke all on function public.beta_invite_lookup(text) from public;
grant execute on function public.beta_invite_lookup(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vendor: claim a founding place (idempotent — one application per account)
-- ---------------------------------------------------------------------------

create or replace function public.claim_founding_vendor_place(
  p_invite_token_hash text default null,
  p_source text default 'direct'
) returns table (application_id uuid, status text, invite text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  my_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  app record;
  inv record;
  invite_result text := null;
  listing_id text;
  src text := case when p_source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach')
                   then p_source else 'direct' end;
  is_new boolean := false;
begin
  if uid is null then raise exception 'Log in to claim a place.' using errcode = '42501'; end if;
  if exists (select 1 from public.users u where u.id = uid::text and u.suspended_at is not null) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;

  -- Serialise claims for the same user (double taps, two tabs).
  perform pg_advisory_xact_lock(hashtextextended('beta_claim:' || uid::text, 0));

  -- Check the invite (if any) before creating anything.
  if p_invite_token_hash is not null then
    select i.id, i.status, i.expires_at, i.claimed_by, w.email_normalized
      into inv
    from public.beta_invitations i
    join public.vendor_waitlist w on w.id = i.waitlist_id
    where i.token_hash = p_invite_token_hash
    for update of i;

    if not found or inv.status in ('revoked', 'pending', 'sending', 'failed') then
      invite_result := 'invalid';
    elsif inv.status = 'claimed' then
      invite_result := case when inv.claimed_by = uid then 'attached' else 'claimed_by_other' end;
    elsif inv.expires_at is null or inv.expires_at <= now() then
      invite_result := 'expired';
    elsif inv.email_normalized <> my_email then
      invite_result := 'email_mismatch';
    else
      invite_result := 'ok';
    end if;
  end if;

  select a.* into app from public.beta_applications a where a.user_id = uid for update;

  if not found then
    select sp.id into listing_id
    from public.service_providers sp
    where sp.owner_user_id = uid and not coalesce(sp.is_demo, false)
      and not exists (select 1 from public.beta_applications x where x.provider_id = sp.id)
    order by sp.created_at
    limit 1;

    insert into public.beta_applications (user_id, provider_id, status, source, submitted_at)
    values (
      uid,
      listing_id,
      case when listing_id is null then 'started' else 'submitted' end,
      case when invite_result = 'ok' then 'waitlist_email' else src end,
      case when listing_id is null then null else now() end
    )
    returning * into app;
    is_new := true;
  end if;

  if invite_result = 'ok' then
    if app.invitation_id is null then
      update public.beta_invitations
        set status = 'claimed', claimed_at = now(), claimed_by = uid, updated_at = now()
        where id = inv.id;
      update public.beta_applications
        set invitation_id = inv.id, source = 'waitlist_email', updated_at = now()
        where id = app.id;
      invite_result := 'attached';
    else
      -- This account already used a different invitation; leave this one free.
      invite_result := 'already_linked';
    end if;
  end if;

  return query select app.id, (select a.status from public.beta_applications a where a.id = app.id), invite_result, is_new;
end;
$$;
revoke all on function public.claim_founding_vendor_place(text, text) from public;
grant execute on function public.claim_founding_vendor_place(text, text) to authenticated;

-- A listing created after claiming moves the application to "submitted".
create or replace function public.link_beta_application_to_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_user_id is not null and not coalesce(new.is_demo, false) then
    update public.beta_applications
      set provider_id = new.id, status = 'submitted', submitted_at = now(), updated_at = now()
      where user_id = new.owner_user_id and status = 'started' and provider_id is null;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_service_providers_beta_link on public.service_providers;
create trigger trg_service_providers_beta_link
  after insert on public.service_providers
  for each row execute function public.link_beta_application_to_listing();

-- Vendor resubmits after "needs changes", or withdraws.
create or replace function public.update_my_founding_application(p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  app record;
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  select * into app from public.beta_applications where user_id = uid for update;
  if not found then raise exception 'No application found.' using errcode = 'P0001'; end if;

  if p_action = 'resubmit' then
    if app.status <> 'needs_changes' then raise exception 'Nothing to resubmit.' using errcode = 'P0001'; end if;
    if app.provider_id is null then raise exception 'Create your listing first.' using errcode = 'P0001'; end if;
    update public.beta_applications set status = 'submitted', submitted_at = now(), updated_at = now() where id = app.id;
    return 'submitted';
  elsif p_action = 'withdraw' then
    if app.status in ('withdrawn', 'rejected') then return app.status; end if;
    update public.beta_applications set status = 'withdrawn', updated_at = now() where id = app.id;
    if app.status = 'approved' and app.provider_id is not null then
      update public.service_providers set founding_vendor = false where id = app.provider_id;
    end if;
    return 'withdrawn';
  elsif p_action = 'rejoin' then
    if app.status <> 'withdrawn' then raise exception 'Nothing to rejoin.' using errcode = 'P0001'; end if;
    update public.beta_applications
      set status = case when app.provider_id is null then 'started' else 'submitted' end,
          submitted_at = case when app.provider_id is null then null else now() end,
          updated_at = now()
      where id = app.id;
    return case when app.provider_id is null then 'started' else 'submitted' end;
  end if;
  raise exception 'Unknown action.' using errcode = '22023';
end;
$$;
revoke all on function public.update_my_founding_application(text) from public;
grant execute on function public.update_my_founding_application(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: decide an application. Approval also approves the listing and marks
-- it founding, in one transaction, under a lock on beta_program so capacity
-- can't be exceeded by concurrent approvals.
-- ---------------------------------------------------------------------------

create or replace function public.admin_decide_founding_application(
  p_application_id uuid,
  p_decision text,
  p_note text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  prog record;
  app record;
  sp record;
  taken integer;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'needs_changes', 'rejected') then
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;
  if char_length(note) > 1000 then raise exception 'Keep the note under 1000 characters.' using errcode = '22023'; end if;

  select * into prog from public.beta_program where id = 1 for update;
  select * into app from public.beta_applications where id = p_application_id for update;
  if not found then raise exception 'Application not found.' using errcode = 'P0001'; end if;
  if app.status = 'withdrawn' then raise exception 'The vendor withdrew this application.' using errcode = 'P0001'; end if;

  if p_decision = 'approved' then
    if app.status = 'approved' then return 'approved'; end if;
    if app.provider_id is null then
      raise exception 'This vendor hasn''t submitted a listing yet.' using errcode = 'P0001';
    end if;
    select id, status, is_demo into sp from public.service_providers where id = app.provider_id for update;
    if not found then raise exception 'Listing not found.' using errcode = 'P0001'; end if;
    if coalesce(sp.is_demo, false) then raise exception 'Sample listings can''t join the beta.' using errcode = 'P0001'; end if;
    if sp.status in ('suspended', 'rejected') then
      raise exception 'The listing is %. Reactivate it first.', sp.status using errcode = 'P0001';
    end if;

    select count(*) into taken
    from public.beta_applications a
    join public.service_providers s on s.id = a.provider_id
    where a.status = 'approved' and not coalesce(s.is_demo, false);
    if taken >= prog.capacity then
      raise exception 'All % founding places are filled. Raise the capacity first.', prog.capacity using errcode = 'P0001';
    end if;

    update public.service_providers set status = 'approved', founding_vendor = true where id = sp.id;
  else
    if p_decision = 'needs_changes' and char_length(coalesce(note, '')) < 5 then
      raise exception 'Tell the vendor what to change (5+ characters).' using errcode = '22023';
    end if;
    if app.status = 'approved' and app.provider_id is not null then
      update public.service_providers set founding_vendor = false where id = app.provider_id;
    end if;
  end if;

  update public.beta_applications
    set status = p_decision, admin_note = note, decided_at = now(), decided_by = auth.uid(), updated_at = now()
    where id = app.id;

  insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), 'founding_application', 'beta_applications', app.id::text,
          jsonb_build_object('status', app.status),
          jsonb_build_object('status', p_decision, 'note', note));

  return p_decision;
end;
$$;
revoke all on function public.admin_decide_founding_application(uuid, text, text) from public;
grant execute on function public.admin_decide_founding_application(uuid, text, text) to authenticated;

create or replace function public.admin_set_beta_program(
  p_capacity integer,
  p_invite_expiry_days integer,
  p_daily_send_limit integer,
  p_batch_size_limit integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prog record;
  taken integer;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into prog from public.beta_program where id = 1 for update;

  select count(*) into taken
  from public.beta_applications a
  join public.service_providers s on s.id = a.provider_id
  where a.status = 'approved' and not coalesce(s.is_demo, false);
  if p_capacity < taken then
    raise exception '% vendors are already approved; capacity can''t go below that.', taken using errcode = '22023';
  end if;

  update public.beta_program
    set capacity = p_capacity, invite_expiry_days = p_invite_expiry_days,
        daily_send_limit = p_daily_send_limit, batch_size_limit = p_batch_size_limit,
        updated_at = now(), updated_by = auth.uid()
    where id = 1;

  insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), 'beta_program', 'beta_program', '1',
          jsonb_build_object('capacity', prog.capacity, 'invite_expiry_days', prog.invite_expiry_days,
                             'daily_send_limit', prog.daily_send_limit, 'batch_size_limit', prog.batch_size_limit),
          jsonb_build_object('capacity', p_capacity, 'invite_expiry_days', p_invite_expiry_days,
                             'daily_send_limit', p_daily_send_limit, 'batch_size_limit', p_batch_size_limit));
end;
$$;
revoke all on function public.admin_set_beta_program(integer, integer, integer, integer) from public;
grant execute on function public.admin_set_beta_program(integer, integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: invitation sending. prepare → (app sends via Resend) → record.
-- prepare refuses contacts without consent, unsubscribed contacts, claimed
-- invitations, a send already in flight, a resend within 24 hours, and
-- anything over the rolling 24-hour limit.
-- ---------------------------------------------------------------------------

create or replace function public.admin_prepare_beta_invitation(
  p_waitlist_id uuid,
  p_token_hash text
) returns table (invitation_id uuid, email text, first_name text, unsubscribe_token text, expires_at timestamptz, send_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  prog record;
  w record;
  inv record;
  sent_today integer;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad token.' using errcode = '22023';
  end if;

  select * into prog from public.beta_program where id = 1 for update;

  select * into w from public.vendor_waitlist where id = p_waitlist_id;
  if not found then raise exception 'Contact not found.' using errcode = 'P0001'; end if;
  if not w.invite_consent then raise exception 'No consent to email this contact.' using errcode = 'P0001'; end if;
  if w.unsubscribed_at is not null then raise exception 'This contact unsubscribed.' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.users u
    join public.beta_applications a on a.user_id::text = u.id
    where lower(u.email) = w.email_normalized
  ) then
    raise exception 'This contact has already applied.' using errcode = 'P0001';
  end if;

  select count(*) into sent_today
  from public.beta_invitations i
  where i.last_attempt_at > now() - interval '24 hours';
  if sent_today >= prog.daily_send_limit then
    raise exception 'Daily limit of % invitations reached. Try again tomorrow.', prog.daily_send_limit using errcode = 'P0001';
  end if;

  select * into inv from public.beta_invitations i where i.waitlist_id = w.id for update;
  if found then
    if inv.status = 'claimed' then raise exception 'Already claimed.' using errcode = 'P0001'; end if;
    if inv.status = 'revoked' then raise exception 'Invitation revoked.' using errcode = 'P0001'; end if;
    if inv.status = 'sending' and inv.last_attempt_at > now() - interval '10 minutes' then
      raise exception 'A send is already in progress.' using errcode = 'P0001';
    end if;
    if inv.status = 'sent' and inv.last_sent_at > now() - interval '24 hours' then
      raise exception 'Sent less than 24 hours ago.' using errcode = 'P0001';
    end if;
    if inv.attempt_count >= 5 then raise exception 'Too many attempts for this contact.' using errcode = 'P0001'; end if;

    update public.beta_invitations i
      set token_hash = p_token_hash, expires_at = now() + make_interval(days => prog.invite_expiry_days),
          status = 'sending', attempt_count = i.attempt_count + 1, last_attempt_at = now(),
          last_error = null, updated_at = now()
      where i.id = inv.id
      returning * into inv;
  else
    insert into public.beta_invitations (waitlist_id, token_hash, expires_at, status, attempt_count, last_attempt_at)
    values (w.id, p_token_hash, now() + make_interval(days => prog.invite_expiry_days), 'sending', 1, now())
    returning * into inv;
  end if;

  return query select inv.id, w.email, w.first_name, w.unsubscribe_token, inv.expires_at, inv.send_count + 1;
end;
$$;
revoke all on function public.admin_prepare_beta_invitation(uuid, text) from public;
grant execute on function public.admin_prepare_beta_invitation(uuid, text) to authenticated;

create or replace function public.admin_record_beta_invitation(
  p_invitation_id uuid,
  p_ok boolean,
  p_resend_email_id text default null,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  if p_ok then
    update public.beta_invitations
      set status = 'sent', send_count = send_count + 1, last_sent_at = now(),
          first_sent_at = coalesce(first_sent_at, now()), resend_email_id = left(p_resend_email_id, 100),
          delivery_status = 'sent', delivery_updated_at = now(), last_error = null, updated_at = now()
      where id = p_invitation_id and status = 'sending';
  else
    update public.beta_invitations
      set status = 'failed', last_error = left(coalesce(p_error, 'Unknown error'), 500), updated_at = now()
      where id = p_invitation_id and status = 'sending';
  end if;
end;
$$;
revoke all on function public.admin_record_beta_invitation(uuid, boolean, text, text) from public;
grant execute on function public.admin_record_beta_invitation(uuid, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Unsubscribe (link in every invitation + RFC 8058 one-click header).
-- ---------------------------------------------------------------------------

create or replace function public.beta_unsubscribe(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.vendor_waitlist
    set unsubscribed_at = coalesce(unsubscribed_at, now()), invite_consent = false, updated_at = now()
    where unsubscribe_token = p_token;
  return found;
end;
$$;
revoke all on function public.beta_unsubscribe(text) from public;
grant execute on function public.beta_unsubscribe(text) to anon, authenticated;

-- Supabase's default privileges grant EXECUTE on new functions to anon
-- directly, which "revoke ... from public" doesn't undo. Only the places
-- counter, link lookup and unsubscribe are for signed-out visitors.
revoke execute on function public.claim_founding_vendor_place(text, text) from anon;
revoke execute on function public.update_my_founding_application(text) from anon;
revoke execute on function public.admin_decide_founding_application(uuid, text, text) from anon;
revoke execute on function public.admin_set_beta_program(integer, integer, integer, integer) from anon;
revoke execute on function public.admin_prepare_beta_invitation(uuid, text) from anon;
revoke execute on function public.admin_record_beta_invitation(uuid, boolean, text, text) from anon;
-- Trigger functions are never called directly; drop the default PUBLIC grant too.
revoke all on function public.link_beta_application_to_listing() from public, anon, authenticated;
