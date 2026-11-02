-- Rollback for 20261103090000_founding_200_and_reminders.sql. Restores the
-- previous invitation check (without the registered-vendor refusal) by
-- re-running its definition from 20261101090000, drops the reminder
-- functions and columns, and sets capacity back to 20 if it is still 200.

drop function if exists public.admin_record_beta_reminder(uuid, boolean, text, text);
drop function if exists public.admin_prepare_beta_reminder(uuid, text);
alter table public.beta_invitations drop column if exists reminder_attempted_at;
alter table public.beta_invitations drop column if exists reminder_sent_at;
alter table public.beta_program alter column capacity set default 20;
update public.beta_program set capacity = 20, updated_at = now()
  where id = 1 and capacity = 200
    and (select count(*) from public.beta_applications where status = 'approved') <= 20;
-- Then re-run the admin_prepare_beta_invitation definition from
-- 20261101090000_founding_vendor_beta.sql, and:
-- drop function if exists public.beta_contact_is_registered_vendor(text);
