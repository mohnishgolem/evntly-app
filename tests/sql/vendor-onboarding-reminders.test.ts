import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261127090000_vendor_onboarding_reminders: the 'vendor_finish' page-view
// kind and the onboarding reminder log. Runs in an in-memory Postgres
// (PGlite), never against Supabase.
const prereqs = `
  alter table auth.users add column created_at timestamptz default now();
  create table public.beta_applications (id bigserial primary key, user_id uuid, provider_id text, submitted_at timestamptz);
  create table public.quote_requests (id bigserial primary key, client_user_id uuid, quoted_amount numeric, created_at timestamptz default now());
  create table public.bookings (id bigserial primary key, client_user_id uuid, status text, created_at timestamptz default now());
`;
const base = readMigration("migrations/20261020120000_funnel_analytics.sql").replace(/select cron\.schedule\([\s\S]*?\);\s*$/, "");
const pageViews = readMigration("migrations/20261107090000_founding_page_views.sql");
const reminders = readMigration("migrations/20261127090000_vendor_onboarding_reminders.sql");

it("counts the finish page and keeps every existing page-view kind", { timeout: 60_000 }, async () => {
  const { db, err } = await setupDb([prereqs, base, pageViews, reminders]);
  for (const kind of ["home", "explore", "vendor", "plan", "vendor_signup", "bundles", "founding", "founding_claim", "vendor_finish"]) {
    await db.query("insert into public.page_views (kind, visitor_id) values ($1, 'visitor-1')", [kind]);
  }
  expect(await err(db.query("insert into public.page_views (kind, visitor_id) values ('checkout', 'visitor-1')"))).toMatch(/check/);
});

it("logs each onboarding reminder once, for the service role only", { timeout: 60_000 }, async () => {
  const { db, as, err, A, B } = await setupDb([prereqs, base, pageViews, reminders]);

  await db.query("insert into public.vendor_onboarding_reminders (user_id, kind) values ($1, 'no_listing_24h'), ($1, 'no_listing_72h'), ($2, 'live_incomplete_48h')", [A, B]);
  // The job upserts with ignoreDuplicates: a second run can't log (or send) it again.
  const again = await db.query(
    "insert into public.vendor_onboarding_reminders (user_id, kind) values ($1, 'no_listing_24h') on conflict do nothing returning user_id",
    [A]
  );
  expect(again.rows).toEqual([]);
  expect(await err(db.query("insert into public.vendor_onboarding_reminders (user_id, kind) values ($1, 'weekly_promo')", [A]))).toMatch(/check/);

  // Vendors and visitors can't read or write the log.
  expect(await err(as(A, () => db.query("select * from public.vendor_onboarding_reminders")))).toMatch(/permission denied/);
  expect(await err(as("anon", () => db.query("select * from public.vendor_onboarding_reminders")))).toMatch(/permission denied/);
  expect(await err(as(A, () => db.query("insert into public.vendor_onboarding_reminders (user_id, kind) values ($1, 'no_listing_24h')", [A])))).toMatch(
    /permission denied/
  );

  // Deleting the account removes its log rows.
  await db.query("delete from auth.users where id = $1", [B]);
  expect((await db.query("select count(*)::int as n from public.vendor_onboarding_reminders where user_id = $1", [B])).rows[0].n).toBe(0);
});
