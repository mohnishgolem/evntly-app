import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261106090000_vendor_acquisition on top of the founding migrations.
const migrations = [
  "migrations/20261101090000_founding_vendor_beta.sql",
  "migrations/20261103090000_founding_200_and_reminders.sql",
  "migrations/20261104090000_founding_scheduled_sends.sql",
  "migrations/20261105090000_founding_referrals.sql",
  "migrations/20261106090000_vendor_acquisition.sql",
].map(readMigration);

it("prospect pipeline: admin-only, consent before contact, one follow-up, permanent do-not-contact", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN, A } = await setupDb(migrations);
  const results: [boolean, string][] = [];
  const ok = (cond: boolean, name: string) => results.push([!!cond, name]);
  const act = (id: string, action: string, note: string | null = null) =>
    as(ADMIN, () => db.query("select public.admin_prospect_action($1, $2, $3) s", [id, action, note]));
  const actErr = (id: string, action: string) => as(ADMIN, () => err(db.query("select public.admin_prospect_action($1, $2)", [id, action])));

  await db.exec(`insert into public.vendor_waitlist (email, first_name, invite_consent) values ('dana@decor.com.au', 'Dana', true)`);
  await db.exec(`insert into public.service_providers (owner_user_id, name) values ('${A}', 'Alice Photo')`);

  const rows = [
    { business_name: "Fave Events", email: "Hello@FaveEvents.com.au", category: "dj", consent_basis: "published_business_address", lead_quality: "A" },
    { business_name: "Balloon Crew", instagram: "@the_balloon_crew" },
    { business_name: "fave events ", email: "other@fave.com.au" }, // same name, in file
    { business_name: "Dana Decor", email: "dana@decor.com.au" }, // on the waitlist
    { business_name: "Bob DJ", email: "bob@dj.com.au" }, // has an account
    { business_name: "Alice Photo" }, // has a listing
    { business_name: "", email: "x@y.com" },
    { business_name: "Bad Email", email: "not-an-email" },
    { business_name: "Bad Consent", consent_basis: "bought_list" },
  ];
  const check = (await as(ADMIN, () => db.query("select * from public.admin_import_prospects($1::jsonb, false)", [JSON.stringify(rows)]))).rows;
  ok(
    JSON.stringify(check.map((r) => r.verdict)) ===
      JSON.stringify(["new", "new", "duplicate_in_file", "on_waitlist", "has_account", "has_listing", "invalid", "invalid", "invalid"]),
    "check reports a verdict per row",
  );
  ok((await db.query("select count(*)::int n from public.vendor_prospects")).rows[0].n === 0, "check writes nothing");

  await as(ADMIN, () => db.query("select * from public.admin_import_prospects($1::jsonb, true)", [JSON.stringify(rows)]));
  ok((await db.query("select count(*)::int n from public.vendor_prospects")).rows[0].n === 2, "import inserts only new rows");
  const again = (await as(ADMIN, () => db.query("select * from public.admin_import_prospects($1::jsonb, true)", [JSON.stringify(rows.slice(0, 2))]))).rows;
  ok(again.every((r) => r.verdict === "already_prospect"), "re-importing finds the existing prospects");

  // Access.
  ok(!!(await as(A, () => err(db.query("select * from public.admin_import_prospects('[]'::jsonb, false)")))), "vendors can't import");
  ok(!!(await as(ADMIN, () => err(db.query("select * from public.admin_import_prospects('[]'::jsonb, false)")), { aal: "aal1" })), "admins without MFA can't import");
  ok((await as(A, () => db.query("select count(*)::int n from public.vendor_prospects"))).rows[0].n === 0, "vendors see no prospects");
  ok(!!(await as("anon", () => err(db.query("select count(*) from public.vendor_prospects")))), "anon can't read prospects");
  ok(!!(await as(ADMIN, () => err(db.query("update public.vendor_prospects set stage = 'contacted'")))), "no direct writes, even for admins");

  const fave = (await db.query("select id, email from public.vendor_prospects where business_name = 'Fave Events'")).rows[0];
  const crew = (await db.query("select id from public.vendor_prospects where business_name = 'Balloon Crew'")).rows[0].id;
  ok(fave.email === "hello@faveevents.com.au", "emails are stored lowercased");
  ok(!!(await as(A, () => err(db.query("select public.admin_prospect_action($1, 'verify')", [fave.id])))), "vendors can't move prospects");

  // Stages in order; consent required before contact.
  ok(/Verify the prospect first/.test(await actErr(fave.id, "eligible")), "can't skip verification");
  await act(fave.id, "verify");
  await act(crew, "verify");
  ok(/consent basis/.test(await actErr(crew, "eligible")), "no consent basis, not contact-eligible");
  await as(ADMIN, () => db.query("select public.admin_set_prospect_consent($1, 'verbal', 'Said yes on a call 3 Nov')", [crew]));
  ok((await act(crew, "eligible")).rows[0].s === "contact_eligible", "eligible once consent is recorded");
  ok(/approve the outreach/i.test(await actErr(fave.id, "contacted")), "can't record contact before approval");
  await act(fave.id, "eligible");
  await act(fave.id, "approve_outreach");
  ok(/only be changed before/.test(await as(ADMIN, () => err(db.query("select public.admin_set_prospect_consent($1, 'none')", [fave.id])))), "consent locked after approval");
  await act(fave.id, "contacted");
  const afterContact = (await db.query("select stage, contacted_at, next_follow_up_at from public.vendor_prospects where id=$1", [fave.id])).rows[0];
  ok(afterContact.stage === "contacted" && !!afterContact.next_follow_up_at, "contact recorded with a follow-up date");

  // One follow-up, at least 7 days later.
  ok(/7 days/.test(await actErr(fave.id, "follow_up_sent")), "no follow-up within 7 days");
  await db.exec(`update public.vendor_prospects set contacted_at = now() - interval '8 days' where id = '${fave.id}'`);
  await act(fave.id, "follow_up_sent");
  ok(/One follow-up has already been sent/.test(await actErr(fave.id, "follow_up_sent")), "only one follow-up");
  ok(!!(await err(db.query("update public.vendor_prospects set follow_up_count = 2 where id = $1", [fave.id]))), "follow-up count capped by a constraint");

  // Interested, then declined → permanent do-not-contact.
  ok((await act(fave.id, "interested")).rows[0].s === "interested", "interested");
  await act(fave.id, "declined", "Said no thanks by email");
  const dnc = (await db.query("select do_not_contact, do_not_contact_reason from public.vendor_prospects where id=$1", [fave.id])).rows[0];
  ok(dnc.do_not_contact && dnc.do_not_contact_reason === "Said no thanks by email", "declined → do-not-contact with reason");
  ok(/can't be undone/.test(await actErr(fave.id, "interested")), "do-not-contact can't be moved again");
  ok(/do-not-contact/.test(await as(ADMIN, () => err(db.query("select public.admin_set_prospect_consent($1, 'verbal')", [fave.id])))), "or have consent re-added");
  ok(/Unknown action/.test(await actErr(crew, "send_email")), "unknown actions rejected");

  // Unsubscribed addresses can't become eligible.
  await db.exec(`insert into public.vendor_waitlist (email, invite_consent, unsubscribed_at) values ('gone@x.com.au', false, now())`);
  await db.exec(`delete from public.vendor_waitlist where email = 'gone@x.com.au'`);
  await as(ADMIN, () => db.query("select * from public.admin_import_prospects($1::jsonb, true)", [JSON.stringify([{ business_name: "Gone Co", email: "gone2@x.com.au", consent_basis: "published_business_address" }])]));
  await db.exec(`insert into public.vendor_waitlist (email, invite_consent, unsubscribed_at) values ('gone2@x.com.au', false, now())`);
  const gone = (await db.query("select id from public.vendor_prospects where business_name = 'Gone Co'")).rows[0].id;
  await act(gone, "verify");
  ok(/unsubscribed/.test(await actErr(gone, "eligible")), "unsubscribed addresses can't become eligible");

  const events = (await db.query("select count(*)::int n from public.vendor_prospect_events where prospect_id=$1", [fave.id])).rows[0].n;
  ok(events >= 7, "every step is logged");

  for (const [passed, name] of results) expect.soft(passed, name).toBe(true);
  expect(results.length).toBeGreaterThan(25);
});
