import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261124090000_share_funnel: share_funnel_events + admin_share_funnel.
// Offline in PGlite, never against production.
const prereqs = `
  alter table auth.users add column created_at timestamptz default now();
  alter table auth.users add column email_confirmed_at timestamptz;
  create table public.quote_requests (id bigserial primary key, vendor_id text, client_email text, client_user_id uuid, quoted_amount numeric,
    created_at timestamptz default now(), origin text, status text default 'pending');
  create table public.bookings (id bigserial primary key, client_user_id uuid, status text, created_at timestamptz default now());
  create table public.beta_applications (id bigserial primary key, user_id uuid, provider_id text, submitted_at timestamptz);
  create table public.vendor_waitlist (id uuid primary key default gen_random_uuid(), email text not null, business_name text, invite_consent boolean not null default false);
  grant insert (vendor_id, client_email, client_user_id, origin, status) on public.quote_requests to authenticated;
`;
const base = readMigration("migrations/20261020120000_funnel_analytics.sql").replace(/select cron\.schedule\([\s\S]*?\);\s*$/, "");
const pageViews = readMigration("migrations/20261107090000_founding_page_views.sql");
const events = readMigration("migrations/20261112090000_founding_funnel_events.sql");
const v2 = readMigration("migrations/20261115090000_meta_v2_funnel.sql");
const share = readMigration("migrations/20261123090000_vendor_share_profile.sql");
const up = readMigration("migrations/20261124090000_share_funnel.sql");
const down = readMigration("rollbacks/20261124090000_share_funnel.down.sql");

const V = "d5984a9a-70dc-4e42-a1ce-dcdd2022d1d7";

