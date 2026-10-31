import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// Runs the founding-vendor migration in PGlite (Postgres in WebAssembly — no
// network, never the live project) on top of stubs of the Supabase pieces it
// uses (auth schema, roles, is_admin, service_providers), then checks access
// rules, invitations, claiming, capacity and unsubscribe as admin / vendors /
// anon. Concurrent approvals are serialised by the beta_program row lock,
// which a single PGlite connection can't race; the capacity checks below
// cover the logic under that lock.
const migration = readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/20261101090000_founding_vendor_beta.sql"), "utf8");
const rollback = readFileSync(path.resolve(import.meta.dirname, "../../supabase/rollbacks/20261101090000_founding_vendor_beta.down.sql"), "utf8");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const results: [boolean, string][] = [];
const ok = (cond: boolean, name: string) => results.push([!!cond, name]);

it("founding vendor beta migration: access, invitations, claiming, capacity", { timeout: 60_000 }, async () => {
const pg = new PGlite();
// Rows are untyped SQL results; the checks below read them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const db = {
  exec: (sql: string) => pg.exec(sql),
  query: (sql: string, params?: unknown[]) => pg.query<Row>(sql, params),
};

await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
grant execute on all functions in schema auth to anon, authenticated;
create table public.users (id text primary key, email text, role text, suspended_at timestamptz);
create table public.service_providers (id text primary key default gen_random_uuid()::text, owner_user_id uuid, name text,
  status text default 'pending_review', is_demo boolean default false, founding_vendor boolean default false, created_at timestamptz default now());
create table public.admin_audit_log (id bigserial primary key, created_at timestamptz default now(), actor_user_id uuid, action text not null,
  target_table text not null, target_id text not null, old_value jsonb, new_value jsonb);
create function public.is_admin() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.users u where u.id = (select auth.uid())::text and u.role = 'admin')
  and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'; $$;
grant usage on schema public to anon, authenticated;
grant select, insert on public.service_providers to authenticated;
`);
await db.exec(migration);

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const A = "00000000-0000-0000-0000-0000000000a1";
const B = "00000000-0000-0000-0000-0000000000b1";
const C = "00000000-0000-0000-0000-0000000000c1";
for (const [id, email, role] of [[ADMIN, "admin@evntlyapp.com", "admin"], [A, "alice@photo.com.au", "vendor"], [B, "bob@dj.com.au", "vendor"], [C, "carol@flowers.com.au", "customer"]]) {
  await db.query("insert into auth.users values ($1,$2)", [id, email]);
  await db.query("insert into public.users (id,email,role) values ($1,$2,$3)", [id, email, role]);
}

async function as<T>(user: string, fn: () => Promise<T>, { aal = "aal2" } = {}): Promise<T> {
  await db.exec("reset role");
  if (user === "anon") {
    await db.exec(`set role anon; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','{"role":"anon"}',false);`);
  } else {
    const email = (await db.query("select email from auth.users where id=$1", [user])).rows[0].email;
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, email, role: "authenticated", aal })]);
    await db.exec("set role authenticated");
  }
  try { return await fn(); } finally { await db.exec("reset role"); }
}
async function err(p: Promise<unknown>): Promise<string> { try { await p; return ""; } catch (e) { return (e as Error).message; } }

// Waitlist rows (service role writes them in the app).
await db.exec(`
insert into public.vendor_waitlist (email, first_name, invite_consent, consent_at) values
  ('Alice@photo.com.au', 'Alice', true, now()),
  ('bob@dj.com.au', 'Bob', true, now()),
  ('nope@x.com.au', 'Nope', false, null),
  ('gone@x.com.au', 'Gone', true, now()),
  ('dave@mc.com.au', 'Dave', true, now()),
  ('erin@cater.com.au', 'Erin', true, now());
update public.vendor_waitlist set unsubscribed_at = now() where email = 'gone@x.com.au';
`);
const wl: Record<string, { id: string; unsubscribe_token: string }> = Object.fromEntries((await db.query("select email_normalized, id, unsubscribe_token from public.vendor_waitlist")).rows.map((r) => [r.email_normalized, r]));

let r = await as("anon", () => db.query("select * from public.founding_vendor_places()"));
ok(r.rows[0].capacity === 20 && r.rows[0].approved === 0 && r.rows[0].remaining === 20, "anon sees 20 of 20 places");

