// Signed-in customer QA against the isolated mock (no real accounts or data).
const { chromium } = await import(new URL("../../.claude/skills/reverse-engineer-app/scripts/node_modules/playwright-core/index.mjs", import.meta.url).href);
const out = process.argv[2] ?? "/tmp";
const BASE = "http://localhost:3100", MOCK = "http://127.0.0.1:54399";
const V1 = "00000000-0000-4000-8000-000000000001", V2 = "00000000-0000-4000-8000-000000000002", EVENT = "22222222-2222-4222-8222-222222222222";
const results = []; const ok = (n, p, d = "") => results.push(`${p ? "PASS" : "FAIL"}  ${n}${d ? `  (${d})` : ""}`);
const { access_token, user } = await (await fetch(`${MOCK}/__qa/token`)).json();
const session = { access_token, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user };
const cookie = { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" };
const b = await chromium.launch({ channel: "chrome" });
async function phone() {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1" });
  await ctx.route("**/*", (r) => (/^https?:\/\/(localhost:3100|127\.0\.0\.1:54399)\//.test(r.request().url()) ? r.continue() : r.abort()));
  await ctx.addInitScript(() => { document.cookie = "evntly_ad_consent=denied; path=/"; document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }); });
  await ctx.addCookies([cookie]);
  return ctx;
}
const errors = [];
let ctx = await phone(); let p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
const go = async (path) => { const r = await p.goto(BASE + path, { waitUntil: "networkidle" }); await p.waitForTimeout(500); return r.status(); };

await go("/");
const tabs = await p.getByRole("navigation", { name: "Main" }).getByRole("link").allInnerTexts();
ok("Signed-in tab bar: Explore, Saved, Events, Messages, Profile", tabs.map((t) => t.replace(/\d+|unread/g, "").trim()).join(",") === "Explore,Saved,Events,Messages,Profile", tabs.join(" | "));
ok("Messages tab shows unread badge (2)", tabs.some((t) => /Messages/.test(t) && /2/.test(t)));
ok("Header shows Messages button", (await p.locator('header a[aria-label*="Messages"]').count()) > 0);
const plan = p.locator('section[aria-labelledby="continue-heading"]');
ok("Continue planning card for the upcoming event", (await plan.count()) === 1 && /Mia's 30th/.test(await plan.innerText()), (await plan.count()) ? (await plan.innerText()).replace(/\s+/g, " ").slice(0, 90) : "missing");
ok("Progress shows 1 of 3 vendors booked (33%)", (await plan.count()) && /1 of 3 vendors booked/.test(await plan.innerText()) && /33%/.test(await plan.innerText()));
await p.screenshot({ path: `${out}/home-signed-in.png` });
ok("No 'Recently viewed' before browsing", (await p.locator('section[aria-labelledby="recent-heading"]').count()) === 0);

// Browse two vendor profiles → recently viewed, newest first
await go(`/vendor/${V1}`); await p.waitForTimeout(800);
await go(`/vendor/${V2}`); await p.waitForTimeout(800);
await go("/");
const recent = p.locator('section[aria-labelledby="recent-heading"] a[href^="/vendor/"]');
const hrefs = await recent.evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
ok("Recently viewed shows both profiles, newest first", hrefs[0]?.endsWith(V2) && hrefs[1]?.endsWith(V1), hrefs.join(", "));
await p.locator('section[aria-labelledby="recent-heading"]').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/home-recently-viewed.png` });

// Save / unsave
await go("/explore");
await p.locator(`a[href="/vendor/${V1}"] button[aria-label="Save vendor"]`).click();
await p.waitForTimeout(1200);
let st = await (await fetch(`${MOCK}/__qa/state`)).json();
ok("Save from a card stores the vendor", st.saved.includes(V1), JSON.stringify(st.saved));
ok("Heart shows saved (aria-pressed)", (await p.locator(`a[href="/vendor/${V1}"] button[aria-label="Remove from saved vendors"]`).getAttribute("aria-pressed")) === "true");
await go("/saved");
ok("Saved page lists it", (await p.locator(`a[href="/vendor/${V1}"]`).count()) > 0);
await p.screenshot({ path: `${out}/saved.png` });

// Another session/device: state persists server-side
const ctx2 = await phone(); const p2 = await ctx2.newPage();
await p2.goto(BASE + "/saved", { waitUntil: "networkidle" });
ok("Second session (another device) sees the same saved vendor", (await p2.locator(`a[href="/vendor/${V1}"]`).count()) > 0);
await ctx2.close();

await p.locator(`a[href="/vendor/${V1}"] button[aria-label="Remove from saved vendors"]`).click();
await p.waitForTimeout(1200);
st = await (await fetch(`${MOCK}/__qa/state`)).json();
ok("Unsave removes it", !st.saved.includes(V1), JSON.stringify(st.saved));
await go("/saved");
ok("Saved page empty state after unsave", (await p.locator(`a[href="/vendor/${V1}"]`).count()) === 0);

// Event board, dashboard, messages, profile
for (const [path, label] of [[`/dashboard/events/${EVENT}`, "Event board"], ["/dashboard", "My Events"], ["/dashboard/events", "All events"], ["/messages", "Messages"], ["/profile", "Profile"], ["/dashboard/quotes", "Requests & quotes"]]) {
  const s = await go(path);
  const h1 = (await p.locator("h1").first().innerText().catch(() => "")).slice(0, 40);
  const login = new URL(p.url()).pathname.startsWith("/login");
  ok(`${label} loads signed in`, s === 200 && !login, `${s} · h1 "${h1}"`);
  await p.screenshot({ path: `${out}/page-${label.replace(/\W+/g, "-").toLowerCase()}.png` });
}
ok("Event board shows the event", /Mia's 30th/.test(await (await go(`/dashboard/events/${EVENT}`), p.locator("main").innerText())));

// Sign out from the menu
await go("/");
await p.locator('header button[aria-label="Open menu"]').click(); await p.waitForTimeout(600);
const logout = p.getByRole("dialog").getByRole("button", { name: /log out|sign out/i });
ok("Menu has Log out", (await logout.count()) > 0);
if (await logout.count()) { await logout.first().click(); await p.waitForURL((u) => u.pathname === "/", { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(800); }
const cookies = (await ctx.cookies()).filter((c) => c.name.startsWith("sb-"));
ok("Sign-out clears the session cookie", cookies.every((c) => !c.value || c.expires === 0 || c.expires < Date.now() / 1000), cookies.map((c) => c.name).join(","));
await p.screenshot({ path: `${out}/after-logout.png` });
const tabsAfter = await p.locator('nav[aria-label="Main"].fixed').getByRole("link").allInnerTexts();
ok("After sign-out the guest tab bar shows (Log in)", tabsAfter.some((t) => /Log in/.test(t)), tabsAfter.join(" | "));
ok("No page errors", errors.length === 0, errors.join(" || "));
await b.close();
console.log(results.join("\n"));
