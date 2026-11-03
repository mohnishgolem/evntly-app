import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261105090000_founding_referrals on top of the earlier founding migrations.
const migrations = [
  "migrations/20261101090000_founding_vendor_beta.sql",
  "migrations/20261103090000_founding_200_and_reminders.sql",
  "migrations/20261104090000_founding_scheduled_sends.sql",
  "migrations/20261105090000_founding_referrals.sql",
].map(readMigration);

it("referral codes: approved vendors only, first touch, no self-referral, spotlight tracked", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN, A, B, C } = await setupDb(migrations);
  const results: [boolean, string][] = [];
  const ok = (cond: boolean, name: string) => results.push([!!cond, name]);

  // A is an approved founding vendor with a listing.
  await as(A, () => db.query("select * from public.claim_founding_vendor_place(null, 'direct', null)"));
  await as(A, () => db.query("insert into public.service_providers (owner_user_id, name) values ($1, 'Alice Photo')", [A]));
  const appA = (await db.query("select id from public.beta_applications where user_id=$1", [A])).rows[0].id;

  ok(/approved Founding Vendors/i.test(await as(A, () => err(db.query("select public.my_referral_code()")))), "no code before approval");
  await as(ADMIN, () => db.query("select public.admin_decide_founding_application($1,'approved')", [appA]));

  const code = (await as(A, () => db.query("select public.my_referral_code() c"))).rows[0].c as string;
  ok(/^[a-z0-9]{10}$/.test(code), "approved vendor gets a 10-character code");
  ok((await as(A, () => db.query("select public.my_referral_code() c"))).rows[0].c === code, "the same code every time");
  ok(!!(await as("anon", () => err(db.query("select public.my_referral_code()")))), "anon can't get a code");

  // B claims through A's link.
  const rb = await as(B, () => db.query("select * from public.claim_founding_vendor_place(null, 'instagram_bio', $1)", [code]));
  let rowB = (await db.query("select source, referred_by from public.beta_applications where id=$1", [rb.rows[0].application_id])).rows[0];
  ok(rowB.source === "referral" && rowB.referred_by === appA, "a claim through the link records the referrer and source 'referral'");

  // Claiming again with a different code doesn't change the referrer.
  await as(B, () => db.query("select * from public.claim_founding_vendor_place(null, 'direct', 'zzzzzzzzzz')"));
  rowB = (await db.query("select referred_by from public.beta_applications where id=$1", [rb.rows[0].application_id])).rows[0];
  ok(rowB.referred_by === appA, "first touch only");

  // A can't refer themselves (their application already exists; also blocked by the RPC).
  await db.exec("update public.beta_applications set referred_by = null where user_id = '" + A + "'");
  ok(!!(await err(db.query("update public.beta_applications set referred_by = id where user_id = $1", [A]))), "self-referral is blocked by a constraint");

  // A code from someone who isn't approved doesn't count.
  await db.exec(`update public.beta_applications set referral_code = 'notapproved1' where user_id = '${B}'`);
  const rc = await as(C, () => db.query("select * from public.claim_founding_vendor_place(null, 'direct', 'notapproved1')"));
  const rowC = (await db.query("select source, referred_by from public.beta_applications where id=$1", [rc.rows[0].application_id])).rows[0];
  ok(rowC.referred_by === null && rowC.source === "direct", "codes from non-approved vendors are ignored");

  ok((await as(B, () => db.query("select * from public.claim_founding_vendor_place(null, 'direct', 'BAD CODE!')"))).rows.length === 1, "malformed codes are ignored, not errors");

  // Stats: counts only.
  const stats = (await as(A, () => db.query("select * from public.my_referral_stats()"))).rows[0];
  ok(stats.referral_code === code && stats.joined === 1 && stats.approved === 0, "referrer sees counts");
  await as(B, () => db.query("insert into public.service_providers (owner_user_id, name) values ($1, 'Bob DJ')", [B]));
  await as(ADMIN, () => db.query("select public.admin_decide_founding_application($1,'approved')", [rb.rows[0].application_id]));
  const stats2 = (await as(A, () => db.query("select * from public.my_referral_stats()"))).rows[0];
  ok(stats2.submitted === 1 && stats2.approved === 1, "approved referrals counted");
  ok((await as(B, () => db.query("select count(*)::int n from public.beta_applications"))).rows[0].n === 1, "vendors still only see their own application");

  // Spotlight tracking: admin only, audit-logged.
  ok(!!(await as(A, () => err(db.query("select public.admin_set_referral_spotlight($1, true)", [appA])))), "vendors can't mark spotlights");
  await as(ADMIN, () => db.query("select public.admin_set_referral_spotlight($1, true)", [appA]));
  ok(!!(await db.query("select spotlight_posted_at from public.beta_applications where id=$1", [appA])).rows[0].spotlight_posted_at, "admin marks spotlight posted");
  ok((await db.query("select count(*)::int n from public.admin_audit_log where action='referral_spotlight'")).rows[0].n === 1, "spotlight change is audit-logged");
  await as(ADMIN, () => db.query("select public.admin_set_referral_spotlight($1, false)", [appA]));
  ok((await db.query("select spotlight_posted_at from public.beta_applications where id=$1", [appA])).rows[0].spotlight_posted_at === null, "and can undo it");

  // Invite still wins over referral for source.
  await db.exec(`insert into public.vendor_waitlist (email, first_name, invite_consent) values ('carol@flowers.com.au', 'Carol', true)`);
  ok(!!(await err(db.query("update public.beta_applications set source = 'tiktok'"))), "source is still constrained");

  for (const [passed, name] of results) expect.soft(passed, name).toBe(true);
  expect(results.length).toBeGreaterThan(14);
});
