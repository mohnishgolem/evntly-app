// Vendor acquisition journey QA against the isolated mock (no real accounts,
// vendors or data). Phone-sized Chrome, every non-local request aborted.
//   node tests/e2e/mock-supabase.mjs        (restart between runs)
//   isolated dev server on :3100 (see README)
//   node tests/e2e/vendor-journey.mjs [screenshot dir]
import { createHash, randomBytes } from "node:crypto";
const { chromium } = await import(new URL("../../.claude/skills/reverse-engineer-app/scripts/node_modules/playwright-core/index.mjs", import.meta.url).href);
const out = process.argv[2] ?? "/tmp";
const BASE = process.env.QA_BASE ?? "http://localhost:3100", MOCK = process.env.QA_MOCK ?? "http://127.0.0.1:54399";
const ALLOWED = new RegExp(`^(${BASE}|${MOCK})/`.replaceAll(".", "\\."));
const results = [];
const ok = (n, p, d = "") => results.push(`${p ? "PASS" : "FAIL"}  ${n}${d ? `  (${d})` : ""}`);
const table = async (t) => (await fetch(`${MOCK}/rest/v1/${t}`)).json();
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

const b = await chromium.launch({ channel: "chrome" });
const errors = [];
async function device({ width = 390, height = 844, signedIn = false } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700, userAgent: IPHONE });
  await ctx.route("**/*", (r) => (ALLOWED.test(r.request().url()) ? r.continue() : r.abort()));
  await ctx.addInitScript(() => {
    document.cookie = "evntly_ad_consent=denied; path=/";
    document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); });
  });
  if (signedIn) {
    const { access_token, user } = await (await fetch(`${MOCK}/__qa/token`)).json();
    const session = { access_token, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user };
    await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" }]);
  }
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  return { ctx, p };
}
const shot = (p, name, full = false) => p.screenshot({ path: `${out}/${name}.png`, fullPage: full });
const go = async (p, path) => { const r = await p.goto(BASE + path, { waitUntil: "networkidle" }); await p.waitForTimeout(400); return r?.status(); };
const draftCookie = async (ctx) => (await ctx.cookies()).find((c) => c.name === "evntly_vdraft");
const cont = (p) => p.getByRole("button", { name: /^(Continue|Skip for now)$/ }).click();

