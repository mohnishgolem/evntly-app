import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261107090000_founding_page_views on top of the original funnel migration:
// two new page kinds, shown as vendor funnel steps 100 and 101.
const prereqs = `
  alter table auth.users add column created_at timestamptz default now();
  create table public.quote_requests (id bigserial primary key, client_user_id uuid, quoted_amount numeric, created_at timestamptz default now());
  create table public.bookings (id bigserial primary key, client_user_id uuid, status text, created_at timestamptz default now());
`;
// pg_cron isn't available in PGlite; the prune job isn't under test.
const base = readMigration("migrations/20261020120000_funnel_analytics.sql").replace(/select cron\.schedule\([\s\S]*?\);\s*$/, "");
const next = readMigration("migrations/20261107090000_founding_page_views.sql");

it("counts founding page visitors in the vendor funnel", { timeout: 60_000 }, async () => {
  const { db, as, err, A } = await setupDb([prereqs, base, next]);
  await db.exec(`
    insert into public.page_views (kind, visitor_id) values
      ('founding', 'visitor-1'), ('founding', 'visitor-1'), ('founding', 'visitor-2'), ('founding', 'visitor-3'),
      ('founding_claim', 'visitor-1'), ('vendor_signup', 'visitor-2'), ('vendor_signup', 'visitor-1'),
      ('home', 'visitor-9');
  `);
  expect(await err(db.query("insert into public.page_views (kind, visitor_id) values ('admin', 'visitor-1')"))).toMatch(/page_views_kind_check/);

  const ADMIN = "00000000-0000-0000-0000-00000000000a";
  const rows = (await as(ADMIN, () => db.query("select step, label, people from public.admin_funnel(30)"))).rows;
  const byStep = Object.fromEntries(rows.map((r) => [r.step, Number(r.people)]));
  expect(byStep[100]).toBe(3); // distinct founding page visitors
  expect(byStep[101]).toBe(2); // distinct visitors to sign-up or claim
  expect(byStep[1]).toBe(4); // still counts every visitor
  expect(rows.map((r) => r.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 100, 101, 102, 103]);

  // Still admin-only and still not callable by anon.
  expect((await as(A, () => db.query("select * from public.admin_funnel(30)"))).rows).toEqual([]);
  expect(await err(as("anon", () => db.query("select * from public.admin_funnel(30)")))).toMatch(/permission denied/);
});
