-- Founding vendor referrals.
--
-- Every APPROVED founding vendor gets one shareable referral code
-- (evntlyapp.com/founding-vendors?ref=CODE). A vendor who claims a place
-- through that link is recorded as referred by them (first touch only; no
-- self-referral; only approved referrers count). The only reward is an
-- Instagram spotlight, tracked here so it isn't forgotten:
--   * beta_applications.referral_code      the referrer's code (created on first use)
--   * beta_applications.referred_by        the referrer's application
--   * beta_applications.spotlight_posted_at when the spotlight went up
--   * source 'referral'
-- Referral codes grant nothing: approval, consent and every other check are
-- unchanged.
--
-- Rollback: supabase/rollbacks/20261105090000_founding_referrals.down.sql

alter table public.beta_applications add column if not exists referral_code text;
alter table public.beta_applications add column if not exists referred_by uuid references public.beta_applications(id) on delete set null;
alter table public.beta_applications add column if not exists spotlight_posted_at timestamptz;

alter table public.beta_applications drop constraint if exists beta_applications_referral_code_format;
alter table public.beta_applications add constraint beta_applications_referral_code_format
  check (referral_code is null or referral_code ~ '^[a-z0-9]{8,12}$');
alter table public.beta_applications drop constraint if exists beta_applications_referral_code_unique;
alter table public.beta_applications add constraint beta_applications_referral_code_unique unique (referral_code);
alter table public.beta_applications drop constraint if exists beta_applications_no_self_referral;
alter table public.beta_applications add constraint beta_applications_no_self_referral check (referred_by is distinct from id);
create index if not exists beta_applications_referred_by_idx on public.beta_applications (referred_by);

alter table public.beta_applications drop constraint if exists beta_applications_source_check;
alter table public.beta_applications add constraint beta_applications_source_check
  check (source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'referral', 'direct'));

-- The signed-in vendor's referral code, created on first use. Approved
-- founding vendors only.
create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  app record;
  code text;
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  select * into app from public.beta_applications where user_id = uid for update;
  if not found or app.status <> 'approved' then
    raise exception 'Referral links are for approved Founding Vendors.' using errcode = 'P0001';
  end if;
  if app.referral_code is not null then return app.referral_code; end if;
  loop
    code := left(replace(gen_random_uuid()::text, '-', ''), 10);
    begin
      update public.beta_applications set referral_code = code, updated_at = now() where id = app.id;
      return code;
    exception when unique_violation then
      -- extremely unlikely; try another
    end;
  end loop;
end;
$$;
revoke all on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

-- Counts only: a vendor never sees who they referred.
create or replace function public.my_referral_stats()
returns table (referral_code text, joined integer, submitted integer, approved integer)
language sql
stable
security definer
set search_path = ''
as $$
  select me.referral_code,
         count(r.id)::integer,
         count(r.id) filter (where r.status in ('submitted', 'needs_changes', 'approved'))::integer,
         count(r.id) filter (where r.status = 'approved')::integer
  from public.beta_applications me
  left join public.beta_applications r on r.referred_by = me.id and r.status <> 'withdrawn'
  where me.user_id = auth.uid()
  group by me.referral_code;
$$;
revoke all on function public.my_referral_stats() from public, anon;
grant execute on function public.my_referral_stats() to authenticated;

-- Claim, now with an optional referral code. Everything else is unchanged.
drop function if exists public.claim_founding_vendor_place(text, text);
create or replace function public.claim_founding_vendor_place(
  p_invite_token_hash text default null,
  p_source text default 'direct',
  p_referral_code text default null
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
  referrer uuid := null;
  src text := case when p_source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'referral')
                   then p_source else 'direct' end;
  is_new boolean := false;
begin
  if uid is null then raise exception 'Log in to claim a place.' using errcode = '42501'; end if;
  if exists (select 1 from public.users u where u.id = uid::text and u.suspended_at is not null) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('beta_claim:' || uid::text, 0));

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

  -- A referral counts only if the code belongs to an approved founding
  -- vendor who isn't the person claiming.
  if p_referral_code is not null and p_referral_code ~ '^[a-z0-9]{8,12}$' then
    select r.id into referrer
    from public.beta_applications r
    where r.referral_code = p_referral_code and r.status = 'approved' and r.user_id <> uid;
  end if;

  select a.* into app from public.beta_applications a where a.user_id = uid for update;

  if not found then
    select sp.id into listing_id
    from public.service_providers sp
    where sp.owner_user_id = uid and not coalesce(sp.is_demo, false)
      and not exists (select 1 from public.beta_applications x where x.provider_id = sp.id)
    order by sp.created_at
    limit 1;

    insert into public.beta_applications (user_id, provider_id, status, source, submitted_at, referred_by)
    values (
      uid,
      listing_id,
      case when listing_id is null then 'started' else 'submitted' end,
      case when invite_result = 'ok' then 'waitlist_email' when referrer is not null then 'referral' else src end,
      case when listing_id is null then null else now() end,
      referrer
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
      invite_result := 'already_linked';
    end if;
  end if;

  return query select app.id, (select a.status from public.beta_applications a where a.id = app.id), invite_result, is_new;
end;
$$;
revoke all on function public.claim_founding_vendor_place(text, text, text) from public, anon;
grant execute on function public.claim_founding_vendor_place(text, text, text) to authenticated;

-- Admin: record that a referrer's Instagram spotlight was posted (or undo).
create or replace function public.admin_set_referral_spotlight(p_application_id uuid, p_posted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app record;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into app from public.beta_applications where id = p_application_id for update;
  if not found then raise exception 'Application not found.' using errcode = 'P0001'; end if;
  update public.beta_applications
    set spotlight_posted_at = case when p_posted then coalesce(spotlight_posted_at, now()) else null end, updated_at = now()
    where id = app.id;
  insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), 'referral_spotlight', 'beta_applications', app.id::text,
          jsonb_build_object('spotlight_posted_at', app.spotlight_posted_at), jsonb_build_object('posted', p_posted));
end;
$$;
revoke all on function public.admin_set_referral_spotlight(uuid, boolean) from public, anon;
grant execute on function public.admin_set_referral_spotlight(uuid, boolean) to authenticated;