ok(!!(await as("anon", () => err(db.query("select * from public.vendor_waitlist")))), "anon can't read waitlist");
r = await as(B, () => db.query("select count(*)::int n from public.vendor_waitlist"));
ok(r.rows[0].n === 0, "vendor sees no waitlist rows");
r = await as(ADMIN, () => db.query("select count(*)::int n from public.vendor_waitlist"));
ok(r.rows[0].n === 6, "MFA admin reads waitlist");
r = await as(ADMIN, () => db.query("select count(*)::int n from public.vendor_waitlist"), { aal: "aal1" });
ok(r.rows[0].n === 0, "admin without MFA reads nothing");
ok(!!(await as(B, () => err(db.query("update public.vendor_waitlist set invite_consent = true")))), "vendor can't write waitlist");
ok(!!(await as(B, () => err(db.query("insert into public.beta_applications (user_id, status) values ($1, 'approved')", [B])))), "vendor can't insert an application directly");
ok(!!(await as(ADMIN, () => err(db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["alice@photo.com.au"].id, sha("x")])), { aal: "aal1" })), "admin without MFA can't send");
ok(!!(await as(B, () => err(db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["alice@photo.com.au"].id, sha("x")])))), "vendor can't send");

const tokA = "token-alice", tokB = "token-bob", tokD = "token-dave";
r = await as(ADMIN, () => db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["alice@photo.com.au"].id, sha(tokA)]));
const invA = r.rows[0];
ok(invA.email === "Alice@photo.com.au" && invA.send_number === 1, "prepare returns recipient + send number");
ok(/no consent/i.test(await as(ADMIN, () => err(db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["nope@x.com.au"].id, sha("n")])))), "refuses contact without consent");
ok(/unsubscribed/i.test(await as(ADMIN, () => err(db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["gone@x.com.au"].id, sha("g")])))), "refuses unsubscribed contact");
ok(/in progress/i.test(await as(ADMIN, () => err(db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["alice@photo.com.au"].id, sha("again")])))), "refuses a second send while one is in flight");
r = await as("anon", () => db.query("select * from public.beta_invite_lookup($1)", [sha(tokA)]));
ok(r.rows[0].state === "invalid", "link doesn't work until the send is recorded");
await as(ADMIN, () => db.query("select public.admin_record_beta_invitation($1, true, 're_123', null)", [invA.invitation_id]));
ok(/24 hours/i.test(await as(ADMIN, () => err(db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["alice@photo.com.au"].id, sha("again")])))), "refuses resend within 24h");
r = await as(ADMIN, () => db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["bob@dj.com.au"].id, sha(tokB)]));
await as(ADMIN, () => db.query("select public.admin_record_beta_invitation($1, true, 're_456', null)", [r.rows[0].invitation_id]));
r = await as(ADMIN, () => db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["dave@mc.com.au"].id, sha(tokD)]));
const invD = r.rows[0].invitation_id;
await as(ADMIN, () => db.query("select public.admin_record_beta_invitation($1, false, null, 'Resend 429')", [invD]));
r = await db.query("select status, last_error from public.beta_invitations where id=$1", [invD]);
ok(r.rows[0].status === "failed" && r.rows[0].last_error === "Resend 429", "failed send recorded with error");

await as(ADMIN, () => db.query("select public.admin_set_beta_program(20, 14, 3, 10)"));
ok(/daily limit/i.test(await as(ADMIN, () => err(db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["erin@cater.com.au"].id, sha("e")])))), "daily limit enforced (3 attempts in 24h)");
await as(ADMIN, () => db.query("select public.admin_set_beta_program(20, 14, 50, 10)"));

r = await as("anon", () => db.query("select * from public.beta_invite_lookup($1)", [sha(tokA)]));
ok(r.rows[0].state === "valid" && r.rows[0].masked_email === "a•••@photo.com.au" && r.rows[0].first_name === "Alice", "valid link, masked email");
r = await db.query("select clicked_at from public.beta_invitations where id=$1", [invA.invitation_id]);
ok(!!r.rows[0].clicked_at, "click recorded");
r = await as("anon", () => db.query("select * from public.beta_invite_lookup($1)", [sha("guess")]));
ok(r.rows[0].state === "invalid", "unknown token is invalid");
r = await as("anon", () => db.query("select * from public.beta_invite_lookup('not-hex')"));
ok(r.rows[0].state === "invalid", "malformed token is invalid");

