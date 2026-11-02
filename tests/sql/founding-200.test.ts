import { expect, it } from "vitest";
import { readMigration, setupDb, sha } from "./supabase-stub";

// 20261103090000_founding_200_and_reminders on top of the original founding
// beta migration: capacity 200, no invitations to registered vendors, and
// one manual reminder per invitation after 3+ days.
const base = readMigration("migrations/20261101090000_founding_vendor_beta.sql");
const next = readMigration("migrations/20261103090000_founding_200_and_reminders.sql");

it("raises capacity to 200 but leaves a hand-set capacity alone", { timeout: 60_000 }, async () => {
  const fresh = await setupDb([base, next]);
  expect((await fresh.db.query("select * from public.founding_vendor_places()")).rows[0]).toEqual({ capacity: 200, approved: 0, remaining: 200 });

  const custom = await setupDb([base]);
  await custom.db.exec("update public.beta_program set capacity = 35 where id = 1");
  await custom.db.exec(next);
  expect((await custom.db.query("select capacity from public.beta_program")).rows[0].capacity).toBe(35);
});

it("invitations skip registered vendors; reminders follow the rules", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN, A } = await setupDb([base, next]);
  const results: [boolean, string][] = [];
  const ok = (cond: boolean, name: string) => results.push([!!cond, name]);

  await db.exec(`
    insert into public.vendor_waitlist (email, first_name, invite_consent, consent_at) values
      ('alice@photo.com.au', 'Alice', true, now()),
      ('dan@decor.com.au', 'Dan', true, now()),
      ('eve@events.com.au', 'Eve', true, now()),
      ('fay@flowers.com.au', 'Fay', true, now());
    insert into public.service_providers (owner_user_id, name) values ('${A}', 'Alice Photo');
  `);
  const wl = Object.fromEntries((await db.query("select email_normalized, id from public.vendor_waitlist")).rows.map((r) => [r.email_normalized, r.id]));
  const invite = (email: string, token: string) => as(ADMIN, () => db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl[email], sha(token)]));
  const remind = (email: string, token: string) => as(ADMIN, () => db.query("select * from public.admin_prepare_beta_reminder($1,$2)", [wl[email], sha(token)]));

  ok(/registered vendor/i.test(await err(invite("alice@photo.com.au", "a1"))), "won't invite someone who already has a vendor listing");

  for (const [email, token] of [["dan@decor.com.au", "d1"], ["eve@events.com.au", "e1"], ["fay@flowers.com.au", "f1"]]) {
    const r = await invite(email, token);
    await as(ADMIN, () => db.query("select public.admin_record_beta_invitation($1, true, 're_' || $2, null)", [r.rows[0].invitation_id, token]));
  }

  ok(/too soon/i.test(await err(remind("dan@decor.com.au", "d2"))), "no reminder within 3 days");
  ok(/registered vendor/i.test(await err(remind("alice@photo.com.au", "a2"))), "no reminders to registered vendors either");

  // Age the invitations to 4 days.
  await db.exec("update public.beta_invitations set first_sent_at = now() - interval '4 days', last_sent_at = now() - interval '4 days', last_attempt_at = now() - interval '4 days'");
  await db.exec(`update public.beta_invitations set delivery_status = 'bounced' where waitlist_id = '${wl["fay@flowers.com.au"]}'`);

  ok(!!(await as(A, () => err(db.query("select * from public.admin_prepare_beta_reminder($1,$2)", [wl["dan@decor.com.au"], sha("x")])))), "non-admins can't send reminders");
  ok(!!(await as("anon", () => err(db.query("select * from public.admin_prepare_beta_reminder($1,$2)", [wl["dan@decor.com.au"], sha("x")])))), "anon can't send reminders");
  ok(!!(await as(A, () => err(db.query("select public.beta_contact_is_registered_vendor('x@y.z')")))), "the registered-vendor helper isn't callable by users");

  const r = await remind("dan@decor.com.au", "d2");
  ok(r.rows[0]?.email === "dan@decor.com.au" && r.rows[0].send_number === 2, "reminder prepared after 3+ days");
  let row = (await db.query("select status, token_hash, reminder_attempted_at from public.beta_invitations where id=$1", [r.rows[0].invitation_id])).rows[0];
  ok(row.status === "sending" && row.token_hash === sha("d2") && !!row.reminder_attempted_at, "reminder rotates to a fresh link");
  ok((await as("anon", () => db.query("select * from public.beta_invite_lookup($1)", [sha("d1")]))).rows[0].state === "invalid", "the old link stops working");
  ok(/already being sent|in progress/i.test(await err(remind("dan@decor.com.au", "d3"))), "no second reminder while one is in flight");

  await as(ADMIN, () => db.query("select public.admin_record_beta_reminder($1, true, 're_rem', null)", [r.rows[0].invitation_id]));
  row = (await db.query("select status, send_count, reminder_sent_at, resend_email_id from public.beta_invitations where id=$1", [r.rows[0].invitation_id])).rows[0];
  ok(row.status === "sent" && row.send_count === 2 && !!row.reminder_sent_at && row.resend_email_id === "re_rem", "reminder recorded");
  ok((await as("anon", () => db.query("select * from public.beta_invite_lookup($1)", [sha("d2")]))).rows[0].state === "valid", "the reminder's link works");
  ok(/already sent/i.test(await err(remind("dan@decor.com.au", "d4"))), "only one reminder per invitation");
  ok(/bounced/i.test(await err(remind("fay@flowers.com.au", "f2"))), "no reminder after a bounce");

  // A failed reminder can be retried.
  const e = await remind("eve@events.com.au", "e2");
  await as(ADMIN, () => db.query("select public.admin_record_beta_reminder($1, false, null, 'rate_limit_exceeded')", [e.rows[0].invitation_id]));
  await db.exec("update public.beta_invitations set reminder_attempted_at = now() - interval '1 hour' where reminder_sent_at is null");
  const e2 = await remind("eve@events.com.au", "e3");
  ok(e2.rows[0]?.email === "eve@events.com.au", "a failed reminder can be retried");

  // Claimed invitations get no reminder.
  await db.exec(`update public.beta_invitations set status = 'claimed' where waitlist_id = '${wl["eve@events.com.au"]}'`);
  ok(/claimed/i.test(await err(remind("eve@events.com.au", "e4"))), "no reminder once claimed");

  // Reminders count towards the daily limit.
  await as(ADMIN, () => db.query("select public.admin_set_beta_program(200, 14, 3, 10)"));
  await db.exec("update public.beta_invitations set last_attempt_at = now() - interval '4 days'");
  await db.exec(`insert into public.vendor_waitlist (email, first_name, invite_consent) values ('gus@dj.com.au', 'Gus', true)`);
  const gus = (await db.query("select id from public.vendor_waitlist where email = 'gus@dj.com.au'")).rows[0].id;
  // Three reminder attempts in the last 24 hours fill the limit of 3.
  await db.exec("update public.beta_invitations set reminder_attempted_at = now()");
  ok(/daily limit/i.test(await err(as(ADMIN, () => db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [gus, sha("g1")])))), "reminders count towards the daily limit");

  for (const [passed, name] of results) expect.soft(passed, name).toBe(true);
  expect(results.length).toBeGreaterThan(15);
});
