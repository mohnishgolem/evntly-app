// Real-database E2E: app (prod build) → local Supabase (Postgres 17 with the
// production schema, GoTrue, PostgREST, Mailpit). No production access.
import { execSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
const { chromium } = await import(new URL("../../../.claude/skills/reverse-engineer-app/scripts/node_modules/playwright-core/index.mjs", import.meta.url).href);
const out = process.argv[2];
const BASE = "http://localhost:3105", MAIL = "http://127.0.0.1:54324";
const sql = (q) => execSync(`docker exec -i supabase_db_evntly-qa psql -U postgres -d postgres -At -F '|'`, { input: q }).toString().trim();
const results = []; const ok = (n, p, d = "") => results.push(`${p ? "PASS" : "FAIL"}  ${n}${d ? `  (${d})` : ""}`);
const errors = [];
const b = await chromium.launch({ channel: "chrome" });
async function device() {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1" });
  await ctx.route("**/*", (r) => (/^http:\/\/(localhost:3105|127\.0\.0\.1:54321)\//.test(r.request().url()) ? r.continue() : r.abort()));
  await ctx.addInitScript(() => { document.cookie = "evntly_ad_consent=denied; path=/"; });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  return { ctx, p };
}
const go = async (p, path) => { const r = await p.goto(BASE + path, { waitUntil: "networkidle" }); await p.waitForTimeout(300); return r?.status(); };
const cont = (p) => p.getByRole("button", { name: /^(Continue|Skip for now)$/ }).click();
async function buildDraft(p, name, opts = {}) {
  await go(p, "/become-a-vendor/start?src=instagram_dm");
  await p.getByRole("button", { name: "DJ" }).click(); await p.waitForTimeout(500);
  await p.getByPlaceholder("e.g. Harbourlight Photography").fill(name); await cont(p); await p.waitForTimeout(700);
  if (opts.refreshMidway) { await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(500); }
  await p.locator("#vj-city").fill("Ryde"); await p.keyboard.press("Escape"); await cont(p);
  await p.getByRole("button", { name: "Party" }).click(); await cont(p);
  await p.locator("#vj-price").fill("700"); await cont(p);
  await p.locator("#vj-bio").fill("Open-format DJ sets for parties and birthdays across Sydney."); await cont(p);
  await p.locator("#vj-pkg-0").fill("700"); await cont(p); await p.waitForTimeout(800);
}
async function codeFor(email) {
  for (let i = 0; i < 20; i++) {
    const s = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const id = s.messages?.[0]?.ID;
    if (id) { const m = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json(); const code = (m.Text || m.HTML || "").match(/\b(\d{6})\b/)?.[1]; if (code) return code; }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}
async function signUp(p, email, { fromSave = true } = {}) {
  if (!fromSave) await go(p, "/signup?role=vendor");
  await p.locator("#fullName").fill("Jordan Lee");
  await p.locator("#email").fill(email);
  await p.locator("#password").fill(`Tq-${randomBytes(9).toString("base64url")}-x7`);
  await p.locator(`[role=checkbox][aria-labelledby="agreedToTerms-label"]`).click();
  await p.locator(`[role=checkbox][aria-labelledby="agreedToVendorAgreement-label"]`).click();
  await p.locator('form button[type="submit"]').last().click();
  await p.locator("#signup-code").waitFor({ timeout: 15000 });
  const code = await codeFor(email);
  ok(`Real confirmation email with a one-time code arrives (${email.split("@")[0]})`, !!code);
  await p.locator("#signup-code").fill(code ?? "000000");
  await p.locator('form:has(#signup-code) button[type="submit"]').click();
  await p.waitForURL((u) => !u.pathname.startsWith("/signup"), { timeout: 20000 }).catch(() => {});
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(500);
}
async function saveListing(p, abn = "53 004 085 616") {
  await p.locator("#save-abn").fill(abn);
  await p.getByRole("checkbox", { name: /Vendor Service Agreement/ }).click();
  await p.getByRole("button", { name: /Save my listing/ }).click();
  await p.waitForURL("**/vendor-dashboard/**", { timeout: 20000 }).catch(() => {});
}

// ── A. Same device: build (with a refresh), sign up, confirm, save ──────
const A = await device();
await buildDraft(A.p, "Northside Beats A", { refreshMidway: true });
const draftA = sql(`select id, data->>'businessName', data->>'city', data->'packages'->0->>'approved', token_hash ~ '^[0-9a-f]{64}$' from public.vendor_listing_drafts where data->>'businessName' = 'Northside Beats A'`).split("|");
ok("Guest draft saved in the real database, survives a refresh, token hashed", draftA[1] === "Northside Beats A" && draftA[2] === "Ryde" && draftA[3] === "true" && draftA[4] === "t", draftA.join("|"));
await A.p.screenshot({ path: `${out}/real-01-review.png` });
await A.p.locator("a", { hasText: "Save my listing" }).click();
await A.p.waitForURL("**/signup?role=vendor");
await signUp(A.p, "real-qa-a@example.test");
ok("After email verification the vendor lands on their saved draft", A.p.url().endsWith("/become-a-vendor/save"), A.p.url());
await A.p.screenshot({ path: `${out}/real-02-save.png` });
await A.p.locator("#save-abn").fill("12 345 678 901");
await A.p.getByRole("checkbox", { name: /Vendor Service Agreement/ }).click();
ok("Invalid ABN: Save stays disabled", await A.p.getByRole("button", { name: /Save my listing/ }).isDisabled());
await A.p.locator("#save-abn").fill("53 004 085 616");
await A.p.getByRole("button", { name: /Save my listing/ }).click();
await A.p.waitForURL("**/vendor-dashboard/**", { timeout: 20000 }).catch(() => {});
ok("Saved listing opens the finish page", A.p.url().includes("/vendor-dashboard/finish"), A.p.url());
await A.p.screenshot({ path: `${out}/real-03-finish.png` });
const la = sql(`select sp.status, sp.abn, sp.service_type, sp.city, (select count(*) from public.vendor_packages vp where vp.provider_id = sp.id and vp.active), (select count(*) from public.legal_consents lc where lc.user_id = sp.owner_user_id::text and lc.document = 'vendor_agreement' and lc.context = 'vendor_onboarding' and lc.status = 'accepted'), (select status from public.beta_applications ba where ba.user_id::text = sp.owner_user_id::text), (select claimed_at is not null and provider_id = sp.id from public.vendor_listing_drafts d where d.data->>'businessName' = 'Northside Beats A') from public.service_providers sp where sp.name = 'Northside Beats A'`).split("|");
ok("Listing created as a private DRAFT (not public)", la[0] === "draft", la.join("|"));
ok("ABN stored normalised", la[1] === "53004085616");
ok("Approved package copied with the vendor's price", la[4] === "1");
ok("Vendor agreement acceptance recorded before the listing", Number(la[5]) >= 1);
ok("Founding place claimed (application started)", !!la[6], la[6]);
ok("Draft marked as saved by this listing", la[7] === "t");
const pub = await (await fetch(`http://127.0.0.1:54321/rest/v1/service_providers?name=eq.Northside%20Beats%20A&select=id`, { headers: { apikey: process.env.LOCAL_ANON_KEY } })).json();
ok("The draft listing is invisible to the public API", Array.isArray(pub) && pub.length === 0, JSON.stringify(pub).slice(0, 80));
await A.ctx.close();

// ── B. Switch device during verification ────────────────────────────────
const B1 = await device();
await buildDraft(B1.p, "Northside Beats B");
await B1.p.locator("#vj-email").fill("real-qa-b@example.test");
await B1.p.getByText(/Email me this one link/).click();
await B1.p.getByRole("button", { name: /Email me a link/ }).click();
await B1.p.getByText(/Sent\. Check/).waitFor({ timeout: 10000 }).catch(() => {});
ok("Draft link requested (email stored on the draft)", sql(`select email from public.vendor_listing_drafts where data->>'businessName' = 'Northside Beats B'`) === "real-qa-b@example.test");
await B1.ctx.close();
const B2 = await device(); // a different browser: no cookie, no local storage
await signUp(B2.p, "real-qa-b@example.test", { fromSave: false });
await B2.p.getByRole("heading", { name: "Northside Beats B" }).waitFor({ timeout: 10000 }).catch(() => {}); await B2.p.evaluate(() => scrollTo(0, 0)); await B2.p.screenshot({ path: `${out}/real-04-other-device-save.png` });
ok("On a new device, after verifying the same email, the draft is found", B2.p.url().endsWith("/become-a-vendor/save") && (await B2.p.getByRole("heading", { name: "Northside Beats B" }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false)), B2.p.url());
await B2.ctx.close();

// ── C. Assisted draft: wrong email can't save it, owner can ─────────────
const claimToken = randomBytes(32).toString("base64url");
const adminId = sql(`select id from auth.users where email = 'probe-admin@example.test'`) || null;
sql(`insert into public.vendor_listing_drafts (token_hash, origin, email, created_by, permission_note, permission_at, data)
     values ('${createHash("sha256").update(claimToken).digest("hex")}', 'assisted', 'real-qa-owner@example.test', ${adminId ? `'${adminId}'` : "(select id from auth.users limit 1)"}, 'QA: owner said yes on a call', now(),
     '{"serviceType":"photographer","businessName":"Harbour Owner Studio","city":"Mosman","eventTypes":["Wedding"],"pricingModel":"from","basePrice":1200,"bio":"Prepared with the owner."}')`);
const C1 = await device();
await go(C1.p, `/become-a-vendor/claim/${claimToken}`);
ok("Claim link shows the prepared draft", (await C1.p.content()).includes("Harbour Owner Studio"));
await C1.p.getByRole("button", { name: /Review and edit my listing/ }).click(); await C1.p.waitForTimeout(800);
await go(C1.p, "/signup?role=vendor");
await signUp(C1.p, "real-qa-intruder@example.test", { fromSave: false });
await go(C1.p, "/become-a-vendor/save");
ok("Someone else's verified account can't save an assisted draft", (await C1.p.getByText(/couldn.t find your draft/i).count()) > 0, C1.p.url());
await C1.ctx.close();
const C2 = await device();
await go(C2.p, `/become-a-vendor/claim/${claimToken}`);
await C2.p.getByRole("button", { name: /Review and edit my listing/ }).click(); await C2.p.waitForTimeout(800);
await go(C2.p, "/signup?role=vendor");
await signUp(C2.p, "real-qa-owner@example.test", { fromSave: false });
await C2.p.screenshot({ path: `${out}/real-05-owner-save.png` });
ok("The owner's verified email reaches the save page", C2.p.url().endsWith("/become-a-vendor/save") && (await C2.p.getByRole("heading", { name: "Harbour Owner Studio" }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false)), C2.p.url());
await saveListing(C2.p);
ok("Owner saves the assisted draft as their draft listing", C2.p.url().includes("/vendor-dashboard/finish") && sql(`select status from public.service_providers where name = 'Harbour Owner Studio'`) === "draft");
ok("Asked us to add their photos → setup request opened", sql(`select count(*) from public.listing_setup_requests r join public.service_providers sp on sp.id = r.provider_id where sp.name = 'Harbour Owner Studio'`) === "1");
await go(C2.p, `/become-a-vendor/claim/${claimToken}`);
ok("Claim link stops working once saved", (await C2.p.getByText("This link has expired").count()) > 0);
await C2.ctx.close();

// ── D. Expiry, purge, rate limit ────────────────────────────────────────
const expToken = randomBytes(32).toString("base64url");
sql(`insert into public.vendor_listing_drafts (token_hash, data, expires_at) values ('${createHash("sha256").update(expToken).digest("hex")}', '{"businessName":"Expired QA"}', now() - interval '1 day')`);
const D = await device();
await go(D.p, `/become-a-vendor/resume/${expToken}`);
ok("Expired draft link is refused", D.p.url().includes("link=expired"));
sql(`update public.vendor_listing_drafts set expires_at = now() - interval '31 days' where data->>'businessName' = 'Expired QA'; select public.purge_expired_vendor_listing_drafts();`);
ok("Daily purge deletes drafts 30 days past expiry", sql(`select count(*) from public.vendor_listing_drafts where data->>'businessName' = 'Expired QA'`) === "0");
ok("Purge is scheduled in pg_cron", sql(`select schedule from cron.job where jobname = 'purge-expired-vendor-listing-drafts'`) === "23 3 * * *");
await buildDraft(D.p, "Northside Beats C");
const replies = [];
for (let i = 0; i < 4; i++) {
  await go(D.p, "/become-a-vendor/start?review=1");
  await D.p.locator("#vj-email").fill("real-qa-flood@example.test");
  await D.p.getByText(/Email me this one link/).click();
  await D.p.getByRole("button", { name: /Email me a link/ }).click();
  await D.p.waitForTimeout(1500);
  replies.push((await D.p.locator("form:has(#vj-email), [role=status]").first().innerText().catch(() => "")).includes("Too many") ? "limited" : "sent");
}
ok("Draft-link email limited to 3 per address (real check_rate_limit)", replies.slice(0, 3).every((r) => r === "sent") && replies[3] === "limited", replies.join(","));
await D.ctx.close();

// ── E. The old listing form still works on the real schema ─────────────
const E = await device();
await signUp(E.p, "real-qa-classic@example.test", { fromSave: false });
ok("Vendor without a draft still gets the classic listing form", E.p.url().endsWith("/vendor-signup") && (await E.p.getByText(/Step 1 of 5/).count()) > 0, E.p.url());
await E.ctx.close();

// ── F. Analytics on the real schema ─────────────────────────────────────
const adm = sql(`select id from auth.users where email = 'probe-admin@example.test'`);
const asAdmin = (q) => sql(`set request.jwt.claims = '{"sub":"${adm}","aal":"aal2","role":"authenticated"}'; set role authenticated; ${q}`).split("\n").filter((l) => l.includes("|"));
const funnel = () => Object.fromEntries(asAdmin("select step, people from public.admin_vendor_journey_funnel(1);").map((l) => l.split("|")));
const fun = funnel();
ok("Funnel: 3 guest drafts, 1 team draft, 1 claim opened, 2 saved by verified accounts, 2 listings, 0 submitted", fun[5] === "3" && fun[6] === "1" && fun[7] === "1" && fun[8] === "2" && fun[9] === "2" && fun[10] === "0", JSON.stringify(fun));
const daily = asAdmin("select listing_drafts, vendor_registrations, genuine_enquiries from public.admin_growth_daily(1);")[0];
ok("Growth dashboard: today's drafts and verified vendor sign-ups; 0 enquiries (none invented)", !!daily && daily.split("|")[0] === "4" && daily.split("|")[2] === "0", daily);
sql(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"full_name":"QA Tester"}' where email = 'real-qa-a@example.test'`);
const fun2 = funnel();
ok("An account named QA/TEST is excluded from the funnel", fun2[8] === "1" && fun2[9] === "1", JSON.stringify(fun2));
console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
console.log("page errors:", errors.length ? errors.join(" | ") : "none");
await b.close();
