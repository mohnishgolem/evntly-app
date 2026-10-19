-- Budget tracker on the event board: organisers add their own costs (venue,
-- cake, decorations — anything not booked through Evntly) next to the
-- vendor bookings and quotes the app already knows about. Only the event's
-- organiser can see or change them.

create table if not exists public.event_budget_items (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  organiser_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  amount numeric(12, 2) not null check (amount >= 0 and amount <= 10000000),
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists event_budget_items_event_idx on public.event_budget_items (event_id);

alter table public.event_budget_items enable row level security;

revoke all on public.event_budget_items from anon, authenticated;
grant select, insert, update, delete on public.event_budget_items to authenticated;

drop policy if exists event_budget_items_own on public.event_budget_items;
create policy event_budget_items_own on public.event_budget_items
  for all to authenticated
  using (
    organiser_user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and e.organiser_user_id = (select auth.uid()))
  )
  with check (
    organiser_user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and e.organiser_user_id = (select auth.uid()))
  );

-- The event's overall budget is edited from the tracker too; keep it sane.
alter table public.events drop constraint if exists events_budget_total_range;
alter table public.events
  add constraint events_budget_total_range check (budget_total >= 0 and budget_total <= 10000000) not valid;
