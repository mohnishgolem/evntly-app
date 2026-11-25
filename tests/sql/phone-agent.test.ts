import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";
import { phoneMigrations, SAI as SAI_NUMBER, setClock, svc, VENDOR, WED_11AM } from "./phone-agent-db";

// 20261202090000_phone_agent, offline in PGlite. Never against production.
const SAI = SAI_NUMBER;

it("calling rules: off by default, prototype allow-list, consent + DNCR + hours for pilot", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN, A } = await setupDb(phoneMigrations);
  await db.exec(setClock(WED_11AM));
  const blockers = async (prospect: string | null, phone: string) =>
    (await as(ADMIN, () => db.query("select public.admin_phone_call_blockers($1, $2) b", [prospect, phone]))).rows[0].b as string[];
  const settings = (p: object) => as(ADMIN, () => db.query("select public.admin_phone_update_settings($1::jsonb)", [JSON.stringify(p)]));

  expect(await blockers(null, SAI)).toContain("Calling is switched off.");
  expect(await as(A, () => err(db.query("select public.admin_phone_call_blockers(null, $1)", [SAI])))).toMatch(/Not authorized/);
  expect(await as(A, () => err(db.query(`select public.admin_phone_update_settings('{"mode":"pilot"}'::jsonb)`)))).toMatch(/Not authorized/);
  expect(await as(ADMIN, () => err(db.exec(`update public.phone_agent_settings set mode = 'pilot'`)))).toMatch(/permission denied/);

  // Prototype: only Sai's number.
  await settings({ mode: "prototype", prototype_numbers: [SAI] });
  expect(await blockers(null, SAI)).toEqual([]);
  expect(await blockers(null, VENDOR)).toContain("Prototype calls can only go to the approved prototype numbers.");
  expect(await blockers(null, "0400 000 001")).toContain("Not a valid Australian phone number (+61…).");

  // Hours: Sunday, a national public holiday, Saturday 6pm, weekday 8:30am, weekday 6pm (legal, outside ours).
  for (const [iso, why] of [
    ["2026-12-06T11:00:00+11:00", /legal calling hours/],
    ["2026-12-25T11:00:00+11:00", /legal calling hours/],
    ["2026-12-05T18:00:00+11:00", /legal calling hours/],
    ["2026-12-02T08:30:00+11:00", /legal calling hours/],
    ["2026-12-02T18:00:00+11:00", /our calling window/],
  ] as const) {
    await db.exec(setClock(iso));
    expect((await blockers(null, SAI)).join(" ")).toMatch(why);
  }
  await db.exec(setClock(WED_11AM));
  expect(await settings({ call_start: "08:00" }).catch((e) => e.message)).toMatch(/inside 9am–8pm/);

  // Recording needs a legal-review note.
  expect(await settings({ recording_enabled: true }).catch((e) => e.message)).toMatch(/recording_reviewed/);

  // Start a prototype call; the agent's actions are bound to that call.
  const call = (await as(ADMIN, () => db.query("select * from public.admin_phone_start_call(null, $1)", [SAI]))).rows[0];
  expect(call.mode).toBe("prototype");
  expect(await as(ADMIN, () => err(db.query("select * from public.admin_phone_start_call(null, $1)", [SAI])))).toMatch(/already in progress/);
  const tool = (name: string, args: object, providerId = "prov_1") =>
    svc(db, "select public.phone_agent_tool($1, $2, $3, $4::jsonb) r", [call.ref, providerId, name, JSON.stringify(args)]);
  expect(await as(ADMIN, () => err(db.query("select public.phone_agent_tool($1, 'p', 'opt_out', '{}')", [call.ref])))).toMatch(/permission denied/);
  expect(await as("anon", () => err(db.query("select public.phone_agent_tool($1, 'p', 'opt_out', '{}')", [call.ref])))).toMatch(/permission denied/);
  await tool("record_outcome", { outcome: "interested", interest: "high" });
  expect(await err(tool("record_outcome", { outcome: "interested" }, "someone_else"))).toMatch(/mismatch/);
  expect(await err(tool("send_registration_link", { channel: "sms" }))).toMatch(/permission/);
  expect(await err(tool("drop_table", {}))).toMatch(/Unknown tool/);
  // Prototype opt-out (Sai testing on his own phone) is recorded, not a permanent block on his number.
  await tool("opt_out", {});
  expect((await db.query("select count(*)::int n from public.phone_suppression")).rows[0].n).toBe(0);
  expect((await db.query("select outcome from public.phone_calls where id = $1", [call.call_id])).rows[0].outcome).toBe("opted_out");
  // While it's still in progress, no other call can start (one at a time, budget held).
  expect((await blockers(null, "+61400000009")).join(" ")).toMatch(/Another call is in progress|prototype numbers/);
  await svc(db, "select public.phone_agent_call_event($1, 'prov_1', 'call_ended', $2::jsonb)", [call.ref, JSON.stringify({ duration_seconds: 40, cost_usd_cents: 12, latency_p50_ms: 820 })]);
  expect((await db.query("select latency_p50_ms from public.phone_calls where id = $1", [call.call_id])).rows[0].latency_p50_ms).toBe(820);

  // Pilot: a real prospect needs express consent, a DNCR check and to not be registered.
  await settings({ mode: "pilot" });
  await as(ADMIN, () => db.query(`select * from public.admin_import_prospects($1::jsonb, true)`, [
    JSON.stringify([{ business_name: "Harbour Lens", category: "photographer", phone: "0411 222 333", consent_basis: "published_business_address" }])
  ]));
  const harbour = (await db.query("select id from public.vendor_prospects where business_name = 'Harbour Lens'")).rows[0].id;
  let b = (await blockers(harbour, VENDOR)).join(" ");
  expect(b).toMatch(/No current express consent/);
  expect(b).toMatch(/Do Not Call Register/);
  expect(await as(ADMIN, () => err(db.query("select public.admin_phone_record_consent($1, $2, 'published_business_address', 'Number on their website')", [harbour, VENDOR]))))
    .toMatch(/A published number is not consent/);
  await as(ADMIN, () => db.query("select public.admin_phone_record_consent($1, $2, 'express_dm_reply', $3)", [harbour, VENDOR, 'IG DM 1 Dec: "yes happy for your assistant to call me"']));
  await as(ADMIN, () => db.query("select public.admin_phone_record_dncr($1, false, 'quick_check', 'QC-123')", [VENDOR]));
  expect(await blockers(harbour, VENDOR)).toEqual([]);

  // DNCR check older than 30 days doesn't count; consent older than 3 months has expired.
  await db.exec(setClock("2027-01-06T11:00:00+11:00"));
  b = (await blockers(harbour, VENDOR)).join(" ");
  expect(b).toMatch(/Do Not Call Register/);
  expect(b).not.toMatch(/express consent/);
  await db.exec(setClock("2027-03-03T11:00:00+11:00"));
  expect((await blockers(harbour, VENDOR)).join(" ")).toMatch(/express consent/);
  await db.exec(setClock(WED_11AM));

  // Already an Evntly vendor (bob@dj.com.au has an account).
  // (The importer skips people with accounts; this one signed up after being imported.)
  const bob = (await db.query("insert into public.vendor_prospects (business_name, email) values ('Bob DJ Co', 'bob@dj.com.au') returning id")).rows[0].id;
  expect((await blockers(bob, "+61422000111")).join(" ")).toMatch(/Already has an Evntly account/);

  // Registered on the DNCR → permanently suppressed.
  await as(ADMIN, () => db.query("select public.admin_phone_record_dncr('+61499888777', true, 'quick_check')"));
  expect((await blockers(harbour, "+61499888777")).join(" ")).toMatch(/permanent do-not-call/);

  // Pilot call ends → outreach tracker + spend + growth dashboard.
  const pc = (await as(ADMIN, () => db.query("select * from public.admin_phone_start_call($1, $2)", [harbour, VENDOR]))).rows[0];
  expect(pc).toMatchObject({ mode: "pilot", vendor_name: "Harbour Lens", category: "photographer" });
  const ev = (event: string, payload: object) =>
    svc(db, "select public.phone_agent_call_event($1, 'prov_2', $2, $3::jsonb)", [pc.ref, event, JSON.stringify(payload)]);
  await ev("call_started", { start_timestamp: Date.parse(WED_11AM) });
  await svc(db, "select public.phone_agent_tool($1, 'prov_2', 'send_registration_link', $2::jsonb)",
    [pc.ref, JSON.stringify({ channel: "email", email: "Hi@HarbourLens.com.au", consent_confirmed: true, consent_quote: "yeah email it to me" })]);
  await ev("call_ended", { duration_seconds: 184, disconnection_reason: "user_hangup", cost_usd_cents: 52, summary: "Keen photographer.", transcript: "secret words" });
  await ev("call_ended", { duration_seconds: 184, cost_usd_cents: 52 }); // retried webhook: counted once
  const row = (await db.query("select * from public.phone_calls where id = $1", [pc.call_id])).rows[0];
  expect(row).toMatchObject({ status: "ended", outcome: "link_sent", link_channel: "email", link_to: "hi@harbourlens.com.au", duration_seconds: 184, cost_aud_cents: 81, transcript: null });
  const prospect = (await db.query("select stage, email, contacted_at, replied_at from public.vendor_prospects where id = $1", [harbour])).rows[0];
  expect(prospect.stage).toBe("interested");
  expect(prospect.email).toBe("hi@harbourlens.com.au");
  expect(prospect.contacted_at && prospect.replied_at).toBeTruthy();
  const spend = (await db.query("select count(*)::int n, sum(amount_cents)::int c from public.acquisition_spend where channel = 'ai_phone'")).rows[0];
  expect(spend).toEqual({ n: 2, c: 100 }); // prototype call (19c) + pilot call (81c)
  // The growth dashboard counts prospect events by real day; the call ended "now".
  const today = (await as(ADMIN, () => db.query("select * from public.admin_growth_daily(1)"))).rows[0];
  expect(today).toMatchObject({ vendors_contacted: 1, replies: 1 });
  expect(Number(today.spend_cents)).toBe(100);

  // Registration resulting from the call: account with the emailed address after the call.
  const NEWV = "00000000-0000-0000-0000-0000000000e1";
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'hi@harbourlens.com.au', now())", [NEWV]);
  await db.query("insert into public.users (id, email, role, created_at) values ($1, 'hi@harbourlens.com.au', 'vendor', now() + interval '1 hour')", [NEWV]);
  const sp = (await db.query(`insert into public.service_providers (owner_user_id, name, status) values ($1, 'Harbour Lens', 'approved') returning id`, [NEWV])).rows[0].id;
  await db.query("insert into public.portfolio_items (provider_id) values ($1), ($1), ($1)", [sp]);
  await db.query("insert into public.vendor_packages (provider_id) values ($1)", [sp]);
  const summary = Object.fromEntries((await as(ADMIN, () => db.query("select * from public.admin_phone_agent_summary()"))).rows.map((r) => [r.measure, Number(r.value)]));
  expect(summary).toMatchObject({ calls: 2, pilot_calls: 1, prototype_calls: 1, links_sent: 1, registrations: 1, listings_completed: 1, cost_aud_cents: 100 });
  expect((await as(A, () => db.query("select * from public.admin_phone_agent_summary()"))).rows).toHaveLength(0);
  expect((await as(A, () => db.query("select * from public.phone_calls"))).rows).toHaveLength(0);

  // Second attempt the same day is blocked; attempt limit holds.
  expect((await blockers(harbour, VENDOR)).join(" ")).toMatch(/Already called in the last day/);
});

