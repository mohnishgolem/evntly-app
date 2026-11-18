-- Rollback for 20261120090000_approved_incomplete_reminder.sql.
-- Turns the one-off reminder off and removes its log rows, so the kind
-- check can go back to the 24 h / 72 h draft reminders only.
alter table public.app_settings drop constraint if exists app_settings_approved_incomplete_reminders_valid;
delete from public.app_settings where key in ('approved_incomplete_reminders', 'approved_incomplete_reminders_skip');

delete from public.listing_completion_reminders where kind = 'approved_incomplete';
alter table public.listing_completion_reminders
  drop constraint if exists listing_completion_reminders_kind_check;
alter table public.listing_completion_reminders
  add constraint listing_completion_reminders_kind_check
  check (kind in ('24h', '72h'));
