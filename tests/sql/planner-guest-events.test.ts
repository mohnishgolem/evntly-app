import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261129090000_planner_guest_events: guest planner steps + 13-month
// retention. Offline in PGlite (pg_cron stubbed), never against production.
const prereqs = `
  create table public.events (id text primary key, organiser_user_id uuid);
  create table public.event_tasks (id text primary key, event_id text not null, owner_email text not null, title text not null, done boolean, owner_user_id uuid,
    created_at timestamptz default now(), updated_at timestamptz default now(), created_by text);
  alter table public.event_tasks enable row level security;
  create schema cron;
  create table cron.jobs (name text primary key, schedule text, command text);
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.jobs values (n, s, c) returning 1::bigint $$;
  create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.jobs where name = n returning true $$;
`;
const planner = readMigration("migrations/20261128090000_event_planner.sql");
const up = readMigration("migrations/20261129090000_planner_guest_events.sql");
const down = readMigration("rollbacks/20261129090000_planner_guest_events.down.sql");

it("accepts the guest steps and purges analytics older than 13 months", { timeout: 60_000 }, async () => {
  const { db, as, err, C } = await setupDb([prereqs, planner, up]);
  await db.exec(`insert into public.planner_events (event, visitor_id) values ('plan_started', 'visitor-123'), ('plan_previewed', 'visitor-123'), ('plan_save_clicked', 'visitor-123')`);
  await db.exec(`insert into public.planner_events (event, detail) values ('event_created', 'guest_preview')`);
  expect(await err(db.exec(`insert into public.planner_events (event) values ('plan_abandoned')`))).toMatch(/check/);

  await db.exec(`insert into public.planner_events (event, created_at) values ('planner_opened', now() - interval '14 months'), ('planner_opened', now() - interval '11 months')`);
  await db.exec("select public.purge_old_planner_events()");
  const old = await db.query("select count(*)::int n from public.planner_events where created_at < now() - interval '13 months'");
  expect(old.rows[0].n).toBe(0);
  expect((await db.query("select count(*)::int n from public.planner_events")).rows[0].n).toBe(5);

  // Scheduled daily; customers can't run the purge.
  expect((await db.query("select schedule from cron.jobs where name = 'purge-old-planner-events'")).rows[0].schedule).toBe("17 3 * * *");
  expect(await as(C, () => err(db.exec("select public.purge_old_planner_events()")))).toMatch(/permission denied/);
});

it("rolls back cleanly", { timeout: 60_000 }, async () => {
  const { db, err } = await setupDb([prereqs, planner, up, down]);
  expect(await err(db.exec(`insert into public.planner_events (event) values ('plan_started')`))).toMatch(/check/);
  expect((await db.query("select count(*)::int n from cron.jobs")).rows[0].n).toBe(0);
  await db.exec(up);
});
