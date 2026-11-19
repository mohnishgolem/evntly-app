import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261126090000_past_client_reviews. Offline in PGlite, never against
// production. The reviews table, policies, grants and triggers below mirror
// production as read on 19 Nov 2026.
const prereqs = `
  alter table auth.users add column email_confirmed_at timestamptz;
  alter table public.service_providers add column review_count int default 0, add column rating_sum float default 0, add column rating float default 0;
  create table public.bookings (id text primary key, provider_id text, client_user_id uuid, status text);
  create table public.reviews (
    id text primary key default gen_random_uuid()::text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text,
    provider_id text not null, booking_id text, reviewer_email text not null, reviewer_name text,
    rating double precision not null, comment text, event_type text, description text, reviewer_user_id uuid
  );
  alter table public.reviews enable row level security;
  create policy reviews_select_public on public.reviews for select using (true);
  create policy reviews_insert_own on public.reviews for insert with check (reviewer_user_id = (select auth.uid()));
  create policy reviews_update_own on public.reviews for update using (reviewer_user_id = (select auth.uid()));
  create policy reviews_delete_own on public.reviews for delete using (reviewer_user_id = (select auth.uid()));
  grant insert, update, delete on public.reviews to authenticated;
  grant select (id, created_at, updated_at, provider_id, booking_id, reviewer_name, rating, comment, event_type, description) on public.reviews to anon, authenticated;
  grant select on public.service_providers to anon, authenticated;
  create function public.recalculate_provider_rating() returns trigger language plpgsql security definer set search_path to 'public' as $$ begin return null; end $$;
  create trigger on_review_change after insert or delete or update on public.reviews for each row execute function public.recalculate_provider_rating();
  create function public.guard_reviews_write() returns trigger language plpgsql security definer set search_path to '' as $$ begin return new; end $$;
  create trigger trg_reviews_write_guard before insert or update on public.reviews for each row execute function public.guard_reviews_write();
`;
const up = readMigration("migrations/20261126090000_past_client_reviews.sql");
const down = readMigration("rollbacks/20261126090000_past_client_reviews.down.sql");

