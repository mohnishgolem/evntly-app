-- Founding vendors: scheduled invitations and reminders.
--
-- The app books an email with Resend's scheduledAt (Resend holds it and
-- sends it at that time, without our servers or anyone's computer), then
-- records it here:
--   * beta_invitations.scheduled_for: when Resend will send it
--   * delivery_status 'scheduled' until Resend's email.sent webhook arrives
--   * first_sent_at / last_sent_at use the scheduled time, so the 24-hour
--     resend block and the 3-day reminder rule count from the real send
-- admin_cancel_beta_send() undoes a booking after the app has cancelled it
-- with Resend: the contact can then be scheduled again (with a fresh link).
--
-- Rollback: supabase/rollbacks/20261104090000_founding_scheduled_sends.down.sql

alter table public.beta_invitations add column if not exists scheduled_for timestamptz;

alter table public.beta_invitations drop constraint if exists beta_invitations_delivery_status_check;
alter table public.beta_invitations add constraint beta_invitations_delivery_status_check
  check (delivery_status in ('scheduled', 'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed'));

create index if not exists beta_invitations_scheduled_idx on public.beta_invitations (scheduled_for)
  where delivery_status = 'scheduled';

-- Record an invitation send; p_scheduled_for set = booked with Resend for later.
drop function if exists public.admin_record_beta_invitation(uuid, boolean, text, text);
create or replace function public.admin_record_beta_invitation(
  p_invitation_id uuid,
  p_ok boolean,
  p_resend_email_id text default null,
  p_error text default null,
  p_scheduled_for timestamptz default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  at_time timestamptz := coalesce(p_scheduled_for, now());
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  if p_scheduled_for is not null and (p_scheduled_for < now() - interval '1 minute' or p_scheduled_for > now() + interval '30 days') then
    raise exception 'Scheduled time must be within the next 30 days.' using errcode = '22023';
  end if;
  if p_ok then
    update public.beta_invitations
      set status = 'sent', send_count = send_count + 1, last_sent_at = at_time,
          first_sent_at = coalesce(first_sent_at, at_time), resend_email_id = left(p_resend_email_id, 100),
          scheduled_for = p_scheduled_for,
          delivery_status = case when p_scheduled_for is null then 'sent' else 'scheduled' end,
          delivery_updated_at = now(), last_error = null, updated_at = now()
      where id = p_invitation_id and status = 'sending';
  else
    update public.beta_invitations
      set status = 'failed', last_error = left(coalesce(p_error, 'Unknown error'), 500), updated_at = now()
      where id = p_invitation_id and status = 'sending';
  end if;
end;
$$;
revoke all on function public.admin_record_beta_invitation(uuid, boolean, text, text, timestamptz) from public, anon;
grant execute on function public.admin_record_beta_invitation(uuid, boolean, text, text, timestamptz) to authenticated;

drop function if exists public.admin_record_beta_reminder(uuid, boolean, text, text);
create or replace function public.admin_record_beta_reminder(
  p_invitation_id uuid,
  p_ok boolean,
  p_resend_email_id text default null,
  p_error text default null,
  p_scheduled_for timestamptz default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  at_time timestamptz := coalesce(p_scheduled_for, now());
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  if p_scheduled_for is not null and (p_scheduled_for < now() - interval '1 minute' or p_scheduled_for > now() + interval '30 days') then
    raise exception 'Scheduled time must be within the next 30 days.' using errcode = '22023';
  end if;
  if p_ok then
    update public.beta_invitations
      set status = 'sent', send_count = send_count + 1, last_sent_at = at_time, reminder_sent_at = at_time,
          resend_email_id = left(p_resend_email_id, 100), scheduled_for = p_scheduled_for,
          delivery_status = case when p_scheduled_for is null then 'sent' else 'scheduled' end,
          delivery_updated_at = now(), last_error = null, updated_at = now()
      where id = p_invitation_id and status = 'sending' and reminder_attempted_at is not null;
  else
    update public.beta_invitations
      set status = 'failed', last_error = left(coalesce(p_error, 'Unknown error'), 500), updated_at = now()
      where id = p_invitation_id and status = 'sending' and reminder_attempted_at is not null;
  end if;
end;
$$;
revoke all on function public.admin_record_beta_reminder(uuid, boolean, text, text, timestamptz) from public, anon;
grant execute on function public.admin_record_beta_reminder(uuid, boolean, text, text, timestamptz) to authenticated;

-- Call only after Resend has confirmed the cancellation. Only bookings that
-- haven't gone out yet can be undone. A cancelled first invitation goes back
-- to "not sent"; a cancelled reminder becomes available again.
create or replace function public.admin_cancel_beta_send(p_invitation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select * into inv from public.beta_invitations where id = p_invitation_id for update;
  if not found then raise exception 'Invitation not found.' using errcode = 'P0001'; end if;
  if inv.delivery_status is distinct from 'scheduled' or inv.scheduled_for is null or inv.scheduled_for <= now() then
    raise exception 'Only scheduled emails that haven''t gone out can be cancelled.' using errcode = 'P0001';
  end if;

  update public.beta_invitations
    set status = 'failed',
        last_error = 'Cancelled before sending',
        send_count = greatest(send_count - 1, 0),
        first_sent_at = case when first_sent_at = inv.scheduled_for then null else first_sent_at end,
        last_sent_at = case when last_sent_at = inv.scheduled_for then null else last_sent_at end,
        reminder_sent_at = case when reminder_sent_at = inv.scheduled_for then null else reminder_sent_at end,
        reminder_attempted_at = case when reminder_sent_at = inv.scheduled_for then null else reminder_attempted_at end,
        scheduled_for = null, delivery_status = null, delivery_updated_at = now(), updated_at = now()
    where id = inv.id;

  insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), 'beta_send_cancelled', 'beta_invitations', inv.id::text,
          jsonb_build_object('scheduled_for', inv.scheduled_for), null);
  return 'cancelled';
end;
$$;
revoke all on function public.admin_cancel_beta_send(uuid) from public, anon;
grant execute on function public.admin_cancel_beta_send(uuid) to authenticated;
