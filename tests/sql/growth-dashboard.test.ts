import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261130100000_growth_dashboard, offline in PGlite. Never against production.
const prereqs = `
  alter table auth.users add column email_confirmed_at timestamptz, add column raw_user_meta_data jsonb default '{}'::jsonb;
  alter table public.users add column created_at timestamptz default now();
  create table public.page_views (id bigserial primary key, created_at timestamptz default now(), kind text, visitor_id text, vendor_id text, user_id uuid, source text,
    constraint page_views_kind_check check (kind in ('home')));
  create table public.funnel_events (id bigserial primary key, created_at timestamptz default now(), event text, source text, campaign text, detail text, visitor_id text,
    constraint funnel_events_event_check check (event in ('claim_click')));
  create table public.beta_applications (id uuid primary key default gen_random_uuid(), user_id text, campaign text, source text, status text, decided_at timestamptz);
  create table public.portfolio_items (id bigserial primary key, provider_id text, created_at timestamptz default now());
  create table public.vendor_packages (id bigserial primary key, provider_id text, active boolean default true, created_at timestamptz default now());
  create table public.quote_requests (id text primary key default gen_random_uuid()::text, vendor_id text, client_user_id uuid, created_at timestamptz default now());
  create table public.bookings (id text primary key default gen_random_uuid()::text, provider_id text, client_user_id uuid, status text, created_at timestamptz default now());
  create table public.events (id text primary key default gen_random_uuid()::text, organiser_user_id uuid, created_at timestamptz default now());
  create table public.vendor_prospects (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), contacted_at timestamptz, replied_at timestamptz, do_not_contact boolean default false);
  create table public.vendor_prospect_events (id bigserial primary key, prospect_id uuid, action text, created_at timestamptz default now());
  create schema cron;
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ select 1::bigint $$;
`;
const drafts = readMigration("migrations/20261130090000_vendor_listing_drafts.sql");
const up = readMigration("migrations/20261130100000_growth_dashboard.sql");
const down = readMigration("rollbacks/20261130100000_growth_dashboard.down.sql");

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const A = "00000000-0000-0000-0000-0000000000a1";
const C = "00000000-0000-0000-0000-0000000000c1";
const QA = "00000000-0000-0000-0000-0000000000d1";

it("counts each stage per day, genuine activity only, admins only", { timeout: 60_000 }, async () => {
  const { db, as, err } = await setupDb([prereqs, drafts, up]);
  await db.exec(`update auth.users set email_confirmed_at = now()`);
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${QA}', 'me+qa@gmail.com', now()); insert into public.users (id, email, role) values ('${QA}', 'me+qa@gmail.com', 'customer')`);

  const p = (await db.query(`insert into public.vendor_prospects default values returning id`)).rows[0].id;
  await db.exec(`insert into public.vendor_prospect_events (prospect_id, action) values ('${p}', 'contacted'), ('${p}', 'replied')`);
  await db.exec(`insert into public.vendor_listing_drafts (token_hash) values (repeat('a', 64))`);
  const sp = (await db.query(`insert into public.service_providers (owner_user_id, name, status) values ('${A}', 'Harbourlight', 'approved') returning id`)).rows[0].id;
  await db.exec(`insert into public.portfolio_items (provider_id) values ('${sp}'), ('${sp}'), ('${sp}'); insert into public.vendor_packages (provider_id) values ('${sp}')`);
  await db.exec(`insert into public.events (organiser_user_id) values ('${C}'), ('${QA}'), ('${ADMIN}')`);
  // Real customer → real vendor counts; QA customer and admin don't.
  await db.exec(`insert into public.quote_requests (vendor_id, client_user_id) values ('${sp}', '${C}'), ('${sp}', '${QA}'), ('${sp}', '${ADMIN}')`);
  await db.exec(`insert into public.bookings (provider_id, client_user_id, status) values ('${sp}', '${C}', 'confirmed'), ('${sp}', '${C}', 'pending'), ('${sp}', '${QA}', 'confirmed')`);

  // Spend: admins (with MFA) only.
  expect(await as(A, () => err(db.exec(`insert into public.acquisition_spend (day, channel, amount_cents) values (current_date, 'meta_ads', 500)`)))).toMatch(/row-level security|permission denied/);
  await as(ADMIN, () => db.exec(`insert into public.acquisition_spend (day, channel, amount_cents) values ((now() at time zone 'Australia/Sydney')::date, 'print', 2500)`));
  expect(await err(db.exec(`insert into public.acquisition_spend (day, channel, amount_cents) values (current_date, 'bribes', 1)`))).toMatch(/check/);

  const today = (await as(ADMIN, () => db.query(`select * from public.admin_growth_daily(7) limit 1`))).rows[0];
  expect(today).toMatchObject({
    prospects_added: 1,
    vendors_contacted: 1,
    replies: 1,
    listing_drafts: 1,
    vendor_registrations: 2, // alice + bob from the stub
    listings_approved: 1,
    listings_completed: 1,
    customer_registrations: 1, // carol, not the +qa account
    event_plans: 1,
    genuine_enquiries: 1,
    confirmed_bookings: 1,
  });
  expect(Number(today.spend_cents)).toBe(2500);
  expect((await as(ADMIN, () => db.query(`select count(*)::int n from public.admin_growth_daily(30)`))).rows[0].n).toBe(30);

  // Nobody else sees it.
  expect((await as(A, () => db.query(`select * from public.admin_growth_daily(7)`))).rows).toHaveLength(0);
  expect((await as(ADMIN, () => db.query(`select * from public.admin_growth_daily(7)`), { aal: "aal1" })).rows).toHaveLength(0);
  expect(await as("anon", () => err(db.query(`select * from public.admin_growth_daily(7)`)))).toMatch(/permission denied/);
  expect(await as(A, () => err(db.query(`select * from public.internal_test_user_ids()`)))).toMatch(/permission denied/);
  const totals = (await as(ADMIN, () => db.query(`select * from public.admin_growth_totals()`))).rows;
  expect(Object.fromEntries(totals.map((t) => [t.measure, Number(t.value)]))).toMatchObject({ vendor_prospects: 1, open_listing_drafts: 1, acquisition_spend_cents: 2500 });
});

it("rolls back cleanly", { timeout: 60_000 }, async () => {
  const { db, err } = await setupDb([prereqs, drafts, up, down]);
  expect(await err(db.query(`select * from public.acquisition_spend`))).toMatch(/does not exist/);
  await db.exec(up);
});
