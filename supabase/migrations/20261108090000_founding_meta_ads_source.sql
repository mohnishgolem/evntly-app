-- Paid Meta traffic (Instagram/Facebook boosts and ads) as its own Founding
-- Vendor source, so ad spend is judged on the sign-ups it brings rather than
-- being counted as 'direct'. Ad links use ?src=meta_ads or
-- utm_source=meta|facebook|instagram with utm_medium=paid|cpc|ads.
-- claim_founding_vendor_place is the 20261105090000 definition with
-- 'meta_ads' added to its accepted sources; nothing else changes.

alter table public.beta_applications drop constraint if exists beta_applications_source_check;
alter table public.beta_applications add constraint beta_applications_source_check
  check (source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'referral', 'meta_ads', 'direct'));

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
  src text := case when p_source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'referral', 'meta_ads')
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
