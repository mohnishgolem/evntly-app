const { chromium } = await import(new URL("../../.claude/skills/reverse-engineer-app/scripts/node_modules/playwright-core/index.mjs", import.meta.url).href);
const out = process.argv[2] ?? "/tmp"; const BASE = "http://localhost:3100";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const results = []; const ok = (n, p, d = "") => results.push(`${p ? "PASS" : "FAIL"}  ${n}${d ? `  (${d})` : ""}`);
const b = await chromium.launch({ channel: "chrome" });
async function ctxFor(opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, ...opts });
  const meta = [];
  await ctx.route("**/*", (r) => { const u = r.request().url(); if (/facebook|fbcdn|fbevents/.test(u)) meta.push(u); return /^https?:\/\/(localhost:3100|127\.0\.0\.1:54399)\//.test(u) ? r.continue() : r.abort(); });
  await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }));
  return { ctx, meta };
}
const banner = (p) => p.getByRole("region", { name: "Ad measurement choice" });
let { ctx, meta } = await ctxFor(); let p = await ctx.newPage();
await p.goto(BASE + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
ok("Banner shows to a new visitor", await banner(p).isVisible());
const g = await p.evaluate(() => {
  const r = document.querySelector('[aria-label="Ad measurement choice"]').getBoundingClientRect();
  const bar = document.querySelector('nav[aria-label="Main"].fixed').getBoundingClientRect();
  const menu = document.querySelector('header button[aria-label="Open menu"]').getBoundingClientRect();
  const hit = document.elementFromPoint(menu.x + menu.width / 2, menu.y + menu.height / 2);
  return { top: r.top, bottom: r.bottom, barTop: bar.top, menuHit: !!hit?.closest('header button[aria-label="Open menu"]'), h: getComputedStyle(document.documentElement).getPropertyValue("--consent-h") };
});
ok("Header menu stays visible and tappable", g.menuHit);
ok("Banner floats above the tab bar, not over it", g.bottom <= g.barTop - 4, `banner ${Math.round(g.top)}–${Math.round(g.bottom)}, tab bar at ${Math.round(g.barTop)}`);
ok("Page makes room for it (--consent-h set)", /px/.test(g.h) && parseFloat(g.h) > 40, g.h.trim());
ok("Nothing requested from Meta before a choice", meta.length === 0, meta.join(" "));
await p.screenshot({ path: `${out}/consent-home-phone.png` });

await p.goto(BASE + "/vendor/00000000-0000-4000-8000-000000000001", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
const v = await p.evaluate(() => {
  const r = document.querySelector('[aria-label="Ad measurement choice"]').getBoundingClientRect();
  const bars = [...document.querySelectorAll(".fixed")].filter((e) => e !== document.querySelector('[aria-label="Ad measurement choice"]') && !e.closest('[aria-label="Ad measurement choice"]') && e.getBoundingClientRect().height > 40 && e.getBoundingClientRect().bottom > innerHeight - 260 && e.tagName !== "NAV");
  return bars.map((e) => { const b = e.getBoundingClientRect(); return { cls: e.className.toString().slice(0, 40), top: Math.round(b.top), bottom: Math.round(b.bottom), overlap: !(b.bottom <= r.top || b.top >= r.bottom) }; });
});
ok("Vendor page: Request quote bar sits above the banner (no overlap)", v.length > 0 && v.every((x) => !x.overlap), JSON.stringify(v));
await p.screenshot({ path: `${out}/consent-vendor-phone.png` });

await banner(p).getByRole("button", { name: "No thanks" }).click(); await p.waitForTimeout(500);
ok("No thanks hides it", !(await banner(p).count()));
ok("Choice stored as denied", (await ctx.cookies()).some((c) => c.name === "evntly_ad_consent" && c.value === "denied"));
ok("Bars return to normal (--consent-h cleared)", (await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--consent-h"))).trim() === "");
await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(600);
ok("Stays hidden after reload", !(await banner(p).count()));
ok("Still nothing requested from Meta after declining", meta.length === 0);
await ctx.close();

({ ctx, meta } = await ctxFor()); p = await ctx.newPage();
await p.goto(BASE + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
await banner(p).getByRole("button", { name: "Allow" }).click(); await p.waitForTimeout(1200);
ok("Allow stores granted", (await ctx.cookies()).some((c) => c.name === "evntly_ad_consent" && c.value === "granted"));
ok("Meta script is requested only after Allow (blocked here)", meta.some((u) => /fbevents|facebook/.test(u)), meta[0] ?? "none");
await ctx.close();

({ ctx, meta } = await ctxFor()); p = await ctx.newPage();
await p.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true }));
await p.goto(BASE + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
ok("Global Privacy Control: no banner, nothing loaded", !(await banner(p).count()) && meta.length === 0);
await ctx.close();

({ ctx, meta } = await ctxFor({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 })); p = await ctx.newPage();
await p.goto(BASE + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
const d = await p.evaluate(() => { const r = document.querySelector('[aria-label="Ad measurement choice"]').getBoundingClientRect(); return { bottom: Math.round(r.bottom), width: Math.round(r.width), h: getComputedStyle(document.documentElement).getPropertyValue("--consent-h").trim() }; });
ok("Desktop: full-width bar at the bottom", d.bottom === 900 && d.width === 1440, JSON.stringify(d));
await p.screenshot({ path: `${out}/consent-desktop.png` });
await b.close();
console.log(results.join("\n"));