it("reports visits → verified accounts → quote requests per channel", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN, A, C } = await setupDb([prereqs, base, pageViews, events, v2, share, up]);
  const D = "00000000-0000-0000-0000-0000000000d1"; // a second new customer, not yet verified
  await db.query("insert into auth.users (id, email) values ($1, 'dee@example.invalid')", [D]);
  await db.query("insert into public.users (id, email, role) values ($1, 'dee@example.invalid', 'customer')", [D]);
  await db.query("update auth.users set email_confirmed_at = now() where id = $1", [C]);

  await db.exec(`
    -- Visits: 3 QR browsers (one twice), 2 Story, 1 copied link, an admin's browser, and an untagged view.
    insert into public.page_views (kind, visitor_id, vendor_id, source) values
      ('vendor', 'visitor-q1', '${V}', 'share_qr'), ('vendor', 'visitor-q1', '${V}', 'share_qr'),
      ('vendor', 'visitor-q2', '${V}', 'share_qr'), ('vendor', 'visitor-q3', '${V}', 'share_qr'),
      ('vendor', 'visitor-s1', '${V}', 'share_story'), ('vendor', 'visitor-s2', '${V}', 'share_story'),
      ('vendor', 'visitor-l1', '${V}', 'share_link'),
      ('vendor', 'visitor-x1', '${V}', null);
    insert into public.page_views (kind, visitor_id, user_id, vendor_id, source) values ('vendor', 'visitor-admin', '${ADMIN}', '${V}', 'share_qr');
    insert into public.page_views (kind, visitor_id, vendor_id, source) values ('vendor', 'visitor-admin', '${V}', 'share_qr');
    -- Accounts: C (verified) and D (not yet) from the QR card; an admin test account.
    insert into public.share_funnel_events (event, source, vendor_id, user_id, detail) values
      ('account_created', 'share_qr', '${V}', '${C}', 'email'),
      ('account_created', 'share_qr', '${V}', '${D}', 'google'),
      ('account_created', 'share_story', '${V}', '${ADMIN}', 'email'),
      ('prepared', 'share_story', '${V}', '${A}', 'story_save'),
      ('prepared', 'share_story', '${V}', '${A}', 'story_copy'),
      ('prepared', 'share_qr', '${V}', '${A}', 'card_save');
    -- Quotes: C sends one from the QR visit; an older customer sends one from the Story link.
    insert into public.quote_requests (vendor_id, client_user_id, share_source) values
      ('${V}', '${C}', 'share_qr'), ('${V}', '${A}', 'share_story'), ('${V}', '${C}', null);
  `);

  // One account is attributed once.
  expect(await err(db.exec(`insert into public.share_funnel_events (event, source, user_id) values ('account_created', 'share_link', '${C}')`))).toMatch(/share_funnel_events_account_uniq/);
  // Only known channels and events.
  expect(await err(db.exec(`insert into public.share_funnel_events (event, source) values ('posted', 'share_qr')`))).toMatch(/check/);

  const rows = await as(ADMIN, async () => (await db.query("select * from public.admin_share_funnel(30)")).rows);
  const by = Object.fromEntries(rows.map((r) => [r.source, Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "source" ? v : Number(v)]))]));
  expect(rows.map((r) => r.source)).toEqual(["share_story", "share_link", "share_qr"]);
  expect(by.share_qr).toEqual({ source: "share_qr", visitors: 3, accounts: 2, verified: 1, quotes: 1, quotes_new: 1, prepared: 1 });
  expect(by.share_story).toEqual({ source: "share_story", visitors: 2, accounts: 0, verified: 0, quotes: 1, quotes_new: 0, prepared: 2 });
  expect(by.share_link).toEqual({ source: "share_link", visitors: 1, accounts: 0, verified: 0, quotes: 0, quotes_new: 0, prepared: 0 });

  // Per vendor: every vendor with share activity gets its own rows.
  const W = "a81b3dbf-1279-46d6-a45e-64b9f5e0c1a8";
  await db.exec(`insert into public.service_providers (id, name, status) values ('${V}', 'DJ Valgen', 'approved'), ('${W}', 'Events BTS', 'approved');
    insert into public.page_views (kind, visitor_id, vendor_id, source) values ('vendor', 'visitor-w1', '${W}', 'share_link'), ('vendor', 'visitor-w2', '${W}', 'share_link');
    insert into public.quote_requests (vendor_id, client_user_id, share_source) values ('${W}', '${A}', 'share_link');`);
  const per = await as(ADMIN, async () => (await db.query("select * from public.admin_share_funnel_by_vendor(30)")).rows);
  const row = (name: string, source: string) => {
    const r = per.find((x) => x.vendor_name === name && x.source === source);
    return r && [r.visitors, r.accounts, r.verified, r.quotes, r.quotes_new, r.prepared].map(Number);
  };
  expect(row("DJ Valgen", "share_qr")).toEqual([3, 2, 1, 1, 1, 1]);
  expect(row("DJ Valgen", "share_story")).toEqual([2, 0, 0, 1, 0, 2]);
  expect(row("Events BTS", "share_link")).toEqual([2, 0, 0, 1, 0, 0]);
  expect(per.some((x) => x.vendor_name === "Events BTS" && x.source === "share_qr")).toBe(false); // no activity, no row
  expect(await as(C, async () => (await db.query("select * from public.admin_share_funnel_by_vendor(30)")).rows)).toEqual([]);

  // Admins only (with a second factor); customers can't read or write the events.
  expect(await as(C, async () => (await db.query("select * from public.admin_share_funnel(30)")).rows)).toEqual([]);
  expect(await as(C, () => err(db.query("select * from public.share_funnel_events")))).toMatch(/permission denied/);
  expect(await as(C, () => err(db.exec(`insert into public.share_funnel_events (event, source) values ('prepared', 'share_qr')`)))).toMatch(/permission denied/);
  expect(await as("anon", () => err(db.query("select * from public.admin_share_funnel(30)")))).toMatch(/permission denied/);

  await db.exec(up); // re-running is harmless
  await db.exec(down);
  expect((await db.query("select to_regclass('public.share_funnel_events') as t")).rows[0].t).toBeNull();
});
