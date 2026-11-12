import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261112090000_founding_funnel_events: anonymous founding conversion events
// (claim click, sign-up attempt/error, account created), service-role writes
// only, shown to admins as vendor funnel steps 110-114.
const prereqs = `
  alter table auth.users add column created_at timestamptz default now();
  create table public.quote_requests (id bigserial primary key, client_user_id uuid, quoted_amount numeric, created_at timestamptz default now());
  create table public.bookings (id bigserial primary key, client_user_id uuid, status text, created_at timestamptz default now());
  create table public.beta_applications (id bigserial primary key, user_id uuid, provider_id text, submitted_at timestamptz);
`;
const base = readMigration("migrations/20261020120000_funnel_analytics.sql").replace(/select cron\.schedule\([\s\S]*?\);\s*$/, "");
const pageViews = readMigration("migrations/20261107090000_founding_page_views.sql");
const events = readMigration("migrations/20261112090000_founding_funnel_events.sql");

it("records founding funnel events privately and shows them to admins only", { timeout: 60_000 }, async () => {
  const { db, as, err, A, ADMIN } = await setupDb([prereqs, base, pageViews, events]);

  // The service role (via the API) writes events; nothing personal fits.
  await db.exec(`
    insert into public.funnel_events (event, source, visitor_id, detail) values
      ('claim_click', 'meta_ads', 'visitor-1', null), ('claim_click', 'meta_ads', 'visitor-1', null),
      ('claim_click', 'instagram_dm', 'visitor-2', null),
      ('signup_attempt', 'meta_ads', 'visitor-1', null),
      ('signup_error', 'meta_ads', null, 'weak_password'),
      ('account_created', 'instagram_dm', null, 'email');
    insert into public.beta_applications (user_id, provider_id, submitted_at) values
      ('${A}', 'listing-1', now()), ('${A}', null, null);
  `);
  expect(await err(db.query("insert into public.funnel_events (event) values ('purchase')"))).toMatch(/check/);
  expect(await err(db.query("insert into public.funnel_events (event, source) values ('claim_click', 'tiktok')"))).toMatch(/check/);
  // Free text (e.g. an email address) can't be smuggled in as a detail.
  expect(await err(db.query("insert into public.funnel_events (event, detail) values ('signup_error', 'someone@example.com')"))).toMatch(/check/);

  // Browsers and signed-in users can't read or write the table directly.
  expect(await err(as("anon", () => db.query("insert into public.funnel_events (event) values ('claim_click')")))).toMatch(/permission denied/);
  expect(await err(as("anon", () => db.query("select * from public.funnel_events")))).toMatch(/permission denied/);
  expect(await err(as(A, () => db.query("select * from public.funnel_events")))).toMatch(/permission denied/);

  const rows = (await as(ADMIN, () => db.query("select step, people from public.admin_funnel(30)"))).rows;
  const byStep = Object.fromEntries(rows.map((r) => [r.step, Number(r.people)]));
  expect(byStep[110]).toBe(2); // distinct visitors who clicked Claim
  expect(byStep[111]).toBe(1);
  expect(byStep[112]).toBe(1);
  expect(byStep[113]).toBe(1);
  expect(byStep[114]).toBe(1); // only the application with a submitted listing
  expect(rows.map((r) => r.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 100, 101, 102, 103, 110, 111, 112, 113, 114]);

  const bySource = (await as(ADMIN, () => db.query("select event, source, detail, n from public.admin_founding_events(30)"))).rows;
  expect(bySource).toContainEqual({ event: "claim_click", source: "meta_ads", detail: null, n: 2 });
  expect(bySource).toContainEqual({ event: "signup_error", source: "meta_ads", detail: "weak_password", n: 1 });

  // Admin-only views of the data.
  expect((await as(A, () => db.query("select * from public.admin_founding_events(30)"))).rows).toEqual([]);
  expect(await err(as("anon", () => db.query("select * from public.admin_founding_events(30)")))).toMatch(/permission denied/);
  expect((await as(A, () => db.query("select * from public.admin_funnel(30)"))).rows).toEqual([]);
});

it("rolls back to the previous funnel", { timeout: 60_000 }, async () => {
  const down = readMigration("rollbacks/20261112090000_founding_funnel_events.down.sql");
  const { db, as, err, ADMIN } = await setupDb([prereqs, base, pageViews, events, down]);
  expect(await err(db.query("select 1 from public.funnel_events"))).toMatch(/does not exist/);
  const rows = (await as(ADMIN, () => db.query("select step from public.admin_funnel(30)"))).rows;
  expect(rows.map((r) => r.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 100, 101, 102, 103]);
});