// ── 1. Landing ──────────────────────────────────────────────────────────
let { ctx, p } = await device();
ok("Landing loads", (await go(p, "/become-a-vendor?src=instagram_dm")) === 200);
const h1 = await p.locator("h1").innerText();
ok("Leads with the opportunity, not requirements", /next client/i.test(h1), h1);
const foldText = await p.evaluate(() => [...document.querySelectorAll("main *, body > div *")].filter((e) => !e.children.length && e.getBoundingClientRect().bottom < innerHeight && e.textContent.trim()).map((e) => e.textContent.trim()).join(" "));
ok("No ABN or paperwork on the first screen", !/ABN|agreement/i.test(foldText));
ok("Start CTA on the first screen", await p.locator("a", { hasText: "Start your free listing" }).first().isVisible());
await shot(p, "01-landing-fold");
await shot(p, "02-landing-full", true);
await p.getByRole("button", { name: "2", exact: true }).click();
const scenario = await p.locator("dl[aria-live]").innerText();
ok("Scenario uses the vendor's own numbers ($800 × 2)", /\$1,600/.test(scenario) && /\$0/.test(scenario), scenario.replace(/\s+/g, " "));
ok("Scenario says hypothetical, not a forecast", (await p.getByText(/isn't a forecast/).count()) > 0 && (await p.getByText("Hypothetical scenario", { exact: true }).count()) > 0);
await p.getByText("Hypothetical scenario", { exact: true }).scrollIntoViewIfNeeded();
await shot(p, "03-scenario");
await p.locator("#terms-heading").scrollIntoViewIfNeeded();
await shot(p, "04-pricing-eligibility");
await p.locator("#help-heading").scrollIntoViewIfNeeded();
await shot(p, "05-assisted-help");
ok("Pricing, eligibility and checks are spelled out", (await p.locator("#terms-heading").count()) === 1 && (await p.getByText(/currently free/).count()) > 0);
const landingViews = (await table("page_views")).filter((v) => v.kind === "vendor_landing");
ok("Landing view recorded with its source", landingViews.some((v) => v.source === "instagram_dm"), JSON.stringify(landingViews.map((v) => v.source)));

// ── 2. Builder, one question per screen ─────────────────────────────────
await p.locator("a", { hasText: "Start your free listing" }).first().click();
await p.waitForURL("**/become-a-vendor/start");
await p.waitForTimeout(500);
ok("No account needed to start", !(await p.url()).includes("signup"));
await shot(p, "06-q1-category");
await p.getByRole("button", { name: "Photographer" }).click();
await p.waitForTimeout(600);
ok("Picking a category moves to the next question", /business called/.test(await p.locator("h1").innerText()));
await p.getByPlaceholder("e.g. Harbourlight Photography").fill("QA Lens Studio");
await shot(p, "07-q2-name");
await cont(p);
await p.waitForTimeout(800);
const draftsAfterName = await table("vendor_listing_drafts");
const ck = await draftCookie(ctx);
ok("Draft saved privately after the first two answers", draftsAfterName.length === 1 && draftsAfterName[0].data?.businessName === "QA Lens Studio");
ok("Only the token's SHA-256 is stored", /^[0-9a-f]{64}$/.test(draftsAfterName[0]?.token_hash ?? "") && !!ck && createHash("sha256").update(ck.value).digest("hex") === draftsAfterName[0].token_hash);
ok("Draft cookie is httpOnly", !!ck?.httpOnly);
await p.locator("#vj-city").fill("Mosman");
await p.keyboard.press("Escape");
await shot(p, "08-q3-location");
await cont(p);
await p.getByRole("button", { name: "Wedding" }).click();
await p.getByRole("button", { name: "Birthday" }).click();
await shot(p, "09-q4-events");
await cont(p);
await p.getByRole("radio", { name: /Starting from/ }).click();
await p.locator("#vj-price").fill("900");
await shot(p, "10-q5-pricing");
await cont(p);
await p.locator("#vj-notes").fill("relaxed candid style. edited gallery in three weeks");
await p.getByRole("button", { name: /Suggest a description/ }).click();
await p.getByText(/Suggestion: check it/).waitFor({ timeout: 15000 });
const suggestion = await p.locator("text=Suggestion: check it").locator("..").innerText();
ok("Suggested description uses only the vendor's words", /QA Lens Studio is a photographer based in Mosman/.test(suggestion) && /Relaxed candid style/.test(suggestion) && !/\d/.test(suggestion));
await shot(p, "11-q6-about-suggestion");
await p.getByRole("button", { name: /Use this/ }).click();
ok("Vendor approves the suggestion before it's used", (await p.locator("#vj-bio").inputValue()).startsWith("QA Lens Studio"));
await cont(p);
const pkgPrice = p.locator("#vj-pkg-0");
ok("Suggested packages come without a price", (await pkgPrice.inputValue()) === "");
await pkgPrice.fill("900");
await shot(p, "12-q7-packages");
await p.getByRole("button", { name: /Preview/ }).click();
await p.getByRole("dialog").waitFor();
ok("Phones can open the live preview at any step", (await p.getByRole("dialog").innerText()).includes("QA Lens Studio"));
await shot(p, "12b-preview-sheet");
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
await cont(p);
await p.waitForTimeout(700);
ok("Review shows the live preview", (await p.getByRole("article", { name: "Listing preview" }).first().innerText()).includes("QA Lens Studio"));
const previewText = await p.getByRole("article", { name: "Listing preview" }).first().innerText();
ok("Preview reflects answers (price, package, events)", /\$900/.test(previewText) && /Event photography/.test(previewText) && /Wedding/.test(previewText));
await shot(p, "13-review", true);
const saveLink = p.locator("a", { hasText: "Save my listing" });
ok("Save asks for a free account only now", (await saveLink.getAttribute("href")) === "/signup?role=vendor");
const stored = (await table("vendor_listing_drafts"))[0];
ok("Server copy has every answer", stored.data.city === "Mosman" && stored.data.eventTypes.length === 2 && stored.data.packages[0]?.approved === true);

// Preview sheet on phones mid-flow

// ── 3. Secure recovery on another device ────────────────────────────────
const other = await device();
await go(other.p, "/become-a-vendor/start");
ok("Another device starts empty (nothing leaks without the link)", !(await other.p.content()).includes("QA Lens Studio"));
await go(other.p, `/become-a-vendor/resume/${ck.value}`);
await other.p.waitForTimeout(600);
ok("Private link restores the draft on another device", other.p.url().endsWith("/become-a-vendor/start") && (await other.p.content()).includes("QA Lens Studio"));
await shot(other.p, "14-resumed-other-device");
await go(other.p, `/become-a-vendor/resume/${randomBytes(32).toString("base64url")}`);
ok("A guessed link is refused", other.p.url().includes("link=expired"));
await other.ctx.close();

// Email me a link: rotates the token, so the old link stops working.
await go(p, "/become-a-vendor/start?review=1");
await p.locator("#vj-email").fill("qa-vendor@example.test");
await p.getByText(/Email me this one link/).click();
await p.getByRole("button", { name: /Email me a link/ }).click();
await p.getByText(/^Sent\./).waitFor({ timeout: 10000 }).catch(() => {});
ok("Email-a-link confirms", (await p.getByText(/Sent\. Check/).count()) > 0);
const rotated = await draftCookie(ctx);
ok("Link token rotated", rotated.value !== ck.value);
const third = await device();
await go(third.p, `/become-a-vendor/resume/${ck.value}`);
ok("Old link no longer works", third.p.url().includes("link=expired"));
await third.ctx.close();

// ── 4. Desktop: questions beside a live preview ─────────────────────────
const desk = await device({ width: 1280, height: 860 });
await desk.ctx.addCookies([{ ...rotated }]);
await go(desk.p, "/become-a-vendor/start");
await desk.p.getByRole("button", { name: /Back/ }).first().click();
await desk.p.waitForTimeout(400);
ok("Desktop shows the preview beside the question", await desk.p.getByRole("complementary", { name: "Live preview" }).isVisible());
await shot(desk.p, "15-desktop-builder");
await desk.ctx.close();

// ── 5. Assisted draft + claim link ──────────────────────────────────────
const claimToken = randomBytes(32).toString("base64url");
await fetch(`${MOCK}/rest/v1/vendor_listing_drafts`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    id: "44444444-4444-4444-8444-444444444444",
    token_hash: createHash("sha256").update(claimToken).digest("hex"),
    origin: "assisted",
    email: "qa-customer@example.test",
    permission_note: "QA fixture: owner said yes",
    permission_at: new Date().toISOString(),
    data: { serviceType: "dj", businessName: "QA Sound Co", city: "Chatswood", eventTypes: ["Party"], pricingModel: "from", basePrice: 700, bio: "Open-format DJ sets for parties.", packages: [] },
    expires_at: new Date(Date.now() + 864e6).toISOString(),
    claimed_at: null, revoked_at: null, claim_opened_at: null, updated_at: new Date().toISOString(),
  }),
});
const owner = await device();
await go(owner.p, `/become-a-vendor/claim/${claimToken}`);
ok("Claim page shows the prepared draft privately", (await owner.p.content()).includes("QA Sound Co") && (await owner.p.getByText(/Private\./).count()) > 0);
ok("Claim page is not indexed and sends no referrer", (await owner.p.locator('meta[name="robots"][content*="noindex"]').count()) > 0 && (await owner.p.locator('meta[name="referrer"][content="no-referrer"]').count()) > 0);
await shot(owner.p, "16-claim-link", true);
await owner.p.getByRole("button", { name: /Review and edit my listing/ }).click();
await owner.p.waitForURL("**/become-a-vendor/start?review=1");
await owner.p.waitForTimeout(600);
ok("Owner lands on review with the team-prepared note", (await owner.p.getByText(/Our team prepared this draft with you/).count()) > 0);
await shot(owner.p, "17-claim-review");
const opened = (await table("vendor_listing_drafts")).find((d) => d.id === "44444444-4444-4444-8444-444444444444");
ok("Claim link opening is recorded", !!opened?.claim_opened_at);
await go(owner.p, `/become-a-vendor/claim/${randomBytes(32).toString("base64url")}`);
ok("Unknown claim link shows the expired page", (await owner.p.getByText("This link has expired").count()) > 0);
await owner.ctx.close();

