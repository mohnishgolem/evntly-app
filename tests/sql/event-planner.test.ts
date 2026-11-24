import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261128090000_event_planner: planner items on event_tasks, dismissed
// suggestions on events, and planner_events analytics. Offline in PGlite,
// never against production. The prerequisites mirror production's events
// and event_tasks (columns and policies read from the live schema).
const prereqs = `
  create table public.events (
    id text primary key default gen_random_uuid()::text, organiser_user_id uuid, organiser_email text not null default 'x',
    event_type text not null default 'Wedding', event_date date not null default current_date + 60, suburb text not null default 'Bondi',
    guest_count text not null default '50', budget_total numeric not null default 0, required_services text[] not null default '{}',
    status text not null default 'planning', name text, notes text);
  alter table public.events enable row level security;
  create policy events_select_own on public.events for select using (organiser_user_id = (select auth.uid()));
  create policy events_update_own on public.events for update using (organiser_user_id = (select auth.uid()));
  grant select, insert, update, delete on public.events to authenticated;

  create table public.event_tasks (
    id text primary key default gen_random_uuid()::text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    created_by text, event_id text not null, owner_email text not null, title text not null, done boolean, owner_user_id uuid);
  alter table public.event_tasks enable row level security;
  create policy event_tasks_select_own on public.event_tasks for select using ((owner_user_id = (select auth.uid())) or public.is_admin());
  create policy event_tasks_insert_own on public.event_tasks for insert with check (owner_user_id = (select auth.uid()));
  create policy event_tasks_update_own on public.event_tasks for update using ((owner_user_id = (select auth.uid())) or public.is_admin());
  create policy event_tasks_delete_own on public.event_tasks for delete using ((owner_user_id = (select auth.uid())) or public.is_admin());
  grant select, insert, update, delete on public.event_tasks to authenticated;
`;
const up = readMigration("migrations/20261128090000_event_planner.sql");
const down = readMigration("rollbacks/20261128090000_event_planner.down.sql");

it("keeps planner items private to the event's organiser", { timeout: 60_000 }, async () => {
  const { db, as, err, A, C } = await setupDb([prereqs, up]);
  await db.query("insert into public.events (id, organiser_user_id, event_date) values ('ev-c', $1, '2027-03-20'), ('ev-a', $2, '2027-05-01')", [C, A]);
  const task = (user: string, event: string, extra = "") =>
    db.exec(`insert into public.event_tasks (event_id, owner_email, owner_user_id, title${extra ? ", " + extra.split("=")[0] : ""})
             values ('${event}', 'x', '${user}', 'Book the DJ'${extra ? ", " + extra.split("=")[1] : ""})`);

  // The organiser adds items of each kind to their own event.
  await as(C, () => task(C, "ev-c"));
  await as(C, () => task(C, "ev-c", "kind='schedule'"));
  await as(C, () => db.exec(`insert into public.event_tasks (event_id, owner_email, owner_user_id, title, kind, due_date, due_time)
    values ('ev-c', 'x', '${C}', 'Photographer arrives', 'schedule', '2027-03-20', '14:30')`));
  // …but not to someone else's event, even as the row's owner.
  expect(await as(C, () => err(task(C, "ev-a")))).toMatch(/row-level security/);
  // …and can't move their item onto someone else's event.
  expect(await as(C, () => err(db.exec("update public.event_tasks set event_id = 'ev-a' where event_id = 'ev-c'")))).toMatch(/row-level security/);
  // Another account sees none of it.
  expect((await as(A, () => db.query("select * from public.event_tasks"))).rows).toHaveLength(0);
  expect((await as(C, () => db.query("select * from public.event_tasks"))).rows).toHaveLength(3);

  // Shape checks.
  expect(await as(C, () => err(task(C, "ev-c", "kind='expense'")))).toMatch(/event_tasks_kind_check/);
  expect(await err(db.exec(`insert into public.event_tasks (event_id, owner_email, title) values ('ev-c', 'x', '   ')`))).toMatch(/event_tasks_title_length/);
  expect(await err(db.exec(`insert into public.event_tasks (event_id, owner_email, title, due_time) values ('ev-c', 'x', 'Speeches', '19:00')`))).toMatch(/event_tasks_time_needs_date/);
  expect(await err(db.exec(`insert into public.event_tasks (event_id, owner_email, title, template_key) values ('ev-c', 'x', 'x', 'Bad Key!')`))).toMatch(/event_tasks_template_key_format/);
  expect(await err(db.exec(`insert into public.event_tasks (event_id, owner_email, title) values ('no-such-event', 'x', 'x')`))).toMatch(/event_tasks_event_id_fkey/);

  // One row per checklist suggestion per event.
  await db.exec(`insert into public.event_tasks (event_id, owner_email, title, template_key, done) values ('ev-c', 'x', 'Confirm your venue', 'confirm_venue', true)`);
  expect(await err(db.exec(`insert into public.event_tasks (event_id, owner_email, title, template_key) values ('ev-c', 'x', 'Again', 'confirm_venue')`))).toMatch(/event_tasks_template_uniq/);

  // Dismissed suggestions are stored on the event, within a sane size.
  await as(C, () => db.exec(`update public.events set planner_dismissed = array_append(planner_dismissed, 'rec:dj') where id = 'ev-c'`));
  expect((await db.query("select planner_dismissed from public.events where id = 'ev-c'")).rows[0].planner_dismissed).toEqual(["rec:dj"]);
  expect(await err(db.exec(`update public.events set planner_dismissed = array_fill('x'::text, array[61]) where id = 'ev-c'`))).toMatch(/events_planner_dismissed_size/);

  // Deleting the event removes its items.
  await db.exec("delete from public.events where id = 'ev-c'");
  expect((await db.query("select count(*)::int n from public.event_tasks")).rows[0].n).toBe(0);
});

it("keeps planner analytics server-only and well-formed", { timeout: 60_000 }, async () => {
  const { db, as, err, C } = await setupDb([prereqs, up]);
  await db.exec(`insert into public.planner_events (event, visitor_id, user_id, event_id, detail)
    values ('planner_opened', 'visitor-123', '${C}', 'ev-c', null), ('recommendation_clicked', 'visitor-123', '${C}', 'ev-c', 'idea:dj')`);
  expect(await err(db.exec(`insert into public.planner_events (event) values ('page_scrolled')`))).toMatch(/check/);
  expect(await err(db.exec(`insert into public.planner_events (event, detail) values ('task_completed', 'Hello there')`))).toMatch(/check/);
  expect(await as(C, () => err(db.query("select * from public.planner_events")))).toMatch(/permission denied/);
  expect(await as("anon", () => err(db.exec(`insert into public.planner_events (event) values ('planner_opened')`)))).toMatch(/permission denied/);
});

it("rolls back cleanly", { timeout: 60_000 }, async () => {
  const { db } = await setupDb([prereqs, up, down]);
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'event_tasks'")).rows.map((r) => r.column_name);
  expect(cols).not.toContain("kind");
  expect(cols).toContain("title");
  expect((await db.query("select to_regclass('public.planner_events') r")).rows[0].r).toBeNull();
  // And the migration can be applied again afterwards.
  await db.exec(up);
});
