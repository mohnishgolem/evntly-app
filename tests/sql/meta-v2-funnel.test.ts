import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261115090000_meta_v2_funnel: page_views.source, two new funnel events
// (signup_view, email_confirmed), "Prefer some help?" waitlist columns and
// admin_funnel steps 115-116. Run offline in PGlite, never against production.
const prereqs = `
  alter table auth.users add column created_at timestamptz default now();
  create table public.quote_requests (id bigserial primary key, client_user_id uuid, quoted_amount numeric, created_at timestamptz default now());
  create table public.bookings (id bigserial primary key, client_user_id uuid, status text, created_at timestamptz default now());
  create table public.beta_applications (id bigserial primary key, user_id uuid, provider_id text, submitted_at timestamptz);
  create table public.vendor_waitlist (id uuid primary key default gen_random_uuid(), email text not null, business_name text, invite_consent boolean not null default false);
  insert into public.vendor_waitlist (email) values ('existing@vendor.com.au');
`;
const base = readMigration("migrations/20261020120000_funnel_analytics.sql").replace(/select cron\.schedule\([\s\S]*?\);\s*$/, "");
const pageViews = readMigration("migrations/20261107090000_founding_page_views.sql");
const events = readMigration("migrations/20261112090000_founding_funnel_events.sql");
const v2 = readMigration("migrations/20261115090000_meta_v2_funnel.sql");

it("adds the new steps without breaking existing rows or access rules", { timeout: 60_000 }, async () => {
  const { db, as, err, A, ADMIN } = await setupDb([
    prereqs,
    base,
    pageViews,
    events,
    // Rows written before the migration must survive it.
    `insert into public.page_views (kind, visitor_id) values ('founding', 'visitor-old');
     insert into public.funnel_events (event, source, visitor_id) values ('claim_click', 'meta_ads', 'visitor-old');`,
    v2,
  ]);

  await db.exec(`
    insert into public.page_views (kind, visitor_id, source) values
      ('founding', 'visitor-1', 'meta_ads'), ('founding_claim', 'visitor-1', 'meta_ads'), ('home', 'visitor-2', null);
    insert into public.funnel_events (event, source, visitor_id, detail) values
      ('signup_view', 'meta_ads', 'visitor-1', null), ('signup_view', 'meta_ads', 'visitor-1', null),
      ('email_confirmed', 'meta_ads', null, 'code'), ('email_confirmed', null, null, 'link');
  `);
  expect(await err(db.query("insert into public.page_views (kind, visitor_id, source) values ('founding', 'visitor-3', 'tiktok')"))).toMatch(/check/);
  expect(await err(db.query("insert into public.funnel_events (event) values ('purchase')"))).toMatch(/check/);

  // Waitlist: existing contacts default to "no help asked", handles are capped.
  const existing = (await db.query("select wants_help, instagram from public.vendor_waitlist where email = 'existing@vendor.com.au'")).rows[0];
  expect(existing).toEqual({ wants_help: false, instagram: null });
  await db.exec("insert into public.vendor_waitlist (email, wants_help, instagram) values ('help@decor.com.au', true, '@decor')");
  expect(await err(db.query(`insert into public.vendor_waitlist (email, instagram) values ('long@x.au', '${"x".repeat(121)}')`))).toMatch(/check/);

  const rows = (await as(ADMIN, () => db.query("select step, people from public.admin_funnel(30)"))).rows;
  const byStep = Object.fromEntries(rows.map((r) => [r.step, Number(r.people)]));
  expect(byStep[110]).toBe(1); // the pre-migration claim click is still counted
  expect(byStep[115]).toBe(1); // distinct visitors who opened the sign-up form
  expect(byStep[116]).toBe(2);
  expect(rows.map((r) => r.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 100, 101, 102, 103, 110, 111, 112, 113, 114, 115, 116]);

  // Still admin-only, and the tables still closed to browsers.
  expect((await as(A, () => db.query("select * from public.admin_funnel(30)"))).rows).toEqual([]);
  expect(await err(as("anon", () => db.query("select * from public.admin_funnel(30)")))).toMatch(/permission denied/);
  expect(await err(as("anon", () => db.query("select * from public.funnel_events")))).toMatch(/permission denied/);
  expect(await err(as("anon", () => db.query("insert into public.page_views (kind, visitor_id, source) values ('founding', 'visitor-9', 'meta_ads')")))).toMatch(
    /permission denied/
  );
});

it("rolls back cleanly", { timeout: 60_000 }, async () => {
  const down = readMigration("rollbacks/20261115090000_meta_v2_funnel.down.sql");
  const { db, as, err, ADMIN } = await setupDb([
    prereqs,
    base,
    pageViews,
    events,
    v2,
    "insert into public.funnel_events (event, visitor_id) values ('signup_view', 'visitor-1'), ('claim_click', 'visitor-1');",
    down,
  ]);
  expect(await err(db.query("select source from public.page_views"))).toMatch(/does not exist/);
  expect(await err(db.query("select wants_help from public.vendor_waitlist"))).toMatch(/does not exist/);
  expect((await db.query("select event from public.funnel_events")).rows).toEqual([{ event: "claim_click" }]);
  const rows = (await as(ADMIN, () => db.query("select step from public.admin_funnel(30)"))).rows;
  expect(rows.map((r) => r.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 100, 101, 102, 103, 110, 111, 112, 113, 114]);
});
