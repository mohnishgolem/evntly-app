-- Rollback for 20261104090000_founding_scheduled_sends.sql. Cancel any
-- scheduled emails in Resend first (Admin → Beta Vendors → Cancel all
-- scheduled), then run this and re-run the admin_record_beta_invitation and
-- admin_record_beta_reminder definitions from the earlier migrations.

drop function if exists public.admin_cancel_beta_send(uuid);
drop function if exists public.admin_record_beta_invitation(uuid, boolean, text, text, timestamptz);
drop function if exists public.admin_record_beta_reminder(uuid, boolean, text, text, timestamptz);
drop index if exists public.beta_invitations_scheduled_idx;
update public.beta_invitations set delivery_status = 'sent' where delivery_status = 'scheduled';
alter table public.beta_invitations drop constraint if exists beta_invitations_delivery_status_check;
alter table public.beta_invitations add constraint beta_invitations_delivery_status_check
  check (delivery_status in ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed'));
alter table public.beta_invitations drop column if exists scheduled_for;
