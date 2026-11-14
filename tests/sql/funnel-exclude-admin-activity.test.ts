import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261116090000_funnel_exclude_admin_activity: our own browsers (any visitor
// id ever seen on a page view signed in as an admin) and admin-owned
// applications are left out of admin_funnel, admin_founding_events and
// admin_founding_campaigns. Offline in PGlite, never against production.
const prereqs = `
  alter table auth.users add column created_at timestamptz default now();
  create table public.quote_requests (id bigserial primary key, client_user_id uuid, quoted_amount numeric, created_at timestamptz default now());
  create table public.bookings (id bigserial primary key, client_user_id uuid, status text, created_at timestamptz default now());
  create table public.beta_applications (id bigserial primary key, user_id uuid, provider_id text, source text not null default 'direct',
    status text not null default 'started', submitted_at timestamptz, created_at timestamptz not null default now());
  create table public.vendor_waitlist (id uuid primary key default gen_random_uuid(), email text not null, business_name text, invite_consent boolean not null default false);
`;
const base = readMigration("migrations/20261020120000_funnel_analytics.sql").replace(/select cron\.schedule\([\s\S]*?\);\s*$/, "");
const chain = [
  prereqs,
  base,
  readMigration("migrations/20261107090000_founding_page_views.sql"),
  readMigration("migrations/20261112090000_founding_funnel_events.sql"),
  readMigration("migrations/20261113090000_founding_campaign_tags.sql"),
  readMigration("migrations/20261115090000_meta_v2_funnel.sql"),
];
const exclude = readMigration("migrations/20261116090000_funnel_exclude_admin_activity.sql");
const down = readMigration("rollbacks/20261116090000_funnel_exclude_admin_activity.down.sql");

const seed = (ADMIN: string, A: string) => `
  -- Our browser: one signed-in admin visit, then signed-out test taps from it.
  insert into public.page_views (kind, visitor_id, user_id) values ('founding', 'admin-browser', '${ADMIN}');
  insert into public.page_views (kind, visitor_id, source) values ('founding', 'admin-browser', 'meta_ads'), ('founding', 'vendor-1', 'meta_ads');
  insert into public.funnel_events (event, source, visitor_id, campaign) values
    ('claim_click', 'meta_ads', 'admin-browser', 'a_photo'), ('signup_view', 'meta_ads', 'admin-browser', 'a_photo'),
    ('claim_click', 'meta_ads', 'vendor-1', 'a_photo'), ('signup_view', 'meta_ads', 'vendor-1', 'a_photo'),
    ('account_created', 'meta_ads', null, 'a_photo');
  insert into public.beta_applications (user_id, source, campaign) values ('${ADMIN}', 'meta_ads', 'a_photo'), ('${A}', 'meta_ads', 'a_photo');
`;

it("leaves admin browsers and admin applications out of every founding report", { timeout: 60_000 }, async () => {
  const before = await setupDb(chain);
  await before.db.exec(seed(before.ADMIN, before.A));
  const after = await setupDb([...chain, exclude]);
  await after.db.exec(seed(after.ADMIN, after.A));

  const funnel = async (d: typeof before) =>
    Object.fromEntries((await d.as(d.ADMIN, () => d.db.query("select step, people from public.admin_funnel(30)"))).rows.map((r) => [r.step, Number(r.people)]));
  // Before: our taps inflate the funnel.
  expect((await funnel(before))[110]).toBe(2);
  expect((await funnel(before))[100]).toBe(2);
  // After: only the real vendor; server-side events without a visitor still count.
  const f = await funnel(after);
  expect(f[100]).toBe(1);
  expect(f[110]).toBe(1);
  expect(f[115]).toBe(1);
  expect(f[113]).toBe(1);
  expect(Object.keys(f).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 100, 101, 102, 103, 110, 111, 112, 113, 114, 115, 116]);

  const events = (await after.as(after.ADMIN, () => after.db.query("select event, n from public.admin_founding_events(30)"))).rows;
  expect(Object.fromEntries(events.map((r) => [r.event, Number(r.n)]))).toEqual({ account_created: 1, claim_click: 1, signup_view: 1 });

  const campaigns = (await after.as(after.ADMIN, () => after.db.query("select * from public.admin_founding_campaigns(30)"))).rows;
  expect(campaigns).toHaveLength(1);
  expect(campaigns[0]).toMatchObject({ campaign: "a_photo", source: "meta_ads", claim_clicks: 1, accounts: 1, claimed: 1 });

  // Still admin-only.
  expect((await after.as(after.A, () => after.db.query("select * from public.admin_founding_campaigns(30)"))).rows).toEqual([]);
  expect((await after.as(after.A, () => after.db.query("select * from public.admin_founding_events(30)"))).rows).toEqual([]);
  expect(await after.err(after.as("anon", () => after.db.query("select * from public.admin_funnel(30)")))).toMatch(/permission denied/);

  // No rows were changed: the raw tables still hold everything.
  expect(Number((await after.db.query("select count(*) as n from public.funnel_events")).rows[0].n)).toBe(5);
});

it("rolls back to counting every browser", { timeout: 60_000 }, async () => {
  const d = await setupDb([...chain, exclude, down]);
  await d.db.exec(seed(d.ADMIN, d.A));
  const rows = (await d.as(d.ADMIN, () => d.db.query("select step, people from public.admin_funnel(30)"))).rows;
  expect(Number(rows.find((r) => r.step === 110)?.people)).toBe(2);
  const camp = (await d.as(d.ADMIN, () => d.db.query("select * from public.admin_founding_campaigns(30)"))).rows;
  expect(camp[0]).toMatchObject({ claim_clicks: 2, claimed: 2 });
});
