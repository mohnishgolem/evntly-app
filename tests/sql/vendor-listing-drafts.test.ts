import { expect, it } from "vitest";
import { readMigration, setupDb, sha } from "./supabase-stub";

// 20261130090000_vendor_listing_drafts, offline in PGlite (pg_cron stubbed).
// Never runs against production.
const prereqs = `
  alter table auth.users add column email_confirmed_at timestamptz, add column raw_user_meta_data jsonb default '{}'::jsonb;
  create table public.page_views (id bigserial primary key, created_at timestamptz default now(), kind text, visitor_id text, vendor_id text, user_id uuid, source text,
    constraint page_views_kind_check check (kind in ('home')));
  create table public.funnel_events (id bigserial primary key, created_at timestamptz default now(), event text, source text, campaign text, detail text, visitor_id text,
    constraint funnel_events_event_check check (event in ('claim_click')));
  create table public.beta_applications (id uuid primary key default gen_random_uuid(), user_id text, campaign text, source text);
  create table public.portfolio_items (id bigserial primary key, provider_id text);
  create table public.vendor_packages (id bigserial primary key, provider_id text, active boolean default true);
  create table public.quote_requests (id text primary key default gen_random_uuid()::text, vendor_id text, client_user_id uuid, created_at timestamptz default now());
  create schema cron;
  create table cron.jobs (name text primary key, schedule text, command text);
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.jobs values (n, s, c) returning 1::bigint $$;
  create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.jobs where name = n returning true $$;
`;
const up = readMigration("migrations/20261130090000_vendor_listing_drafts.sql");
const down = readMigration("rollbacks/20261130090000_vendor_listing_drafts.down.sql");

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const A = "00000000-0000-0000-0000-0000000000a1"; // vendor (photographer)
const B = "00000000-0000-0000-0000-0000000000b1"; // vendor (dj)
const C = "00000000-0000-0000-0000-0000000000c1"; // customer

it("keeps drafts service-role only and requires recorded permission for assisted drafts", { timeout: 60_000 }, async () => {
  const { db, as, err } = await setupDb([prereqs, up]);
  await db.exec(`insert into public.vendor_listing_drafts (token_hash, data) values ('${sha("t1")}', '{"businessName":"Harbourlight"}')`);

  // Nobody but the service role can read or write drafts.
  expect(await as("anon", () => err(db.query("select * from public.vendor_listing_drafts")))).toMatch(/permission denied/);
  expect(await as(A, () => err(db.query("select * from public.vendor_listing_drafts")))).toMatch(/permission denied/);
  expect(await as(ADMIN, () => err(db.exec(`insert into public.vendor_listing_drafts (token_hash) values ('${sha("x")}')`)))).toMatch(/permission denied/);

  // Only hashes are stored.
  expect(await err(db.exec(`insert into public.vendor_listing_drafts (token_hash) values ('plain-token')`))).toMatch(/check/);
  // An assisted draft must say who gave permission, how, when, and for which email.
  expect(await err(db.exec(`insert into public.vendor_listing_drafts (token_hash, origin, email) values ('${sha("t2")}', 'assisted', 'jo@x.com')`))).toMatch(
    /vendor_listing_drafts_assisted_permission/
  );
  await db.exec(`insert into public.vendor_listing_drafts (token_hash, origin, email, created_by, permission_note, permission_at)
    values ('${sha("t3")}', 'assisted', 'jo@studio.com.au', '${ADMIN}', 'Phone call 24 Nov: yes please', now())`);
  expect(await err(db.exec(`insert into public.vendor_listing_drafts (token_hash, data) values ('${sha("t4")}', '"not an object"')`))).toMatch(/check/);

  // Expired, unclaimed drafts are purged 30 days after expiry; claimed ones stay.
  await db.exec(`insert into public.vendor_listing_drafts (token_hash, expires_at) values ('${sha("old")}', now() - interval '31 days')`);
  await db.exec(`insert into public.vendor_listing_drafts (token_hash, expires_at, claimed_at) values ('${sha("oldclaimed")}', now() - interval '31 days', now())`);
  await db.exec("select public.purge_expired_vendor_listing_drafts()");
  const left = await db.query(`select token_hash from public.vendor_listing_drafts`);
  expect(left.rows.map((r) => r.token_hash)).not.toContain(sha("old"));
  expect(left.rows.map((r) => r.token_hash)).toContain(sha("oldclaimed"));
  expect((await db.query("select schedule from cron.jobs where name = 'purge-expired-vendor-listing-drafts'")).rows[0].schedule).toBe("23 3 * * *");
  expect(await as(A, () => err(db.exec("select public.purge_expired_vendor_listing_drafts()")))).toMatch(/permission denied/);
});

