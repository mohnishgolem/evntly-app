import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261108090000_founding_meta_ads_source on top of the founding migrations:
// claims from paid Meta traffic keep source 'meta_ads'; everything else as before.
const migrations = [
  "migrations/20261101090000_founding_vendor_beta.sql",
  "migrations/20261103090000_founding_200_and_reminders.sql",
  "migrations/20261104090000_founding_scheduled_sends.sql",
  "migrations/20261105090000_founding_referrals.sql",
  "migrations/20261108090000_founding_meta_ads_source.sql",
].map(readMigration);

it("records meta_ads as a claim source and still rejects unknown sources", { timeout: 60_000 }, async () => {
  const { db, as, err, A, B } = await setupDb(migrations);
  const sourceOf = async (id: string) => (await db.query("select source from public.beta_applications where id=$1", [id])).rows[0].source;

  const ra = await as(A, () => db.query("select * from public.claim_founding_vendor_place(null, 'meta_ads', null)"));
  expect(await sourceOf(ra.rows[0].application_id)).toBe("meta_ads");

  // Unknown sources still fall back to 'direct' in the function and are refused by the column check.
  const rb = await as(B, () => db.query("select * from public.claim_founding_vendor_place(null, 'tiktok_ads', null)"));
  expect(await sourceOf(rb.rows[0].application_id)).toBe("direct");
  expect(await err(db.query("update public.beta_applications set source = 'tiktok_ads'"))).toMatch(/beta_applications_source_check/);

  // Anonymous callers still can't claim.
  expect(await err(as("anon", () => db.query("select * from public.claim_founding_vendor_place(null, 'meta_ads', null)")))).toMatch(/permission denied|Log in/);
});
