import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261120090000_admin_verified_vendor_funnel: genuine vendors only, test and
// internal accounts split out, one row per email, admin + MFA only.
// Offline in PGlite, never against production.
const prereqs = `
  alter table auth.users add column email_confirmed_at timestamptz;
  alter table public.users add column created_at timestamptz default now();
  create table public.beta_applications (id bigserial primary key, user_id uuid, provider_id text, source text, campaign text, status text default 'started');
  create table public.portfolio_items (id bigserial primary key, provider_id text);
  create table public.vendor_packages (id bigserial primary key, provider_id text, active boolean default true);
`;
const up = readMigration("migrations/20261120090000_admin_verified_vendor_funnel.sql");
const down = readMigration("rollbacks/20261120090000_admin_verified_vendor_funnel.down.sql");

const ids = {
  done: "00000000-0000-0000-0000-0000000000d1",
  unconfirmed: "00000000-0000-0000-0000-0000000000d2",
  qaName: "00000000-0000-0000-0000-0000000000d3",
  qaCampaign: "00000000-0000-0000-0000-0000000000d4",
  internal: "00000000-0000-0000-0000-0000000000d5",
  dupe: "00000000-0000-0000-0000-0000000000d6",
};

const seed = (A: string, B: string) => `
  update auth.users set email_confirmed_at = now() where id in ('${A}', '${B}');
  insert into auth.users (id, email, email_confirmed_at) values
    ('${ids.done}', 'done@video.com.au', now()),
    ('${ids.unconfirmed}', 'new@decor.com.au', null),
    ('${ids.qaName}', 'someone@gmail.com', now()),
    ('${ids.qaCampaign}', 'qa2@gmail.com', now()),
    ('${ids.internal}', 'hello@evntlyapp.com', now()),
    ('${ids.dupe}', 'DONE@video.com.au', now());
  insert into public.users (id, email, role) values
    ('${ids.done}', 'done@video.com.au', 'vendor'),
    ('${ids.unconfirmed}', 'new@decor.com.au', 'vendor'),
    ('${ids.qaName}', 'someone@gmail.com', 'vendor'),
    ('${ids.qaCampaign}', 'qa2@gmail.com', 'vendor'),
    ('${ids.internal}', 'hello@evntlyapp.com', 'vendor'),
    ('${ids.dupe}', 'DONE@video.com.au', 'vendor');
  insert into public.service_providers (id, owner_user_id, name, status) values
    ('sp-a', '${A}', 'Alice Photo', 'approved'),
    ('sp-done', '${ids.done}', 'Done Video', 'approved'),
    ('sp-qa', '${ids.qaName}', 'TEST-Evntly QA (do not book)', 'suspended'),
    ('sp-b', '${B}', 'Bob DJ', 'draft');
  insert into public.beta_applications (user_id, source, campaign, status) values
    ('${A}', 'instagram_dm', null, 'approved'),
    ('${ids.done}', 'direct_outreach', 'fb_groups', 'approved'),
    ('${ids.qaCampaign}', 'direct', 'qa_claim_test', 'withdrawn'),
    ('${B}', 'meta_ads', 'b_dj', 'started');
  insert into public.portfolio_items (provider_id) values ('sp-done'), ('sp-done'), ('sp-done'), ('sp-a');
  insert into public.vendor_packages (provider_id, active) values ('sp-done', true), ('sp-a', false);
`;

it("counts genuine vendors by source and keeps test accounts out", { timeout: 60_000 }, async () => {
  const d = await setupDb([prereqs, up]);
  await d.db.exec(seed(d.A, d.B));

  const rows = (await d.as(d.ADMIN, () => d.db.query("select * from public.admin_verified_vendor_funnel()"))).rows;
  const genuine = rows.filter((r) => !r.is_test);
  const sum = (k: string) => genuine.reduce((n, r) => n + Number(r[k]), 0);

  // A (approved, incomplete), B (draft), done (complete), unconfirmed; dupe collapses into done.
  expect(sum("accounts")).toBe(4);
  expect(sum("verified")).toBe(3);
  expect(sum("listings_created")).toBe(3);
  expect(sum("approved")).toBe(2);
  expect(sum("completed")).toBe(1);
  expect(genuine.find((r) => r.source === "direct_outreach")?.completed).toBe(1);
  expect(genuine.find((r) => r.source === "meta_ads")?.verified).toBe(1);

  // QA-named listing, qa campaign, evntlyapp.com address. (The stub admin has
  // no listing or application, so it isn't a vendor row at all.)
  const test = rows.filter((r) => r.is_test).reduce((n, r) => n + Number(r.accounts), 0);
  expect(test).toBe(3);
});

it("is admin + MFA only and rolls back cleanly", { timeout: 60_000 }, async () => {
  const d = await setupDb([prereqs, up]);
  await d.db.exec(seed(d.A, d.B));

  // Non-admin vendor and an admin without MFA see nothing.
  expect((await d.as(d.A, () => d.db.query("select * from public.admin_verified_vendor_funnel()"))).rows).toHaveLength(0);
  expect((await d.as(d.ADMIN, () => d.db.query("select * from public.admin_verified_vendor_funnel()"), { aal: "aal1" })).rows).toHaveLength(0);
  // Anonymous can't call it at all.
  expect(await d.err(d.as("anon", () => d.db.query("select * from public.admin_verified_vendor_funnel()")))).toMatch(/permission denied/);

  await d.db.exec(down);
  expect((await d.db.query("select count(*)::int as n from pg_proc where proname = 'admin_verified_vendor_funnel'")).rows[0].n).toBe(0);
});