it("lets verified past clients review live vendors, once, labelled and hideable", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN, A, B, C } = await setupDb([prereqs]);
  // A owns "Photo Co" (live); B owns a sample listing; C is a customer.
  await db.exec(`
    insert into public.service_providers (id, owner_user_id, name, status, is_demo) values
      ('live', '${A}', 'Photo Co', 'approved', false),
      ('draft', '${B}', 'Draft Co', 'pending_review', false),
      ('sample', '${B}', 'Sample Co', 'approved', true);
    insert into public.bookings values ('bk1', 'live', '${C}', 'completed');
    insert into public.reviews (provider_id, booking_id, reviewer_email, reviewer_user_id, rating, comment)
      values ('live', 'bk1', 'carol@flowers.com.au', '${C}', 4, 'Booked on Evntly before the change');
  `);
  await db.exec(up);
  expect((await db.query("select source from public.reviews")).rows[0].source).toBe("booking");

  const post = (who: string, provider: string, extra = "", comment = "Brilliant on the day, everyone loved the photos.") =>
    as(who, () => err(db.exec(`insert into public.reviews (provider_id, reviewer_email, reviewer_user_id, rating, comment, source${extra ? ", booking_id" : ""})
      values ('${provider}', 'x@example.invalid', '${who}', 5, '${comment}', 'past_client'${extra ? `, '${extra}'` : ""})`)));

  // Unverified email: refused.
  expect(await post(C, "live")).toMatch(/Verify your email/);
  await db.query("update auth.users set email_confirmed_at = now() where id in ($1, $2)", [C, A]);
  // Not a live, real listing: refused.
  expect(await post(C, "draft")).toMatch(/can't receive reviews/);
  expect(await post(C, "sample")).toMatch(/can't receive reviews/);
  // Own business: refused. Too short: refused. Linked to a booking: refused.
  expect(await post(A, "live")).toMatch(/your own business/);
  expect(await post(C, "live", "", "Great!")).toMatch(/20 to 2,000/);
  expect(await post(C, "live", "bk1")).toMatch(/not linked to an Evntly booking/);
  // Posting as someone else: refused by row security.
  expect(await as(C, () => err(db.exec(`insert into public.reviews (provider_id, reviewer_email, reviewer_user_id, rating, comment, source)
    values ('live', 'x@example.invalid', '${B}', 5, 'Brilliant on the day, everyone loved it.', 'past_client')`)))).toMatch(/row-level security|Not authorized/);

  // The real thing works, once.
  expect(await post(C, "live")).toBe("");
  expect(await post(C, "live")).toMatch(/already reviewed this vendor|duplicate key/);

  // Ratings count booking + past-client reviews: (4 + 5) / 2.
  const rating = async () => (await db.query("select review_count, rating from public.service_providers where id = 'live'")).rows[0];
  expect(await rating()).toMatchObject({ review_count: 2, rating: 4.5 });

  // Customers can't hide reviews or relabel them; they can edit their words.
  const mine = (await db.query("select id from public.reviews where source = 'past_client'")).rows[0].id;
  expect(await as(C, () => err(db.exec(`update public.reviews set hidden_at = now() where id = '${mine}'`)))).toMatch(/Not authorized/);
  expect(await as(C, () => err(db.exec(`update public.reviews set source = 'booking' where id = '${mine}'`)))).toMatch(/Not authorized/);
  expect(await as(C, () => err(db.exec(`update public.reviews set comment = 'Updated: still brilliant, would book again.' where id = '${mine}'`)))).toBe("");
  // Nobody can create a review already hidden.
  expect(await as(C, () => err(db.exec(`insert into public.reviews (provider_id, reviewer_email, reviewer_user_id, rating, comment, source, hidden_at)
    values ('live', 'x', '${C}', 1, 'Trying to sneak a hidden one in here.', 'past_client', now())`)))).toMatch(/Not authorized/);

  // The public can read the label.
  expect((await as("anon", () => db.query("select source from public.reviews order by source"))).rows.map((r) => r.source)).toEqual(["booking", "past_client"]);

  // An admin (service role here) hides it: gone for the public and from the rating, still visible to its author.
  const asServiceRole = () =>
    db.exec(`select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '{"role":"service_role"}', false);`);
  await asServiceRole();
  await db.exec(`update public.reviews set hidden_at = now(), hidden_reason = 'Looks like a friend of the owner' where id = '${mine}'`);
  expect(await rating()).toMatchObject({ review_count: 1, rating: 4 });
  expect((await as("anon", () => db.query("select id from public.reviews"))).rows).toHaveLength(1);
  expect((await as(C, () => db.query(`select id from public.reviews where id = '${mine}'`))).rows).toHaveLength(1);
  await as(ADMIN, async () => expect((await db.query("select id from public.reviews")).rows).toHaveLength(2));

  // Daily cap: 5 past-client reviews per person per day.
  for (let i = 0; i < 5; i++) await db.exec(`insert into public.service_providers (id, owner_user_id, name, status, is_demo) values ('v${i}', '${A}', 'V${i}', 'approved', false)`);
  await db.exec(`insert into public.service_providers (id, owner_user_id, name, status, is_demo) values ('v5', '${A}', 'V5', 'approved', false)`);
  for (let i = 0; i < 4; i++) expect(await post(C, `v${i}`)).toBe("");
  expect(await post(C, "v4")).toMatch(/up to 5 past-client reviews a day/);

  // Booking reviews still follow the old rule.
  expect(await as(C, () => err(db.exec(`insert into public.reviews (provider_id, booking_id, reviewer_email, reviewer_user_id, rating) values ('live', 'nope', 'x', '${C}', 5)`)))).toMatch(/after a completed booking/);

  // Rollback removes past-client reviews and the new columns.
  await db.exec(down);
  expect((await db.query("select count(*)::int as n from public.reviews")).rows[0].n).toBe(1);
  expect((await db.query("select count(*)::int as n from information_schema.columns where table_name = 'reviews' and column_name in ('source', 'hidden_at')")).rows[0].n).toBe(0);
});