it("budget holds the worst case for calls in progress; callback requests record consent", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN } = await setupDb(phoneMigrations);
  await db.exec(setClock(WED_11AM));
  await as(ADMIN, () => db.query("select public.admin_phone_update_settings($1::jsonb)", [JSON.stringify({ mode: "prototype", prototype_numbers: [SAI], budget_aud_cents: 500, max_call_cost_aud_cents: 200 })]));
  // A$4.20 already spent: another call (worst case A$2) would pass A$5.
  await db.exec(`insert into public.phone_calls (mode, phone_e164, status, cost_aud_cents) values ('prototype', '+61400000001', 'ended', 420)`);
  expect((await as(ADMIN, () => db.query("select public.admin_phone_call_blockers(null, $1) b", [SAI]))).rows[0].b.join(" ")).toMatch(/budget would be exceeded \(A\$4\.20 of A\$5\.00/);
  await as(ADMIN, () => db.query("select public.admin_phone_update_settings($1::jsonb)", [JSON.stringify({ budget_aud_cents: 700 })]));
  expect((await as(ADMIN, () => db.query("select public.admin_phone_call_blockers(null, $1) b", [SAI]))).rows[0].b).toEqual([]);

  // Website callback request: creates the prospect, the request and an express consent with the exact wording.
  const consent = "I agree to a phone call from Evntly's AI assistant about listing my business.";
  const id = (await svc(db, "select public.phone_request_callback($1,$2,$3,$4,$5,$6,'website',$7) id", [VENDOR, "Sparkle Events", "Jo", "decorator", "Jo@Sparkle.com.au", "morning", consent])).rows[0].id;
  expect(id).toBeTruthy();
  const pr = (await db.query("select id, email, phone from public.vendor_prospects where business_name = 'Sparkle Events'")).rows[0];
  expect(pr).toMatchObject({ email: "jo@sparkle.com.au", phone: VENDOR });
  const c = (await db.query("select kind, basis, evidence from public.phone_consents where prospect_id = $1", [pr.id])).rows[0];
  expect(c).toMatchObject({ kind: "call", basis: "express_web_form" });
  expect(c.evidence).toContain(consent);
  // Same number again the same day: ignored. Not callable by anon/authenticated directly.
  expect((await svc(db, "select public.phone_request_callback($1,'Sparkle Events',null,null,null,null,'website',$2) id", [VENDOR, consent])).rows[0].id).toBeNull();
  expect(await as("anon", () => err(db.query("select public.phone_request_callback($1,'x',null,null,null,null,'website',$2)", [VENDOR, consent])))).toMatch(/permission denied/);
  // Admin records an Instagram reply the same way.
  await as(ADMIN, () => db.query("select public.admin_phone_request_callback('+61422333444', 'Beat Lab DJs', 'Max', 'dj', null, 'instagram', 'IG DM 2 Dec: yes, happy for your AI assistant to call me')"));
  expect((await db.query("select basis from public.phone_consents where phone_e164 = '+61422333444'")).rows[0].basis).toBe("express_dm_reply");
  const summary = Object.fromEntries((await as(ADMIN, () => db.query("select * from public.admin_phone_agent_summary()"))).rows.map((r) => [r.measure, Number(r.value)]));
  expect(summary).toMatchObject({ call_requests: 2, call_requests_open: 2 });
});