it("measures the journey to approved vendors with a genuine enquiry, for admins only", { timeout: 60_000 }, async () => {
  const { db, as, err } = await setupDb([prereqs, up]);
  // Visits and steps (one admin browser that must not count).
  await db.exec(`insert into public.page_views (kind, visitor_id) values ('vendor_landing', 'visitor-1'), ('vendor_landing', 'visitor-2'), ('founding', 'visitor-3')`);
  await db.exec(`insert into public.page_views (kind, visitor_id, user_id) values ('vendor_landing', 'admin-browser', '${ADMIN}')`);
  await db.exec(`insert into public.funnel_events (event, visitor_id) values ('builder_started', 'visitor-1'), ('builder_started', 'visitor-2'),
    ('builder_preview', 'visitor-1'), ('calculator_used', 'visitor-2'), ('builder_started', 'admin-browser')`);

  // Two listings from drafts: A approved + complete + a real enquiry; B still a draft.
  const pa = (await db.query(`insert into public.service_providers (owner_user_id, name, status) values ('${A}', 'Harbourlight', 'approved') returning id`)).rows[0].id;
  const pb = (await db.query(`insert into public.service_providers (owner_user_id, name, status) values ('${B}', 'Northside Sound', 'draft') returning id`)).rows[0].id;
  await db.exec(`insert into public.portfolio_items (provider_id) values ('${pa}'), ('${pa}'), ('${pa}'); insert into public.vendor_packages (provider_id) values ('${pa}')`);
  await db.exec(`insert into public.vendor_listing_drafts (token_hash, claimed_by, claimed_at, provider_id) values ('${sha("a")}', '${A}', now(), '${pa}'), ('${sha("b")}', '${B}', now(), '${pb}'), ('${sha("c")}', null, null, null)`);
  await db.exec(`insert into public.vendor_listing_drafts (token_hash, origin, email, created_by, permission_note, permission_at, claim_opened_at)
    values ('${sha("d")}', 'assisted', 'jo@x.com', '${ADMIN}', 'DM reply: yes, go ahead', now(), now())`);
  // Admin's own test enquiry must not count; the customer's does.
  await db.exec(`insert into public.quote_requests (vendor_id, client_user_id) values ('${pa}', '${ADMIN}')`);

  const funnel = async () => {
    const rows = (await as(ADMIN, () => db.query("select step, people::int from public.admin_vendor_journey_funnel(30) order by step"))).rows;
    return Object.fromEntries(rows.map((r) => [r.step, r.people]));
  };
  let f = await funnel();
  expect([f[1], f[2], f[3], f[4]]).toEqual([3, 1, 2, 1]);
  expect([f[5], f[6], f[7], f[8], f[9], f[10], f[11], f[12]]).toEqual([3, 1, 1, 2, 2, 1, 1, 1]);
  expect(f[13]).toBe(0);
  expect(f[14]).toBe(1);
  expect(f[15]).toBe(0);

  await db.exec(`insert into public.quote_requests (vendor_id, client_user_id) values ('${pa}', '${C}')`);
  f = await funnel();
  expect(f[13]).toBe(1);
  expect(f[15]).toBe(1);

  // Not for vendors, customers or admins without MFA.
  expect((await as(A, () => db.query("select * from public.admin_vendor_journey_funnel(30)"))).rows).toHaveLength(0);
  expect((await as(ADMIN, () => db.query("select * from public.admin_vendor_journey_funnel(30)"), { aal: "aal1" })).rows).toHaveLength(0);
  expect(await as("anon", () => err(db.query("select * from public.admin_vendor_journey_funnel(30)")))).toMatch(/permission denied/);

  // New events and page kinds are accepted; unknown ones still aren't.
  await db.exec(`insert into public.funnel_events (event) values ('draft_saved'), ('listing_created'); insert into public.page_views (kind) values ('vendor_builder')`);
  expect(await err(db.exec(`insert into public.funnel_events (event) values ('made_up')`))).toMatch(/check/);
});

it("rolls back cleanly", { timeout: 60_000 }, async () => {
  const { db, err } = await setupDb([prereqs, up, down]);
  expect(await err(db.query("select * from public.vendor_listing_drafts"))).toMatch(/does not exist/);
  expect(await err(db.exec(`insert into public.funnel_events (event) values ('draft_saved')`))).toMatch(/check/);
  expect(await err(db.exec(`insert into public.page_views (kind) values ('vendor_landing')`))).toMatch(/check/);
  expect((await db.query("select count(*)::int n from cron.jobs")).rows[0].n).toBe(0);
  await db.exec(up);
});
