-- Rollback for 20261128090000_event_planner. Planner items keep their title
-- and done state; the new columns, checks and analytics table are removed.
drop table if exists public.planner_events;

alter table public.events drop constraint if exists events_planner_dismissed_size;
alter table public.events drop column if exists planner_dismissed;

drop policy if exists event_tasks_update_own on public.event_tasks;
create policy event_tasks_update_own on public.event_tasks
  for update using ((owner_user_id = (select auth.uid())) or public.is_admin());
drop policy if exists event_tasks_insert_own on public.event_tasks;
create policy event_tasks_insert_own on public.event_tasks
  for insert with check (owner_user_id = (select auth.uid()));

drop index if exists public.event_tasks_template_uniq;
drop index if exists public.event_tasks_event_idx;
alter table public.event_tasks drop constraint if exists event_tasks_event_id_fkey;
alter table public.event_tasks drop constraint if exists event_tasks_time_needs_date;
alter table public.event_tasks drop constraint if exists event_tasks_template_key_format;
alter table public.event_tasks drop constraint if exists event_tasks_details_length;
alter table public.event_tasks drop constraint if exists event_tasks_title_length;
alter table public.event_tasks drop constraint if exists event_tasks_kind_check;
alter table public.event_tasks
  drop column if exists completed_at,
  drop column if exists dismissed,
  drop column if exists template_key,
  drop column if exists position,
  drop column if exists details,
  drop column if exists due_time,
  drop column if exists due_date,
  drop column if exists kind;
