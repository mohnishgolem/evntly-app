import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261113090000_founding_campaign_tags: per-post campaign tags on
// beta_applications and funnel_events, and admin_founding_campaigns().
// Offline in PGlite, never against production.
const prereqs = `
  alter table auth.users add column created_at timestamptz default now();
  create table public.quote_requests (id bigserial primary key, client_user_id uuid, quoted_amount numeric, created_at timestamptz default now());
  create table public.bookings (id bigserial primary key, client_user_id uuid, status text, created_at timestamptz default now());
  create table public.beta_applications (id bigserial primary key, user_id uuid, provider_id text, source text not null default 'direct',
    status text not null default 'started', submitted_at timestamptz, created_at timestamptz not null default now());
`;
const base = readMigration("migrations/20261020120000_funnel_analytics.sql").replace(/select cron\.schedule\([\s\S]*?\);\s*$/, "");
const pageViews = readMigration("migrations/20261107090000_founding_page_views.sql");
const events = readMigration("migrations/20261112090000_founding_funnel_events.sql");
const USER_A = "00000000-0000-0000-0000-0000000000a1"; // setupDb's user A
const tags = readMigration("migrations/20261113090000_founding_campaign_tags.sql");

it("stores clean campaign tags and reports them to admins only", { timeout: 60_000 }, async () => {
  const { db, as, err, A, ADMIN } = await setupDb([
    prereqs,
    base,
    pageViews,
    events,
    // Rows from before the migration keep working, with no campaign.
    `insert into public.funnel_events (event, source, visitor_id) values ('claim_click', 'instagram_dm', 'visitor-old');
     insert into public.beta_applications (user_id, source) values ('${USER_A}', 'instagram_dm');`,
    tags,
  ]);

  await db.exec(`
    insert into public.funnel_events (event, source, visitor_id, campaign) values
      ('claim_click', 'meta_ads', 'visitor-1', 'a_photo'), ('claim_click', 'meta_ads', 'visitor-1', 'a_photo'),
      ('claim_click', 'meta_ads', 'visitor-2', 'b_dj'), ('account_created', 'meta_ads', null, 'a_photo');
    insert into public.beta_applications (user_id, source, campaign, status, submitted_at) values
      ('${A}', 'meta_ads', 'a_photo', 'approved', now()), ('${A}', 'meta_ads', 'b_dj', 'started', null);
  `);
  // Only short lowercase tags fit: nothing personal can be smuggled in.
  for (const bad of ["Reel A", "someone@example.com", "-starts-with-dash", "x".repeat(41)]) {
    expect(await err(db.query("insert into public.funnel_events (event, campaign) values ('claim_click', $1)", [bad]))).toMatch(/check/);
    expect(await err(db.query("insert into public.beta_applications (user_id, campaign) values ($1, $2)", [A, bad]))).toMatch(/check/);
  }

  const rows = (await as(ADMIN, () => db.query("select * from public.admin_founding_campaigns(30)"))).rows;
  const by = Object.fromEntries(rows.map((r) => [`${r.campaign}|${r.source}`, r]));
  expect(by["a_photo|meta_ads"]).toMatchObject({ claim_clicks: 1, accounts: 1, claimed: 1, submitted: 1, approved: 1 });
  expect(by["b_dj|meta_ads"]).toMatchObject({ claim_clicks: 1, claimed: 1, submitted: 0, approved: 0 });
  expect(by["(none)|instagram_dm"]).toMatchObject({ claim_clicks: 1, claimed: 1 });

  expect((await as(A, () => db.query("select * from public.admin_founding_campaigns(30)"))).rows).toEqual([]);
  expect(await err(as("anon", () => db.query("select * from public.admin_founding_campaigns(30)")))).toMatch(/permission denied/);
});

it("rolls back cleanly", { timeout: 60_000 }, async () => {
  const down = readMigration("rollbacks/20261113090000_founding_campaign_tags.down.sql");
  const { db, err } = await setupDb([prereqs, base, pageViews, events, tags, down]);
  expect(await err(db.query("select campaign from public.funnel_events"))).toMatch(/does not exist/);
  expect(await err(db.query("select campaign from public.beta_applications"))).toMatch(/does not exist/);
  expect(await err(db.query("select * from public.admin_founding_campaigns(30)"))).toMatch(/does not exist/);
});