ok(!!(await as("anon", () => err(db.query("select * from public.claim_founding_vendor_place(null,'direct')")))), "anon can't claim");
r = await as(B, () => db.query("select * from public.claim_founding_vendor_place($1,'instagram_bio')", [sha(tokA)]));
ok(r.rows[0].invite === "email_mismatch" && r.rows[0].created === true, "Bob using Alice's link: mismatch, own application");
const appB = r.rows[0].application_id;
r = await db.query("select source, invitation_id, status from public.beta_applications where id=$1", [appB]);
ok(r.rows[0].source === "instagram_bio" && r.rows[0].invitation_id === null && r.rows[0].status === "started", "Bob's application keeps his own source, no invite");
r = await as(A, () => db.query("select * from public.claim_founding_vendor_place($1,'direct')", [sha(tokA)]));
const appA = r.rows[0].application_id;
ok(r.rows[0].invite === "attached" && r.rows[0].status === "started", "Alice claims her invite (case-insensitive email)");
r = await db.query("select source from public.beta_applications where id=$1", [appA]);
ok(r.rows[0].source === "waitlist_email", "source = waitlist_email");
r = await as(A, () => db.query("select * from public.claim_founding_vendor_place($1,'direct')", [sha(tokA)]));
ok(r.rows[0].application_id === appA && r.rows[0].created === false && r.rows[0].invite === "attached", "claiming again is idempotent");
r = await as("anon", () => db.query("select * from public.beta_invite_lookup($1)", [sha(tokA)]));
ok(r.rows[0].state === "claimed", "used link shows claimed");
r = await as(B, () => db.query("select * from public.claim_founding_vendor_place($1,'direct')", [sha(tokA)]));
ok(r.rows[0].invite === "claimed_by_other" && r.rows[0].application_id === appB, "reused link refused for someone else");
r = await as(B, () => db.query("select * from public.claim_founding_vendor_place($1,'direct')", [sha(tokB)]));
ok(r.rows[0].invite === "attached" && r.rows[0].application_id === appB, "Bob attaches his own invite to his existing application");
await db.exec(`update public.beta_invitations set expires_at = now() - interval '1 minute' where id = '${invD}'`);
await db.exec(`update public.beta_invitations set status = 'sent' where id = '${invD}'`);
r = await as("anon", () => db.query("select * from public.beta_invite_lookup($1)", [sha(tokD)]));
ok(r.rows[0].state === "expired", "expired link shows expired");
r = await as(C, () => db.query("select * from public.claim_founding_vendor_place($1,'bogus_source')", [sha(tokD)]));
ok(r.rows[0].invite === "expired", "expired link not attached");
const appC = r.rows[0].application_id;
r = await db.query("select source from public.beta_applications where id=$1", [appC]);
ok(r.rows[0].source === "direct", "unknown source stored as direct");

r = await as(B, () => db.query("select id from public.beta_applications"));
ok(r.rows.length === 1 && r.rows[0].id === appB, "vendor sees only their own application");
ok(!!(await as(B, () => err(db.query("update public.beta_applications set status='approved'")))), "vendor can't update applications directly");

