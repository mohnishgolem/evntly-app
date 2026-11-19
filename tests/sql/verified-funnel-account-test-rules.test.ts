import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261121090000_verified_funnel_account_test_rules: test ACCOUNTS with no
// listing (a +qa alias, an account named "... test", the "saim" login) are
// split out as test. Offline in PGlite, never against production.
const prereqs = `
  alter table auth.users add column email_confirmed_at timestamptz;
  alter table auth.users add column raw_user_meta_data jsonb default '{}'::jsonb;
  alter table public.users add column created_at timestamptz default now();
  create table public.beta_applications (id bigserial primary key, user_id uuid, provider_id text, source text, campaign text, status text default 'started');
  create table public.portfolio_items (id bigserial primary key, provider_id text);
  create table public.vendor_packages (id bigserial primary key, provider_id text, active boolean default true);
`;
const base = readMigration("migrations/20261120090000_admin_verified_vendor_funnel.sql");
const up = readMigration("migrations/20261121090000_verified_funnel_account_test_rules.sql");
const down = readMigration("rollbacks/20261121090000_verified_funnel_account_test_rules.down.sql");

const ids = {
  alias: "00000000-0000-0000-0000-0000000000e1",
  named: "00000000-0000-0000-0000-0000000000e2",
  saim: "75ff584a-0dc5-41cc-b69e-566f4bd731fa",
  real: "00000000-0000-0000-0000-0000000000e4",
  testa: "00000000-0000-0000-0000-0000000000e5",
};

const seed = `
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    ('${ids.alias}', 'owner+qa-vendor@gmail.com', now(), '{}'),
    ('${ids.named}', 'kid@gmail.com', now(), '{"full_name":"krishiv test"}'),
    ('${ids.saim}', 'saim@gmail.com', now(), '{"full_name":"saim"}'),
    ('${ids.real}', 'alex@gmail.com', now(), '{"full_name":"Alex Manchester"}'),
    ('${ids.testa}', 'celeste@gmail.com', now(), '{"full_name":"Celeste Testa"}');
  insert into public.users (id, email, role) values
    ('${ids.alias}', 'owner+qa-vendor@gmail.com', 'vendor'),
    ('${ids.named}', 'kid@gmail.com', 'vendor'),
    ('${ids.saim}', 'saim@gmail.com', 'vendor'),
    ('${ids.real}', 'alex@gmail.com', 'vendor'),
    ('${ids.testa}', 'celeste@gmail.com', 'vendor');
  insert into public.beta_applications (user_id, source, campaign, status) values
    ('${ids.real}', 'meta_ads', 'b_dj', 'started');
`;

const counts = async (d: Awaited<ReturnType<typeof setupDb>>) => {
  const rows = (await d.as(d.ADMIN, () => d.db.query("select * from public.admin_verified_vendor_funnel()"))).rows;
  const sum = (test: boolean) => rows.filter((r) => r.is_test === test).reduce((n, r) => n + Number(r.accounts), 0);
  return { genuine: sum(false), test: sum(true) };
};

it("splits out test accounts with no listing, keeps real people", { timeout: 60_000 }, async () => {
  const d = await setupDb([prereqs, base]);
  await d.db.exec(seed);
  // Before: all five seeded accounts count as genuine (plus the stub's own users).
  const before = await counts(d);
  expect(before.test).toBe(0);

  await d.db.exec(up);
  // After: Alex and Celeste Testa stay; the alias, "krishiv test" and saim move to test.
  expect(await counts(d)).toEqual({ genuine: before.genuine - 3, test: 3 });

  // Still admin + MFA only.
  expect((await d.as(d.ADMIN, () => d.db.query("select * from public.admin_verified_vendor_funnel()"), { aal: "aal1" })).rows).toHaveLength(0);
  expect(await d.err(d.as("anon", () => d.db.query("select * from public.admin_verified_vendor_funnel()")))).toMatch(/permission denied/);

  // Rollback restores the old rules.
  await d.db.exec(down);
  expect(await counts(d)).toEqual(before);
});
