import { createHmac, createHash, randomBytes } from "node:crypto";
// Local Supabase stack only (public demo keys printed by `supabase start`).
const API = "http://127.0.0.1:54321";
const ANON = process.env.LOCAL_ANON_KEY;
const SERVICE = process.env.LOCAL_SERVICE_ROLE_KEY;
const SECRET = process.env.LOCAL_JWT_SECRET;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => { const h = b64({ alg: "HS256", typ: "JWT" }), p = b64({ aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), ...claims }); return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const results = []; const ok = (n, p, d = "") => results.push(`${p ? "PASS" : "FAIL"}  ${n}${d ? `  (${d})` : ""}`);
async function req(method, path, token, body, key = ANON) {
  const r = await fetch(API + path, { method, headers: { apikey: key, Authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
async function createUser(email, meta = {}) {
  const r = await req("POST", "/auth/v1/admin/users", SERVICE, { email, password: randomBytes(18).toString("base64url"), email_confirm: true, user_metadata: meta }, SERVICE);
  return r.data;
}
const vendor = await createUser("probe-vendor@example.test", { full_name: "Probe Vendor", role: "vendor" });
const admin = await createUser("probe-admin@example.test", { full_name: "Probe Admin" });
ok("Sign-up trigger creates the public profile (real auth.users trigger)", !!vendor?.id && (await req("GET", `/rest/v1/users?id=eq.${admin.id}&select=id`, SERVICE, null, SERVICE)).data?.length === 1);
// Make the admin an admin (service role, like production's admin setup).
const { execSync } = await import("node:child_process");
const viaApi = await req("PATCH", `/rest/v1/users?id=eq.${admin.id}`, SERVICE, { role: "admin" }, SERVICE);
const stillCustomer = execSync(`docker exec supabase_db_evntly-qa psql -U postgres -d postgres -At -c "select role from public.users where id = '${admin.id}'"`).toString().trim();
ok("Existing guard: role can't be changed to admin through the API", stillCustomer !== "admin", stillCustomer);
execSync(`docker exec supabase_db_evntly-qa psql -U postgres -d postgres -q -c "set session_replication_role = replica; update public.users set role = 'admin' where id = '${admin.id}'"`);
const tokens = {
  guest: ANON,
  vendor: jwt({ sub: vendor.id, email: vendor.email, aal: "aal1" }),
  "admin without MFA": jwt({ sub: admin.id, email: admin.email, aal: "aal1" }),
  "admin with MFA": jwt({ sub: admin.id, email: admin.email, aal: "aal2" }),
};
// Service role (the app's server) can write a draft.
const token = randomBytes(32).toString("base64url");
const ins = await req("POST", "/rest/v1/vendor_listing_drafts", SERVICE, { token_hash: createHash("sha256").update(token).digest("hex"), data: { businessName: "Probe" } }, SERVICE);
ok("Server (service role) can save a draft", ins.status === 201, String(ins.status));
const badAssisted = await req("POST", "/rest/v1/vendor_listing_drafts", SERVICE, { token_hash: createHash("sha256").update("x").digest("hex"), origin: "assisted", email: "o@x.com" }, SERVICE);
ok("Assisted draft without recorded permission is refused by the database", badAssisted.status >= 400, String(badAssisted.status));
const big = await req("POST", "/rest/v1/vendor_listing_drafts", SERVICE, { token_hash: createHash("sha256").update("big").digest("hex"), data: { bio: randomBytes(40000).toString("hex") } }, SERVICE);
ok("Draft over the 32 KB storage limit is refused", big.status >= 400, String(big.status));
const plain = await req("POST", "/rest/v1/vendor_listing_drafts", SERVICE, { token_hash: token }, SERVICE);
ok("A raw (unhashed) token can't be stored", plain.status >= 400, String(plain.status));

for (const [who, t] of Object.entries(tokens)) {
  const read = await req("GET", "/rest/v1/vendor_listing_drafts?select=*", t);
  ok(`${who}: can't read drafts`, read.status >= 400 || (Array.isArray(read.data) && read.data.length === 0), `${read.status}`);
  const write = await req("POST", "/rest/v1/vendor_listing_drafts", t, { token_hash: createHash("sha256").update(who).digest("hex") });
  ok(`${who}: can't create drafts`, write.status >= 400, String(write.status));
  const upd = await req("PATCH", "/rest/v1/vendor_listing_drafts?id=not.is.null", t, { revoked_at: new Date().toISOString() });
  ok(`${who}: can't modify drafts`, upd.status >= 400 || (Array.isArray(upd.data) && upd.data.length === 0), String(upd.status));
  const helper = await req("POST", "/rest/v1/rpc/internal_test_user_ids", t, {});
  ok(`${who}: can't list internal/test accounts`, helper.status >= 400, String(helper.status));
  const funnel = await req("POST", "/rest/v1/rpc/admin_vendor_journey_funnel", t, { p_days: 30 });
  const growth = await req("POST", "/rest/v1/rpc/admin_growth_daily", t, { p_days: 7 });
  const spendW = await req("POST", "/rest/v1/acquisition_spend", t, { day: "2026-11-25", channel: "print", amount_cents: 100 });
  const spendR = await req("GET", "/rest/v1/acquisition_spend?select=*", t);
  if (who === "admin with MFA") {
    ok("admin with MFA: sees the journey funnel (15 stages)", Array.isArray(funnel.data) && funnel.data.length === 15, String(funnel.data?.length));
    ok("admin with MFA: sees the growth dashboard (7 days)", Array.isArray(growth.data) && growth.data.length === 7, String(growth.data?.length));
    ok("admin with MFA: can log spend", spendW.status === 201, String(spendW.status));
    ok("admin with MFA: can read spend", Array.isArray(spendR.data) && spendR.data.length >= 1);
  } else {
    ok(`${who}: funnel returns nothing`, funnel.status >= 400 || (Array.isArray(funnel.data) && funnel.data.length === 0), `${funnel.status} ${funnel.data?.length}`);
    ok(`${who}: growth dashboard returns nothing`, growth.status >= 400 || (Array.isArray(growth.data) && growth.data.length === 0), `${growth.status} ${growth.data?.length}`);
    ok(`${who}: can't log spend`, spendW.status >= 400, String(spendW.status));
    ok(`${who}: can't read spend`, spendR.status >= 400 || (Array.isArray(spendR.data) && spendR.data.length === 0), String(spendR.status));
  }
}
// Existing protections still hold (spot checks on production policies).
const v = tokens.vendor;
const otherListing = await req("POST", "/rest/v1/service_providers", v, { name: "Sneaky", service_type: "dj", status: "approved", owner_email: "someone-else@example.test" });
ok("Existing RLS: a vendor can't create a listing for someone else / as approved", otherListing.status >= 400 || otherListing.data?.[0]?.status === "draft", `${otherListing.status} ${JSON.stringify(otherListing.data).slice(0, 120)}`);
console.log(results.join("\n")); console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
