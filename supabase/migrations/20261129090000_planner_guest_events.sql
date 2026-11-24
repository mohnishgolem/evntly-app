-- Planner analytics: steps before an account exists, so registrations from
-- the planner can be measured (form started → plan previewed → save tapped →
-- account → event created with detail 'guest_preview').
--   plan_started       first interaction with /plan in a browser session
--   plan_previewed     a guest saw their plan preview
--   plan_save_clicked  a guest chose to create an account to save it
-- Plus retention: planner analytics older than 13 months are deleted daily
-- (pg_cron), in line with keeping analytics only as long as they're useful.
-- Rollback: supabase/rollbacks/20261129090000_planner_guest_events.down.sql

alter table public.planner_events drop constraint if exists planner_events_event_check;
alter table public.planner_events add constraint planner_events_event_check check (event in (
  'event_created', 'planner_opened', 'task_completed',
  'recommendation_clicked', 'vendor_saved', 'vendor_enquiry',
  'plan_started', 'plan_previewed', 'plan_save_clicked'
));

create or replace function public.purge_old_planner_events()
returns void
language sql
security definer
set search_path to ''
as $$
  delete from public.planner_events where created_at < now() - interval '13 months';
$$;
revoke all on function public.purge_old_planner_events() from public, anon, authenticated;

select cron.schedule('purge-old-planner-events', '17 3 * * *', $$select public.purge_old_planner_events()$$);