ok(/hasn't submitted/i.test(await as(ADMIN, () => err(db.query("select public.admin_decide_founding_application($1,'approved')", [appA])))), "can't approve before a listing exists");
await as(A, () => db.query("insert into public.service_providers (owner_user_id, name) values ($1, 'Alice Photo')", [A]));
r = await db.query("select status, provider_id from public.beta_applications where id=$1", [appA]);
ok(r.rows[0].status === "submitted" && !!r.rows[0].provider_id, "new listing moves application to submitted");
await as(B, () => db.query("insert into public.service_providers (owner_user_id, name) values ($1, 'Bob DJ')", [B]));
ok(/5\+/.test(await as(ADMIN, () => err(db.query("select public.admin_decide_founding_application($1,'needs_changes','')", [appB])))), "needs changes requires a note");
await as(ADMIN, () => db.query("select public.admin_decide_founding_application($1,'needs_changes','Add three photos please')", [appB]));
r = await as(B, () => db.query("select public.update_my_founding_application('resubmit') s"));
ok(r.rows[0].s === "submitted", "vendor resubmits after changes");
await as(ADMIN, () => db.query("select public.admin_decide_founding_application($1,'approved')", [appA]));
r = await db.query("select sp.status, sp.founding_vendor from public.service_providers sp join public.beta_applications a on a.provider_id = sp.id where a.id=$1", [appA]);
ok(r.rows[0].status === "approved" && r.rows[0].founding_vendor === true, "approval approves listing + founding flag");
r = await db.query("select count(*)::int n from public.admin_audit_log where action='founding_application'");
ok(r.rows[0].n === 2, "decisions audit-logged");
r = await as("anon", () => db.query("select * from public.founding_vendor_places()"));
ok(r.rows[0].approved === 1 && r.rows[0].remaining === 19, "places count updates");

ok(/can't go below/i.test(await as(ADMIN, () => err(db.query("select public.admin_set_beta_program(0, 14, 50, 10)")))), "capacity can't drop below approved");
await as(ADMIN, () => db.query("select public.admin_set_beta_program(1, 14, 50, 10)"));
ok(/filled/i.test(await as(ADMIN, () => err(db.query("select public.admin_decide_founding_application($1,'approved')", [appB])))), "approval refused when full");
r = await as("anon", () => db.query("select * from public.founding_vendor_places()"));
ok(r.rows[0].remaining === 0, "0 places left shows full");
await db.exec(`insert into public.service_providers (id, owner_user_id, name, is_demo, status) values ('demo1', null, 'Demo', true, 'approved')`);
r = await as("anon", () => db.query("select * from public.founding_vendor_places()"));
ok(r.rows[0].approved === 1, "demo listings never count");

r = await as(A, () => db.query("select public.update_my_founding_application('withdraw') s"));
ok(r.rows[0].s === "withdrawn", "vendor withdraws");
r = await db.query("select founding_vendor from public.service_providers where owner_user_id=$1", [A]);
ok(r.rows[0].founding_vendor === false, "founding flag removed on withdraw");
await as(ADMIN, () => db.query("select public.admin_decide_founding_application($1,'approved')", [appB]));
r = await as("anon", () => db.query("select * from public.founding_vendor_places()"));
ok(r.rows[0].approved === 1, "freed place goes to next vendor");
ok(/withdrew/i.test(await as(ADMIN, () => err(db.query("select public.admin_decide_founding_application($1,'approved')", [appA])))), "can't approve a withdrawn application");

await as(B, () => db.query("insert into public.beta_feedback (kind, area, message) values ('bug','quotes','Quote form cut off on iPhone')"));
r = await as(B, () => db.query("select count(*)::int n from public.beta_feedback"));
ok(r.rows[0].n === 1, "applicant sends feedback");
await db.exec(`update public.beta_applications set status='rejected' where user_id='${C}'`);
ok(!!(await as(C, () => err(db.query("insert into public.beta_feedback (kind, message) values ('feedback','hello there')")))), "rejected applicant can't send feedback");
ok(!!(await as(B, () => err(db.query("insert into public.beta_feedback (user_id, kind, message) values ($1,'feedback','spoofed user')", [A])))), "can't send feedback as someone else");
r = await as(B, () => db.query("update public.beta_feedback set status='resolved' returning id"));
ok(r.rows.length === 0, "vendor can't change feedback status");
r = await as(ADMIN, () => db.query("update public.beta_feedback set status='reviewed' returning id"));
ok(r.rows.length === 1, "admin marks feedback reviewed");
r = await as(A, () => db.query("select count(*)::int n from public.beta_feedback"));
ok(r.rows[0].n === 0, "vendors can't read each other's feedback");

r = await as("anon", () => db.query("select public.beta_unsubscribe($1) ok", [wl["erin@cater.com.au"].unsubscribe_token]));
ok(r.rows[0].ok === true, "unsubscribe works with token");
r = await as("anon", () => db.query("select public.beta_unsubscribe($1) ok", ["0".repeat(64)]));
ok(r.rows[0].ok === false, "wrong token does nothing");
ok(/unsubscribed|consent/i.test(await as(ADMIN, () => err(db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["erin@cater.com.au"].id, sha("e2")])))), "unsubscribed contact can't be invited");
ok(/already applied/i.test(await as(ADMIN, () => err(db.query("select * from public.admin_prepare_beta_invitation($1,$2)", [wl["bob@dj.com.au"].id, sha("b2")])))), "won't invite someone who already applied");


  // The rollback removes everything cleanly.
  await db.exec("reset role");
  await db.exec(rollback);
  r = await db.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name like 'beta_%'");
  ok(r.rows[0].n === 0, "rollback drops the beta tables");

  for (const [passed, name] of results) expect.soft(passed, name).toBe(true);
  expect(results.length).toBeGreaterThan(55);
});
