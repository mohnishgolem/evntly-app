import { expect, it } from "vitest";
import { readMigration, setupDb, sha } from "./supabase-stub";

// 20261104090000_founding_scheduled_sends on top of the earlier founding
// migrations: booking invitations/reminders for later, and cancelling them.
const migrations = [
  "migrations/20261101090000_founding_vendor_beta.sql",
  "migrations/20261103090000_founding_200_and_reminders.sql",
  "migrations/20261104090000_founding_scheduled_sends.sql",
].map(readMigration);

it("records scheduled sends, blocks duplicates, and cancels cleanly", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN, A } = await setupDb(migrations);
  const results: [boolean, string][] = [];
  const ok = (cond: boolean, name: string) => results.push([!!cond, name]);

  await db.exec(`insert into public.vendor_waitlist (email, first_name, invite_consent, consent_at) values
    ('dan@decor.com.au', 'Dan', true, now()), ('eve@events.com.au', 'Eve', true, now())`);
  const wl = Object.fromEntries((await db.query("select email_normalized, id from public.vendor_waitlist")).rows.map((r) => [r.email_normalized, r.id]));
  const at = (await db.query("select (now() + interval '15 hours') t")).rows[0].t as Date;

  const prep = await as(ADMIN, () => db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["dan@decor.com.au"], sha("d1")]));
  const inv = prep.rows[0].invitation_id;
  await as(ADMIN, () => db.query("select public.admin_record_beta_invitation($1, true, 're_s1', null, $2)", [inv, at]));
  let row = (await db.query("select status, delivery_status, scheduled_for, first_sent_at, last_sent_at, send_count from public.beta_invitations where id=$1", [inv])).rows[0];
  ok(row.status === "sent" && row.delivery_status === "scheduled" && row.send_count === 1, "booked send is recorded as scheduled");
  ok(+row.scheduled_for === +at && +row.first_sent_at === +at && +row.last_sent_at === +at, "send times use the scheduled time");

  ok(/24 hours/i.test(await err(as(ADMIN, () => db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["dan@decor.com.au"], sha("d2")])))), "can't book the same contact twice");
  ok(/30 days/i.test(await err(as(ADMIN, () => db.query("select public.admin_record_beta_invitation($1, true, 're_x', null, now() + interval '40 days')", [inv])))), "scheduled time must be within 30 days");
  ok(!!(await as(A, () => err(db.query("select public.admin_cancel_beta_send($1)", [inv])))), "non-admins can't cancel");
  ok(!!(await as("anon", () => err(db.query("select public.admin_cancel_beta_send($1)", [inv])))), "anon can't cancel");

  ok((await as(ADMIN, () => db.query("select public.admin_cancel_beta_send($1) r", [inv]))).rows[0].r === "cancelled", "admin cancels a scheduled send");
  row = (await db.query("select status, delivery_status, scheduled_for, first_sent_at, send_count, last_error from public.beta_invitations where id=$1", [inv])).rows[0];
  ok(row.status === "failed" && row.delivery_status === null && row.scheduled_for === null && row.first_sent_at === null && row.send_count === 0, "cancel resets the booking");
  ok((await db.query("select count(*)::int n from public.admin_audit_log where action='beta_send_cancelled'")).rows[0].n === 1, "cancel is audit-logged");
  ok((await as("anon", () => db.query("select * from public.beta_invite_lookup($1)", [sha("d1")]))).rows[0].state === "invalid", "a cancelled email's link doesn't work");

  const again = await as(ADMIN, () => db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["dan@decor.com.au"], sha("d3")]));
  ok(again.rows[0]?.send_number === 1, "a cancelled contact can be scheduled again");
  await as(ADMIN, () => db.query("select public.admin_record_beta_invitation($1, true, 're_s2', null, null)", [inv]));
  row = (await db.query("select delivery_status, scheduled_for from public.beta_invitations where id=$1", [inv])).rows[0];
  ok(row.delivery_status === "sent" && row.scheduled_for === null, "an immediate send still records as sent");
  ok(/haven't gone out/i.test(await err(as(ADMIN, () => db.query("select public.admin_cancel_beta_send($1)", [inv])))), "sent emails can't be 'cancelled'");

  // A booked email whose time has passed can't be cancelled either.
  const p2 = await as(ADMIN, () => db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["eve@events.com.au"], sha("e1")]));
  await as(ADMIN, () => db.query("select public.admin_record_beta_invitation($1, true, 're_s3', null, now() + interval '1 hour')", [p2.rows[0].invitation_id]));
  await db.exec(`update public.beta_invitations set scheduled_for = now() - interval '1 minute' where id = '${p2.rows[0].invitation_id}'`);
  ok(/haven't gone out/i.test(await err(as(ADMIN, () => db.query("select public.admin_cancel_beta_send($1)", [p2.rows[0].invitation_id])))), "past booking times can't be cancelled");

  // Scheduled reminders: recorded and cancellable.
  await db.exec(`update public.beta_invitations set scheduled_for = null, delivery_status = 'delivered', first_sent_at = now() - interval '4 days', last_sent_at = now() - interval '4 days', last_attempt_at = now() - interval '4 days' where id = '${p2.rows[0].invitation_id}'`);
  const r = await as(ADMIN, () => db.query("select * from public.admin_prepare_beta_reminder($1,$2)", [wl["eve@events.com.au"], sha("e2")]));
  await as(ADMIN, () => db.query("select public.admin_record_beta_reminder($1, true, 're_r1', null, now() + interval '2 days')", [r.rows[0].invitation_id]));
  row = (await db.query("select delivery_status, reminder_sent_at, scheduled_for from public.beta_invitations where id=$1", [r.rows[0].invitation_id])).rows[0];
  ok(row.delivery_status === "scheduled" && +row.reminder_sent_at === +row.scheduled_for, "reminders can be scheduled");
  await as(ADMIN, () => db.query("select public.admin_cancel_beta_send($1)", [r.rows[0].invitation_id]));
  row = (await db.query("select status, reminder_sent_at, first_sent_at from public.beta_invitations where id=$1", [r.rows[0].invitation_id])).rows[0];
  ok(row.status === "failed" && row.reminder_sent_at === null && row.first_sent_at !== null, "cancelling a reminder keeps the original invitation and frees the reminder");
  ok(!!(await as(ADMIN, () => db.query("select * from public.admin_prepare_beta_reminder($1,$2)", [wl["eve@events.com.au"], sha("e3")]))).rows[0], "the reminder can be booked again");

  ok(/check constraint|violates/i.test(await err(db.query("update public.beta_invitations set delivery_status = 'bogus'"))), "delivery status is still constrained");

  for (const [passed, name] of results) expect.soft(passed, name).toBe(true);
  expect(results.length).toBeGreaterThan(15);
});