// ── 6. Saving needs a verified account; then ABN + agreement ───────────
await go(p, "/become-a-vendor/save");
ok("Signed out: saving goes to sign-up", p.url().includes("/signup?role=vendor"));
await ctx.close();

const signed = await device({ signedIn: true });
await signed.ctx.addCookies([{ ...rotated }]);
await go(signed.p, "/vendor-signup");
ok("After sign-up, a vendor with a draft continues it (not a blank form)", signed.p.url().endsWith("/become-a-vendor/save"), signed.p.url());
ok("Save page asks for ABN and the agreement", (await signed.p.locator("#save-abn").count()) === 1 && (await signed.p.getByText(/Vendor Service Agreement/).count()) > 0);
const saveBtn = signed.p.getByRole("button", { name: /Save my listing/ });
ok("Save stays disabled without a valid ABN and agreement", await saveBtn.isDisabled());
await signed.p.locator("#save-abn").fill("12 345 678 901");
ok("Invalid ABN is flagged", (await signed.p.getByText(/doesn't look like a valid ABN/).count()) > 0);
await signed.p.locator("#save-abn").fill("53 004 085 616");
await signed.p.getByRole("checkbox", { name: /Vendor Service Agreement/ }).click();
await shot(signed.p, "18-save-abn-agreement", true);
ok("Valid ABN + agreement enables Save", await saveBtn.isEnabled());
await saveBtn.click();
await signed.p.waitForURL("**/vendor-dashboard/**", { timeout: 15000 }).catch(() => {});
ok("Saved listing goes to the finish page (photos, then submit for review)", signed.p.url().includes("/vendor-dashboard/finish"), signed.p.url());
const claimed = (await table("vendor_listing_drafts")).find((d) => d.data?.businessName === "QA Lens Studio");
ok("Draft marked as claimed by the account", !!claimed?.claimed_at && !!claimed?.claimed_by);
const inserted = (await table("service_providers"));
void inserted;
await signed.ctx.close();

// ── 7. Funnel + existing pages unchanged ────────────────────────────────
const events = (await table("funnel_events")).map((e) => e.event + (e.detail ? `:${e.detail}` : ""));
for (const e of ["vendor_cta:hero", "calculator_used", "builder_started", "builder_step:category", "builder_step:pricing", "builder_preview", "draft_saved", "suggestion_used:plain", "draft_link_sent", "draft_resumed", "claim_link_opened", "listing_created:self"]) {
  ok(`Funnel records ${e}`, events.includes(e));
}
const regress = await device();
for (const path of ["/", "/founding-vendors", "/vendor-signup", "/explore", "/plan", "/how-it-works"]) {
  const s = await go(regress.p, path);
  ok(`Existing page still loads: ${path}`, s === 200, String(s));
}
ok("No page errors", errors.length === 0, errors.join(" | "));
await b.close();
console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
