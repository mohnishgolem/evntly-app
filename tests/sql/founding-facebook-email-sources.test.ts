import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261201090000_founding_facebook_email_sources: facebook_group, facebook_dm
// and email_outreach accepted on beta_applications, page_views and
// funnel_events, and kept by claim_founding_vendor_place. Offline in PGlite,
// never against production.
const founding = [
  "migrations/20261101090000_founding_vendor_beta.sql",
  "migrations/20261103090000_founding_200_and_reminders.sql",
  "migrations/20261104090000_founding_scheduled_sends.sql",
  "migrations/20261105090000_founding_referrals.sql",
  "migrations/20261108090000_founding_meta_ads_source.sql",
].map(readMigration);
const prereqs = `
  alter table auth.users add column created_at timestamptz default now();
  create table public.quote_requests (id bigserial primary key, vendor_id text, client_email text, client_user_id uuid, quoted_amount numeric, created_at timestamptz default now(), origin text, status text default 'pending');
  create table public.bookings (id bigserial primary key, client_user_id uuid, status text, created_at timestamptz default now());
`;
const base = readMigration("migrations/20261020120000_funnel_analytics.sql").replace(/select cron\.schedule\([\s\S]*?\);\s*$/, "");
const pageViews = readMigration("migrations/20261107090000_founding_page_views.sql");
const events = readMigration("migrations/20261112090000_founding_funnel_events.sql");
const v2 = readMigration("migrations/20261115090000_meta_v2_funnel.sql");
const share = readMigration("migrations/20261123090000_vendor_share_profile.sql");
const up = readMigration("migrations/20261201090000_founding_facebook_email_sources.sql");
const down = readMigration("rollbacks/20261201090000_founding_facebook_email_sources.down.sql");

const NEW = ["facebook_group", "facebook_dm", "email_outreach"];

async function setup() {
  return setupDb([
    ...founding,
    prereqs,
    base,
    pageViews,
    events,
    v2,
    share,
    // Rows written before the migration must survive it.
    `insert into public.page_views (kind, visitor_id, source) values ('founding', 'visitor-old', 'meta_ads'), ('vendor', 'visitor-share', 'share_qr');
     insert into public.funnel_events (event, source, visitor_id) values ('claim_click', 'instagram_dm', 'visitor-old');`,
  ]);
}

it("is refused before the migration (so it must be applied before the code ships)", { timeout: 60_000 }, async () => {
  const { db, err } = await setup();
  expect(await err(db.query("insert into public.page_views (kind, visitor_id, source) values ('founding', 'visitor-1', 'facebook_group')"))).toMatch(/page_views_source_check/);
  expect(await err(db.query("insert into public.funnel_events (event, source) values ('claim_click', 'facebook_dm')"))).toMatch(/funnel_events_source_check/);
});

it("accepts the three new sources everywhere and the claim keeps them", { timeout: 60_000 }, async () => {
  const { db, as, err, A, B, C } = await setup();
  await db.exec(up);
  const sourceOf = async (id: string) => (await db.query("select source from public.beta_applications where id=$1", [id])).rows[0].source;

  for (const s of NEW) {
    await db.query("insert into public.page_views (kind, visitor_id, source) values ('founding', 'visitor-1', $1)", [s]);
    await db.query("insert into public.funnel_events (event, source, visitor_id) values ('claim_click', $1, 'visitor-1')", [s]);
  }
  expect((await db.query("select count(*)::int as n from public.page_views where source = any($1)", [NEW])).rows[0].n).toBe(3);
  expect((await db.query("select count(*)::int as n from public.funnel_events where source = any($1)", [NEW])).rows[0].n).toBe(3);

  // Existing values (founding and share) are still accepted.
  await db.exec(`insert into public.page_views (kind, visitor_id, source) values ('founding', 'visitor-v2', 'waitlist_email'), ('vendor', 'visitor-v3', 'share_link');
                 insert into public.funnel_events (event, source) values ('claim_click', 'meta_ads'), ('claim_click', null);`);

  // The claim RPC records each new source instead of turning it into 'direct'.
  const ra = await as(A, () => db.query("select * from public.claim_founding_vendor_place(null, 'facebook_group', null)"));
  expect(await sourceOf(ra.rows[0].application_id)).toBe("facebook_group");
  const rb = await as(B, () => db.query("select * from public.claim_founding_vendor_place(null, 'facebook_dm', null)"));
  expect(await sourceOf(rb.rows[0].application_id)).toBe("facebook_dm");
  const rc = await as(C, () => db.query("select * from public.claim_founding_vendor_place(null, 'email_outreach', null)"));
  expect(await sourceOf(rc.rows[0].application_id)).toBe("email_outreach");

  // Unknown values: the RPC still falls back to 'direct' and the checks still refuse them.
  await db.exec("delete from public.beta_applications");
  const rd = await as(A, () => db.query("select * from public.claim_founding_vendor_place(null, 'email', null)"));
  expect(await sourceOf(rd.rows[0].application_id)).toBe("direct");
  expect(await err(db.query("update public.beta_applications set source = 'facebook'"))).toMatch(/beta_applications_source_check/);
  expect(await err(db.query("insert into public.page_views (kind, visitor_id, source) values ('founding', 'visitor-v4', 'email')"))).toMatch(/page_views_source_check/);
  expect(await err(db.query("insert into public.funnel_events (event, source) values ('claim_click', 'facebook')"))).toMatch(/funnel_events_source_check/);

  // Same access rules: anonymous callers still can't claim.
  expect(await err(as("anon", () => db.query("select * from public.claim_founding_vendor_place(null, 'facebook_group', null)")))).toMatch(/permission denied|Log in/);

  // Re-running the migration is harmless.
  await db.exec(up);
});

it("rolls back cleanly", { timeout: 60_000 }, async () => {
  const { db, as, err, A } = await setup();
  await db.exec(up);
  await db.exec(`insert into public.page_views (kind, visitor_id, source) values ('founding', 'visitor-v1', 'facebook_group');
                 insert into public.funnel_events (event, source) values ('claim_click', 'email_outreach');`);
  await as(A, () => db.query("select * from public.claim_founding_vendor_place(null, 'facebook_dm', null)"));

  await db.exec(down);
  expect((await db.query("select source from public.beta_applications")).rows.map((r) => r.source)).toEqual(["direct"]);
  expect((await db.query("select count(*)::int as n from public.page_views where kind = 'founding' and source is null")).rows[0].n).toBe(1);
  expect((await db.query("select count(*)::int as n from public.funnel_events where source is null")).rows[0].n).toBe(1);
  expect((await db.query("select count(*)::int as n from public.page_views where source in ('meta_ads', 'share_qr')")).rows[0].n).toBe(2);
  expect(await err(db.query("insert into public.page_views (kind, visitor_id, source) values ('founding', 'visitor-v2', 'facebook_group')"))).toMatch(/page_views_source_check/);
  expect(await err(db.query("insert into public.funnel_events (event, source) values ('claim_click', 'facebook_dm')"))).toMatch(/funnel_events_source_check/);
  expect(await err(db.query("update public.beta_applications set source = 'email_outreach'"))).toMatch(/beta_applications_source_check/);

  // The claim function is back to its 20261108090000 list.
  await db.exec("delete from public.beta_applications");
  const r = await as(A, () => db.query("select * from public.claim_founding_vendor_place(null, 'facebook_group', null)"));
  expect((await db.query("select source from public.beta_applications where id=$1", [r.rows[0].application_id])).rows[0].source).toBe("direct");
});