it("browser test calls: prototype mode only, one row per call", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN } = await setupDb(phoneMigrations);
  expect(await err(svc(db, "select public.phone_agent_web_test_call('web_1', 'Test DJ', 'dj')"))).toMatch(/prototype mode/);
  await as(ADMIN, () => db.query("select public.admin_phone_update_settings($1::jsonb)", [JSON.stringify({ mode: "prototype", prototype_numbers: [SAI] })]));
  const a = (await svc(db, "select public.phone_agent_web_test_call('web_1', 'Test DJ', 'dj') r")).rows[0].r;
  const b = (await svc(db, "select public.phone_agent_web_test_call('web_1', 'Other', 'mc') r")).rows[0].r;
  expect(a).toBe(b);
  expect((await db.query("select mode, phone_e164, vendor_name, category from public.phone_calls")).rows).toEqual([{ mode: "prototype", phone_e164: SAI, vendor_name: "Test DJ", category: "dj" }]);
  await as(ADMIN, () => db.query(`select public.admin_phone_update_settings('{"mode":"pilot"}'::jsonb)`));
  expect(await err(svc(db, "select public.phone_agent_web_test_call('web_2', 'x', 'dj')"))).toMatch(/prototype mode/);
});

it("opt-out is permanent and stops every later call", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN } = await setupDb(phoneMigrations);
  await db.exec(setClock(WED_11AM));
  await as(ADMIN, () => db.query("select public.admin_phone_update_settings($1::jsonb)", [JSON.stringify({ mode: "pilot" })]));
  await as(ADMIN, () => db.query(`select * from public.admin_import_prospects($1::jsonb, true)`, [JSON.stringify([{ business_name: "Petal Co", category: "florist" }])]));
  const id = (await db.query("select id from public.vendor_prospects")).rows[0].id;
  await as(ADMIN, () => db.query("select public.admin_phone_record_consent($1, $2, 'express_written', 'Emailed 30 Nov: happy to take a call')", [id, VENDOR]));
  await as(ADMIN, () => db.query("select public.admin_phone_record_dncr($1, false, 'quick_check')", [VENDOR]));
  const call = (await as(ADMIN, () => db.query("select * from public.admin_phone_start_call($1, $2)", [id, VENDOR]))).rows[0];
  await svc(db, "select public.phone_agent_tool($1, 'p9', 'opt_out', '{}'::jsonb)", [call.ref]);

  const p = (await db.query("select do_not_contact from public.vendor_prospects where id = $1", [id])).rows[0];
  expect(p.do_not_contact).toBe(true);
  expect((await db.query("select count(*)::int n from public.phone_consents where withdrawn_at is null")).rows[0].n).toBe(0);
  expect(await err(db.query("delete from public.phone_suppression"))).toMatch(/permanent/);
  expect(await err(db.query(`update public.phone_suppression set reason = 'oops'`))).toMatch(/permanent/);
  await db.exec(setClock("2026-12-09T11:00:00+11:00"));
  const b = (await as(ADMIN, () => db.query("select public.admin_phone_call_blockers($1, $2) b", [id, VENDOR]))).rows[0].b.join(" ");
  expect(b).toMatch(/permanent do-not-call/);
  expect(b).toMatch(/do-not-contact/);
  expect(await as(ADMIN, () => err(db.query("select public.admin_phone_record_consent($1, $2, 'express_written', 'Trying to re-consent them')", [id, VENDOR])))).toMatch(/do-not-contact/);
});

