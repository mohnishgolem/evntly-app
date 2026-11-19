import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261123090000_vendor_share_profile: share sources on page_views and
// quote_requests.share_source. Offline in PGlite, never against production.
const prereqs = `
  create table public.quote_requests (id bigserial primary key, vendor_id text, client_email text, client_user_id uuid, quoted_amount numeric, created_at timestamptz default now(), origin text, status text default 'pending');
  -- Column-level grants, as on production.
  grant insert (vendor_id, client_email, origin, status) on public.quote_requests to authenticated;
  grant update (status) on public.quote_requests to authenticated;
  grant select (id, vendor_id, origin, status) on public.quote_requests to authenticated;
  grant usage on all sequences in schema public to authenticated;
`;
const base = readMigration("migrations/20261020120000_funnel_analytics.sql").replace(/select cron\.schedule\([\s\S]*?\);\s*$/, "");
const pageViews = readMigration("migrations/20261107090000_founding_page_views.sql");
const events = readMigration("migrations/20261112090000_founding_funnel_events.sql");
const v2 = readMigration("migrations/20261115090000_meta_v2_funnel.sql");
const up = readMigration("migrations/20261123090000_vendor_share_profile.sql");
const down = readMigration("rollbacks/20261123090000_vendor_share_profile.down.sql");

it("records share sources on page views and quote requests", { timeout: 60_000 }, async () => {
  const { db, as, err, C } = await setupDb([
    `alter table auth.users add column created_at timestamptz default now();
     create table public.bookings (id bigserial primary key, client_user_id uuid, status text, created_at timestamptz default now());
     create table public.beta_applications (id bigserial primary key, user_id uuid, provider_id text, submitted_at timestamptz);
     create table public.vendor_waitlist (id uuid primary key default gen_random_uuid(), email text not null, business_name text, invite_consent boolean not null default false);`,
    prereqs,
    base,
    pageViews,
    events,
    v2,
    `insert into public.page_views (kind, visitor_id, source) values ('founding', 'visitor-old', 'meta_ads');`,
    up,
  ]);

  // page_views: the three share sources are accepted, others still refused.
  await db.exec(`insert into public.page_views (kind, visitor_id, vendor_id, source) values
    ('vendor', 'visitor-1', null, 'share_story'), ('vendor', 'visitor-2', null, 'share_link'), ('vendor', 'visitor-3', null, 'share_qr');`);
  expect(await err(db.exec(`insert into public.page_views (kind, visitor_id, source) values ('vendor', 'visitor-4', 'share_tiktok')`))).toMatch(/page_views_source_check/);
  expect((await db.query("select count(*)::int as n from public.page_views where source = 'meta_ads'")).rows[0].n).toBe(1);

  // quote_requests: a customer can set it on their own new request…
  await as(C, () => db.exec(`insert into public.quote_requests (vendor_id, client_email, origin, share_source) values ('sp1', 'carol@flowers.com.au', 'vendor_profile', 'share_qr')`));
  expect((await db.query("select share_source from public.quote_requests")).rows[0].share_source).toBe("share_qr");
  // …only to a known value, and never change it afterwards.
  expect(await as(C, () => err(db.exec(`insert into public.quote_requests (vendor_id, client_email, share_source) values ('sp1', 'c', 'admin')`)))).toMatch(/share_source_check/);
  expect(await as(C, () => err(db.exec(`update public.quote_requests set share_source = 'share_link'`)))).toMatch(/permission denied/);
  // Requests without one are unaffected.
  await as(C, () => db.exec(`insert into public.quote_requests (vendor_id, client_email, origin) values ('sp2', 'c', 'vendor_profile')`));
  expect((await db.query("select share_source from public.quote_requests where vendor_id = 'sp2'")).rows[0].share_source).toBeNull();

  // Re-running the migration is harmless.
  await db.exec(up);

  // Rollback: column gone, share page views lose the tag, the old check is back.
  await db.exec(down);
  expect((await db.query("select count(*)::int as n from information_schema.columns where table_name = 'quote_requests' and column_name = 'share_source'")).rows[0].n).toBe(0);
  expect((await db.query("select count(*)::int as n from public.page_views where source like 'share_%'")).rows[0].n).toBe(0);
  expect((await db.query("select count(*)::int as n from public.page_views where kind = 'vendor'")).rows[0].n).toBe(3);
  expect(await err(db.exec(`insert into public.page_views (kind, visitor_id, source) values ('vendor', 'visitor-5', 'share_qr')`))).toMatch(/page_views_source_check/);
});
