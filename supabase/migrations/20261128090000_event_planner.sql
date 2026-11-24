-- Event planner: one timeline and checklist per event.
--
-- 1. event_tasks grows from a flat run-sheet list into planner items:
--      kind          task (checklist), schedule (a time on the day),
--                    reminder (a date to remember), note
--      due_date / due_time, details, position (manual order for items
--      without a time), template_key (a checklist suggestion the organiser
--      has completed, edited or dismissed: one row per event and key),
--      dismissed, completed_at.
--    Rows still belong to the organiser (owner_email → owner_user_id via the
--    existing zz_sync_user_ids trigger). Insert and update now also require
--    that the event is the caller's own: before, anyone could attach a task
--    to another person's event id (only they could see it, but it was
--    wrong). event_id gets a foreign key so deleting an event removes its
--    items.
-- 2. events.planner_dismissed: keys of planner suggestions the organiser
--    closed ("rec:dj", "idea:florist"), so they don't come back.
-- 3. planner_events: first-party planner analytics written by the app with
--    the service role (event created, planner opened, task completed,
--    recommendation clicked, vendor saved, vendor enquiry). No client access
--    (RLS on, no grants), like funnel_events. Nothing personal beyond the
--    random per-browser id page_views already uses and the account id.
--
-- Production had 0 event_tasks rows when this was written, so the new
-- checks and the foreign key validate immediately.
-- Rollback: supabase/rollbacks/20261128090000_event_planner.down.sql

-- 1 ---------------------------------------------------------------------------
alter table public.event_tasks
  add column if not exists kind text not null default 'task',
  add column if not exists due_date date,
  add column if not exists due_time time,
  add column if not exists details text,
  add column if not exists position integer not null default 0,
  add column if not exists template_key text,
  add column if not exists dismissed boolean not null default false,
  add column if not exists completed_at timestamptz;

alter table public.event_tasks drop constraint if exists event_tasks_kind_check;
alter table public.event_tasks add constraint event_tasks_kind_check
  check (kind in ('task', 'schedule', 'reminder', 'note'));
alter table public.event_tasks drop constraint if exists event_tasks_title_length;
alter table public.event_tasks add constraint event_tasks_title_length
  check (char_length(btrim(title)) between 1 and 120);
alter table public.event_tasks drop constraint if exists event_tasks_details_length;
alter table public.event_tasks add constraint event_tasks_details_length
  check (details is null or char_length(details) <= 500);
alter table public.event_tasks drop constraint if exists event_tasks_template_key_format;
alter table public.event_tasks add constraint event_tasks_template_key_format
  check (template_key is null or template_key ~ '^[a-z0-9_]{1,40}$');
-- A time only makes sense with a date.
alter table public.event_tasks drop constraint if exists event_tasks_time_needs_date;
alter table public.event_tasks add constraint event_tasks_time_needs_date
  check (due_time is null or due_date is not null);

alter table public.event_tasks drop constraint if exists event_tasks_event_id_fkey;
alter table public.event_tasks add constraint event_tasks_event_id_fkey
  foreign key (event_id) references public.events (id) on delete cascade;

create index if not exists event_tasks_event_idx on public.event_tasks (event_id);
create unique index if not exists event_tasks_template_uniq
  on public.event_tasks (event_id, template_key) where template_key is not null;

drop policy if exists event_tasks_insert_own on public.event_tasks;
create policy event_tasks_insert_own on public.event_tasks
  for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and e.organiser_user_id = (select auth.uid()))
  );

drop policy if exists event_tasks_update_own on public.event_tasks;
create policy event_tasks_update_own on public.event_tasks
  for update to authenticated
  using (owner_user_id = (select auth.uid()) or (select public.is_admin()))
  with check (
    (owner_user_id = (select auth.uid())
      and exists (select 1 from public.events e where e.id = event_id and e.organiser_user_id = (select auth.uid())))
    or (select public.is_admin())
  );

-- 2 ---------------------------------------------------------------------------
alter table public.events
  add column if not exists planner_dismissed text[] not null default '{}';
alter table public.events drop constraint if exists events_planner_dismissed_size;
alter table public.events add constraint events_planner_dismissed_size
  check (cardinality(planner_dismissed) <= 60);

-- 3 ---------------------------------------------------------------------------
create table if not exists public.planner_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in (
    'event_created', 'planner_opened', 'task_completed',
    'recommendation_clicked', 'vendor_saved', 'vendor_enquiry'
  )),
  visitor_id text check (visitor_id is null or visitor_id ~ '^[A-Za-z0-9-]{8,64}$'),
  user_id uuid,
  event_id text,
  detail text check (detail is null or detail ~ '^[a-z0-9_:]{1,60}$')
);

create index if not exists planner_events_created_idx on public.planner_events (created_at desc);
create index if not exists planner_events_event_idx on public.planner_events (event, created_at desc);

alter table public.planner_events enable row level security;
revoke all on public.planner_events from anon, authenticated;
