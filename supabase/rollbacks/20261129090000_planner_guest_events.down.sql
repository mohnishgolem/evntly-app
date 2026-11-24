select cron.unschedule('purge-old-planner-events');
drop function if exists public.purge_old_planner_events();
delete from public.planner_events where event in ('plan_started', 'plan_previewed', 'plan_save_clicked');
alter table public.planner_events drop constraint if exists planner_events_event_check;
alter table public.planner_events add constraint planner_events_event_check check (event in (
  'event_created', 'planner_opened', 'task_completed',
  'recommendation_clicked', 'vendor_saved', 'vendor_enquiry'
));
