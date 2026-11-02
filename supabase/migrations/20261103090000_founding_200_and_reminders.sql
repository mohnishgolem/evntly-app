-- Founding vendors: 200-vendor goal, invitation reminders, no invites to
-- registered vendors.
--
--   * beta_program.capacity: default 200, and the live row moves from the
--     original 20 to 200 (only if it's still 20, so a capacity an admin has
--     set by hand is left alone). Approval stays capped and lock-protected.
--   * admin_prepare_beta_invitation: also refuses contacts who already have
--     a vendor listing (they're registered; no invitation needed).
--   * Reminders: one manual reminder per invitation, at least 3 days after
--     the first send, only while it's unclaimed and the contact hasn't
--     applied. A reminder issues a fresh link (only token hashes are stored)
--     and counts towards the same rolling 24-hour send limit.
--
-- Rollback: supabase/rollbacks/20261103090000_founding_200_and_reminders.down.sql

alter table public.beta_program alter column capacity set default 200;
update public.beta_program set capacity = 200, updated_at = now() where id = 1 and capacity = 20;

alter table public.beta_invitations add column if not exists reminder_sent_at timestamptz;
alter table public.beta_invitations add column if not exists reminder_attempted_at timestamptz;

-- Shared by invitations and reminders: true when this address already has a
-- real (non-sample) vendor listing.
create or replace function public.beta_contact_is_registered_vendor(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    join public.service_providers sp on sp.owner_user_id::text = u.id
    where lower(u.email) = lower(btrim(p_email)) and not coalesce(sp.is_demo, false)
  );
$$;
revoke all on function public.beta_contact_is_registered_vendor(text) from public, anon, authenticated;

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
  if public.beta_contact_is_registered_vendor(w.email_normalized) then
    raise exception 'This contact is already a registered vendor.' using errcode = 'P0001';
  end if;

  select count(*) into sent_today
  from public.beta_invitations i
  where i.last_attempt_at > now() - interval '24 hours'
     or i.reminder_attempted_at > now() - interval '24 hours';
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
revoke all on function public.admin_prepare_beta_invitation(uuid, text) from public, anon;
grant execute on function public.admin_prepare_beta_invitation(uuid, text) to authenticated;

-- Reminder: same checks as an invitation, plus: first sent 3+ days ago, no
-- reminder sent yet, and the invitation is still unclaimed.
create or replace function public.admin_prepare_beta_reminder(
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
  if public.beta_contact_is_registered_vendor(w.email_normalized) then
    raise exception 'This contact is already a registered vendor.' using errcode = 'P0001';
  end if;

  select * into inv from public.beta_invitations i where i.waitlist_id = w.id for update;
  if not found or inv.first_sent_at is null then raise exception 'Not invited yet.' using errcode = 'P0001'; end if;
  if inv.status = 'claimed' then raise exception 'Already claimed.' using errcode = 'P0001'; end if;
  if inv.status = 'revoked' then raise exception 'Invitation revoked.' using errcode = 'P0001'; end if;
  if inv.delivery_status in ('bounced', 'complained') then raise exception 'The invitation bounced or was reported.' using errcode = 'P0001'; end if;
  if inv.reminder_sent_at is not null then raise exception 'Reminder already sent.' using errcode = 'P0001'; end if;
  if inv.status = 'sending' then raise exception 'A send is already in progress.' using errcode = 'P0001'; end if;
  if inv.first_sent_at > now() - interval '3 days' then
    raise exception 'Too soon: reminders go 3+ days after the invitation.' using errcode = 'P0001';
  end if;
  if inv.reminder_attempted_at > now() - interval '10 minutes' then
    raise exception 'A reminder is already being sent.' using errcode = 'P0001';
  end if;

  select count(*) into sent_today
  from public.beta_invitations i
  where i.last_attempt_at > now() - interval '24 hours'
     or i.reminder_attempted_at > now() - interval '24 hours';
  if sent_today >= prog.daily_send_limit then
    raise exception 'Daily limit of % emails reached. Try again tomorrow.', prog.daily_send_limit using errcode = 'P0001';
  end if;

  -- Fresh link (the old token can't be recovered); the old one stops working.
  update public.beta_invitations i
    set token_hash = p_token_hash, expires_at = now() + make_interval(days => prog.invite_expiry_days),
        status = 'sending', reminder_attempted_at = now(), last_error = null, updated_at = now()
    where i.id = inv.id
    returning * into inv;

  return query select inv.id, w.email, w.first_name, w.unsubscribe_token, inv.expires_at, inv.send_count + 1;
end;
$$;
revoke all on function public.admin_prepare_beta_reminder(uuid, text) from public, anon;
grant execute on function public.admin_prepare_beta_reminder(uuid, text) to authenticated;

create or replace function public.admin_record_beta_reminder(
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
      set status = 'sent', send_count = send_count + 1, last_sent_at = now(), reminder_sent_at = now(),
          resend_email_id = left(p_resend_email_id, 100), delivery_status = 'sent',
          delivery_updated_at = now(), last_error = null, updated_at = now()
      where id = p_invitation_id and status = 'sending' and reminder_attempted_at is not null;
  else
    -- The link was rotated, so the invitation needs another send; the
    -- reminder stays available to retry.
    update public.beta_invitations
      set status = 'failed', last_error = left(coalesce(p_error, 'Unknown error'), 500), updated_at = now()
      where id = p_invitation_id and status = 'sending' and reminder_attempted_at is not null;
  end if;
end;
$$;
revoke all on function public.admin_record_beta_reminder(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_record_beta_reminder(uuid, boolean, text, text) to authenticated;
