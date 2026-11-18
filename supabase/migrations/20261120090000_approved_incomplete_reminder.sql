-- One-off reminder for live listings approved before the completion gate
-- (18 Nov) that still have no photos or package. NOT APPLIED: needs Sai's
-- approval. Applying it sends nothing on its own:
--
--   1. listing_completion_reminders accepts a third kind, 'approved_incomplete'
--      (one row per listing, so each gets the email at most once).
--   2. app_settings gets the switch, set to 'off'. The hourly job only sends
--      once Sai runs:
--        update public.app_settings set value = 'on'
--        where key = 'approved_incomplete_reminders';
--   3. app_settings gets an empty skip list: provider ids (comma-separated)
--      that must never get this email, e.g. vendors Sai is messaging
--      personally or who asked for no more email:
--        update public.app_settings set value = 'sp_id_1, sp_id_2'
--        where key = 'approved_incomplete_reminders_skip';
--
-- notify() still honours each vendor's "Reminders" email setting.

alter table public.listing_completion_reminders
  drop constraint if exists listing_completion_reminders_kind_check;
alter table public.listing_completion_reminders
  add constraint listing_completion_reminders_kind_check
  check (kind in ('24h', '72h', 'approved_incomplete'));

insert into public.app_settings (key, value) values
  ('approved_incomplete_reminders', 'off'),
  ('approved_incomplete_reminders_skip', '')
on conflict (key) do nothing;

alter table public.app_settings drop constraint if exists app_settings_approved_incomplete_reminders_valid;
alter table public.app_settings add constraint app_settings_approved_incomplete_reminders_valid
  check (key <> 'approved_incomplete_reminders' or value in ('on', 'off'));