it("callbacks respect calling hours; transfer only in Sai's hours", { timeout: 60_000 }, async () => {
  const { db, as, err, ADMIN } = await setupDb(phoneMigrations);
  await db.exec(setClock(WED_11AM));
  await as(ADMIN, () => db.query("select public.admin_phone_update_settings($1::jsonb)", [JSON.stringify({ mode: "prototype", prototype_numbers: [SAI], owner_transfer_number: "+61400000002" })]));
  const call = (await as(ADMIN, () => db.query("select * from public.admin_phone_start_call(null, $1)", [SAI]))).rows[0];
  const tool = async (name: string, args: object) =>
    (await svc(db, "select public.phone_agent_tool($1, 'p1', $2, $3::jsonb) r", [call.ref, name, JSON.stringify(args)])).rows[0].r;
  expect(await err(tool("schedule_callback", { when: "2026-12-06T10:00:00+11:00" }))).toMatch(/outside permitted calling hours/);
  expect(await err(tool("schedule_callback", { when: "next tuesday" }))).toMatch(/ISO date-time/);
  await tool("schedule_callback", { when: "2026-12-03T14:00:00+11:00", notes: "After a shoot" });
  const f = (await db.query("select kind, status from public.phone_followups")).rows;
  expect(f).toEqual([{ kind: "callback", status: "open" }]);
  expect((await db.query("select outcome from public.phone_calls")).rows[0].outcome).toBe("callback_booked");

  const avail = async () => (await tool("check_transfer", {})).available;
  expect(await avail()).toBe(true);
  await db.exec(setClock("2026-12-02T17:30:00+11:00"));
  expect(await avail()).toBe(false);
});

it("rolls back cleanly", { timeout: 60_000 }, async () => {
  const { db, err } = await setupDb([...phoneMigrations, readMigration("rollbacks/20261202090000_phone_agent.down.sql")]);
  expect(await err(db.query("select * from public.phone_calls"))).toMatch(/does not exist/);
  expect(await err(db.query("insert into public.acquisition_spend (day, channel, amount_cents) values (current_date, 'ai_phone', 1)"))).toMatch(/check/);
});
