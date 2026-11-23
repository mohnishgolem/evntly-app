#!/usr/bin/env node
// Capture one public page at desktop/tablet/mobile: screenshots, design tokens, structure,
// observable network summary and frontend-tech fingerprints. Polite and read-only:
// obeys robots.txt (User-agent: *), never logs in, never submits forms, never clicks.
//
// Usage: node capture.mjs <url> --out <dir> [--label name] [--viewports desktop,tablet,mobile]
//                         [--wait 2500] [--session <name>] [--theme light|dark] [--headed]
import fs from "node:fs";
import path from "node:path";
import {
  VIEWPORTS, SESSION_DIR, parseArgs, die, loadPlaywright, launchChrome, isLocal, slug, ensureDir,
  redactUrl, checkRobots, sleep, assertIsolatedEvntly, blockProduction,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2), ["headed"]);
const target = args._[0];
if (!target || !/^https?:\/\//.test(target)) die("Usage: capture.mjs <http(s) url> --out <dir> [--label name]");
if (!args.out) die("--out <dir> is required");
const label = slug(args.label || new URL(target).pathname.replace(/\/$/, "") || "home");
const outDir = path.join(args.out, label); // created only after the access checks pass
const viewports = (args.viewports || "desktop,tablet,mobile").split(",").map((s) => s.trim());
for (const v of viewports) if (!VIEWPORTS[v]) die(`Unknown viewport "${v}" (use desktop,tablet,mobile)`);
const extraWait = Number(args.wait || 2500);

// ---------- robots.txt ----------
let robots = { allowed: true, rule: "local dev host — robots not checked", crawlDelay: null };
// A local target is an Evntly check: evntly-isolated only, never a
// production-connected dev server.
if (isLocal(target)) await assertIsolatedEvntly([target]);
if (!isLocal(target)) {
  robots = await checkRobots(target);
  console.log(`robots.txt: ${robots.allowed ? "ALLOWED" : "DISALLOWED"} (${robots.rule})${robots.crawlDelay ? `, crawl-delay ${robots.crawlDelay}s` : ""}`);
  if (!robots.allowed) die("robots.txt disallows this path for automated agents. Not capturing. Use manual reading only, or pick another page.", 3);
}
const politeDelay = Math.max(3000, (robots.crawlDelay || 0) * 1000);
ensureDir(outDir);

// ---------- session (authorised accounts only) ----------
let storageState;
if (args.session) {
  const f = path.join(SESSION_DIR, `${slug(args.session)}.json`);
  if (!fs.existsSync(f)) die(`No saved session at ${f}. Create one with save-session.mjs (Sai logs in).`);
  storageState = f;
  console.log(`Using authorised session: ${f} (read-only browsing)`);
}

const { chromium } = await loadPlaywright();
const browser = await launchChrome(chromium, { headed: !!args.headed });

// ---------- in-page extraction (runs in browser) ----------
function extract() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const txt = (el, n = 80) => (el.innerText || el.getAttribute("aria-label") || el.value || "").replace(/\s+/g, " ").trim().slice(0, n);
  const bump = (m, k) => { if (k && k !== "none" && k !== "normal" && k !== "0px" && k !== "rgba(0, 0, 0, 0)") m[k] = (m[k] || 0) + 1; };
  const top = (m, n = 15) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));

  const all = [...document.body.querySelectorAll("*")].slice(0, 6000).filter(vis);
  const t = { color: {}, background: {}, borderColor: {}, fontFamily: {}, fontSize: {}, fontWeight: {}, lineHeight: {}, letterSpacing: {}, radius: {}, shadow: {}, padding: {}, gap: {}, margin: {} };
  let animated = 0;
  const transitions = {};
  const sticky = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) {
      bump(t.color, cs.color); bump(t.fontFamily, cs.fontFamily.split(",")[0].replace(/["']/g, "").trim());
      bump(t.fontSize, cs.fontSize); bump(t.fontWeight, cs.fontWeight); bump(t.lineHeight, cs.lineHeight); bump(t.letterSpacing, cs.letterSpacing);
    }
    bump(t.background, cs.backgroundColor);
    if (cs.borderTopWidth !== "0px" && cs.borderTopStyle !== "none") bump(t.borderColor, cs.borderTopColor);
    const rad = parseFloat(cs.borderTopLeftRadius);
    bump(t.radius, rad >= 999 ? "pill (≥999px)" : cs.borderTopLeftRadius);
    // Drop Tailwind's transparent placeholder shadow layers.
    const sh = cs.boxShadow === "none" ? null : cs.boxShadow.split(/,(?![^(]*\))/).map((s) => s.trim()).filter((s) => !/^rgba\(0, 0, 0, 0\) 0px 0px 0px 0px$/.test(s)).join(", ");
    bump(t.shadow, sh || null);
    for (const s of [cs.paddingTop, cs.paddingLeft]) bump(t.padding, s);
    bump(t.gap, cs.gap === "normal" ? null : cs.gap); bump(t.margin, cs.marginTop);
    if (cs.animationName !== "none") animated++;
    if (cs.transitionDuration && cs.transitionDuration !== "0s") bump(transitions, `${cs.transitionProperty.split(",")[0]} ${cs.transitionDuration.split(",")[0]} ${cs.transitionTimingFunction.split(",")[0]}`);
    if ((cs.position === "sticky" || cs.position === "fixed") && sticky.length < 15) {
      const r = el.getBoundingClientRect();
      sticky.push({ tag: el.tagName.toLowerCase(), position: cs.position, top: cs.top, bottom: cs.bottom, size: `${Math.round(r.width)}x${Math.round(r.height)}`, text: txt(el, 60) });
    }
  }

  // CSS custom properties on :root (same-origin sheets only).
  const vars = {};
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules || []) {
      if (r.selectorText && /(^|,)\s*(:root|html)\s*(,|$)/.test(r.selectorText)) {
        for (const p of r.style) if (p.startsWith("--") && Object.keys(vars).length < 120) vars[p] = r.style.getPropertyValue(p).trim().slice(0, 80);
      }
    }
  }

  const landmarks = [...document.querySelectorAll("header, nav, main, footer, aside, [role=banner], [role=navigation], [role=main], [role=contentinfo], [role=search], dialog")]
    .filter(vis).slice(0, 30).map((el) => ({ tag: el.tagName.toLowerCase(), role: el.getAttribute("role"), label: el.getAttribute("aria-label"), links: el.querySelectorAll("a").length }));
  const headings = [...document.querySelectorAll("h1,h2,h3")].filter(vis).slice(0, 60).map((h) => ({ level: h.tagName.toLowerCase(), text: txt(h) }));
  const ctas = [...document.querySelectorAll("button, a[href], [role=button], input[type=submit]")].filter(vis)
    .map((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { text: r.height > 120 || el.querySelector("img,picture") ? "[card/image link]" : txt(el, 50), tag: el.tagName.toLowerCase(), area: r.width * r.height, size: `${Math.round(r.width)}x${Math.round(r.height)}`, bg: cs.backgroundColor, aboveFold: r.top < innerHeight }; })
    .filter((c) => c.text).sort((a, b) => b.area - a.area).slice(0, 30).map(({ area, ...c }) => c);
  const forms = [...document.querySelectorAll("form, [role=search]")].filter(vis).slice(0, 10).map((f) => ({
    action: f.getAttribute("action") ? "(set)" : null,
    fields: [...f.querySelectorAll("input, select, textarea")].filter((i) => i.type !== "hidden").slice(0, 25).map((i) => ({
      type: i.type || i.tagName.toLowerCase(), name: i.name || null,
      label: (i.labels?.[0] && txt(i.labels[0], 50)) || i.getAttribute("aria-label") || i.placeholder || null, required: i.required,
    })),
  }));
  // Repeated components: ≥3 visible siblings sharing tag+class signature.
  const repeated = [];
  const seen = new Set();
  for (const parent of document.querySelectorAll("ul, ol, div, section")) {
    const kids = [...parent.children].filter(vis);
    if (kids.length < 3) continue;
    const sig = (e) => e.tagName + "." + [...e.classList].slice(0, 3).sort().join(".");
    const counts = {};
    kids.forEach((k) => (counts[sig(k)] = (counts[sig(k)] || 0) + 1));
    const [s, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const first = kids.find((k) => sig(k) === s);
    if (n >= 3 && !seen.has(s) && first.innerText.trim().length > 10) {
      seen.add(s);
      const r = first.getBoundingClientRect();
      repeated.push({ count: n, item: first.tagName.toLowerCase(), size: `${Math.round(r.width)}x${Math.round(r.height)}`, hasImage: !!first.querySelector("img,picture,[style*=background-image]"), sampleTextShape: txt(first, 120).replace(/[A-Z][a-z]+ [A-Z][a-z]+/g, "<Name>") });
    }
    if (repeated.length >= 15) break;
  }

  // Tech fingerprints (client-side signals only).
  const scripts = [...document.scripts].map((s) => s.src).filter(Boolean);
  const html = document.documentElement.outerHTML.slice(0, 400000);
  const has = (re) => re.test(html) || scripts.some((s) => re.test(s));
  const w = window;
  const tech = {
    "Next.js": !!(w.__NEXT_DATA__ || w.next || has(/\/_next\/static\//)),
    "Next.js App Router (RSC)": !!w.__next_f,
    Nuxt: !!(w.__NUXT__ || w.$nuxt),
    Gatsby: !!w.___gatsby,
    Remix: !!w.__remixContext,
    Astro: has(/astro-island|\/_astro\//),
    SvelteKit: has(/__sveltekit|\/_app\/immutable\//),
    Angular: !!document.querySelector("[ng-version]"),
    Vue: !!(w.__VUE__ || document.querySelector("[data-v-app]")),
    React: !!(w.React || document.querySelector("[data-reactroot]") || w.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size || w.__next_f || w.__NEXT_DATA__),
    "Apollo/GraphQL client": !!(w.__APOLLO_STATE__ || w.__APOLLO_CLIENT__),
    Webflow: !!document.documentElement.getAttribute("data-wf-site"),
    Wix: has(/static\.wixstatic\.com|wix-code/),
    WordPress: has(/wp-content|wp-includes/),
    Shopify: !!w.Shopify,
    "Tailwind (class heuristic)": document.querySelectorAll("[class*='px-'][class*='py-'], [class*='flex'][class*='gap-']").length > 20,
    "Google Tag Manager": has(/googletagmanager\.com/),
    "Google Analytics": has(/google-analytics\.com|gtag\/js/),
    Segment: !!w.analytics?.initialize || has(/cdn\.segment\.com/),
    Amplitude: has(/amplitude/),
    Mixpanel: has(/mixpanel/),
    Hotjar: has(/hotjar/),
    "Meta Pixel": has(/connect\.facebook\.net/),
    Intercom: has(/intercom/),
    Zendesk: has(/zdassets|zendesk/),
    Stripe: has(/js\.stripe\.com/),
    "Google Maps": has(/maps\.googleapis\.com/),
    Mapbox: has(/api\.mapbox\.com|api\.tiles\.mapbox/),
    MapLibre: has(/maplibre/),
    Sentry: has(/sentry/),
    Optimizely: has(/optimizely/),
    LaunchDarkly: has(/launchdarkly/),
    Braze: has(/braze|appboy/),
    Algolia: has(/algolia/),
    Cloudinary: has(/cloudinary/),
    imgix: has(/imgix/),
  };
  const meta = {
    title: document.title,
    description: document.querySelector("meta[name=description]")?.content || null,
    generator: document.querySelector("meta[name=generator]")?.content || null,
    lang: document.documentElement.lang || null,
    ogType: document.querySelector("meta[property='og:type']")?.content || null,
    jsonLdTypes: [...document.querySelectorAll("script[type='application/ld+json']")].flatMap((s) => { try { const j = JSON.parse(s.textContent); return [].concat(j).map((x) => x["@type"]); } catch { return []; } }).slice(0, 10),
    themeColor: document.querySelector("meta[name=theme-color]")?.content || null,
    manifest: !!document.querySelector("link[rel=manifest]"),
  };
  const authWall = !!document.querySelector("input[type=password]") || /\b(log ?in|sign ?in)\b/i.test(document.title);
  const pageHeight = document.documentElement.scrollHeight;
  const out = {};
  for (const k in t) out[k] = top(t[k]);
  return {
    meta, tech: Object.keys(tech).filter((k) => tech[k]), authWall, pageHeight,
    tokens: out, cssVariables: vars, motion: { animatedElements: animated, transitions: top(transitions, 10) },
    sticky, landmarks, headings, ctas, forms, repeated,
    counts: { images: document.images.length, links: document.links.length, buttons: document.querySelectorAll("button").length, iframes: document.querySelectorAll("iframe").length, videos: document.querySelectorAll("video").length, svgs: document.querySelectorAll("svg").length },
  };
}

// Shape of a JSON value: keys and types only, never values.
function shape(v, depth = 0) {
  if (depth > 4) return "…";
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1)] : [];
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).slice(0, 40)) o[k] = shape(v[k], depth + 1);
    return o;
  }
  return v === null ? "null" : typeof v;
}

const result = { url: redactUrl(target), label, capturedAt: new Date().toISOString(), robots, viewports: {} };
const docHeaders = {};
const network = { requests: 0, byType: {}, hosts: {}, apiLike: {}, jsonShapes: {}, failed: [] };
const origin = new URL(target).origin;

for (const [i, vp] of viewports.entries()) {
  if (i > 0) await sleep(politeDelay);
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], storageState, colorScheme: args.theme || "light", locale: "en-AU", timezoneId: "Australia/Sydney" });
  if (isLocal(target)) await blockProduction(ctx);
  const page = await ctx.newPage();
  const record = i === 0; // record network once (desktop pass) to keep it small
  if (record) {
    page.on("response", async (res) => {
      const req = res.request();
      const u = new URL(req.url());
      if (u.protocol.startsWith("data")) return;
      network.requests++;
      const type = req.resourceType();
      network.byType[type] = (network.byType[type] || 0) + 1;
      network.hosts[u.host] = (network.hosts[u.host] || 0) + 1;
      if (res.status() >= 400) network.failed.length < 20 && network.failed.push(`${res.status()} ${redactUrl(req.url())}`);
      const isRsc = u.searchParams.has("_rsc") || !!req.headers()["rsc"];
      if (isRsc) { network.rscPrefetches = (network.rscPrefetches || 0) + 1; return; }
      if (type === "fetch" || type === "xhr" || /graphql|\/api\//i.test(u.pathname)) {
        const key = `${req.method()} ${u.host}${u.pathname.replace(/\/[0-9a-f-]{8,}|\/\d+/gi, "/:id")}`;
        network.apiLike[key] = (network.apiLike[key] || 0) + 1;
        const ct = res.headers()["content-type"] || "";
        if (ct.includes("json") && Object.keys(network.jsonShapes).length < 15 && !network.jsonShapes[key]) {
          try { network.jsonShapes[key] = shape(await res.json()); } catch { /* body unavailable */ }
        }
      }
    });
  }
  let resp;
  try {
    resp = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    result.viewports[vp] = { error: e.message.split("\n")[0] };
    await ctx.close();
    continue;
  }
  if (record && resp) {
    const h = resp.headers();
    for (const k of ["server", "x-powered-by", "via", "x-vercel-id", "x-vercel-cache", "cf-ray", "cf-cache-status", "x-amz-cf-id", "x-served-by", "x-cache", "x-nextjs-cache", "x-nextjs-prerender", "x-middleware-rewrite", "fly-request-id", "x-netlify-request-id", "strict-transport-security", "content-security-policy"]) {
      if (h[k]) docHeaders[k] = k === "content-security-policy" ? [...new Set((h[k].match(/https?:\/\/[^\s;]+|\*\.[a-z0-9.-]+/gi) || []))].slice(0, 40) : h[k].slice(0, 120);
    }
    result.status = resp.status();
  }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // Gentle scroll to trigger lazy content, then back to top.
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 20000); y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(extraWait);
  const finalUrl = page.url();
  const fold = path.join(outDir, `${vp}-fold.png`);
  const full = path.join(outDir, `${vp}-full.png`);
  await page.screenshot({ path: fold });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vpw = VIEWPORTS[vp].viewport.width;
  await page.screenshot({ path: full, fullPage: h <= 12000, clip: h > 12000 ? { x: 0, y: 0, width: vpw, height: 12000 } : undefined }).catch(async () => page.screenshot({ path: full }));
  const data = await page.evaluate(extract);
  result.viewports[vp] = { finalUrl: redactUrl(finalUrl), screenshots: { fold: path.relative(args.out, fold), full: path.relative(args.out, full) }, ...data };
  if (data.authWall || new URL(finalUrl).pathname.match(/login|signin|sign-in|auth/i)) {
    result.viewports[vp].note = "Login wall detected — content behind it was NOT inspected.";
  }
  await ctx.close();
  console.log(`✓ ${vp}: ${full}`);
}
await browser.close();

network.hosts = Object.fromEntries(Object.entries(network.hosts).sort((a, b) => b[1] - a[1]).slice(0, 30));
network.apiLike = Object.fromEntries(Object.entries(network.apiLike).slice(0, 40));
result.network = network;
result.responseHeaders = docHeaders;
result.evidenceNote = "Everything here is client-observable (VERIFIED for the client). Backend/architecture conclusions drawn from it are INFERRED at best.";
fs.writeFileSync(path.join(outDir, "capture.json"), JSON.stringify(result, null, 2));

// ---------- human summary ----------
const d = result.viewports.desktop || Object.values(result.viewports).find((v) => !v.error) || {};
const fmt = (arr = [], n = 8) => arr.slice(0, n).map((x) => `\`${x.value}\` ×${x.count}`).join(", ") || "—";
const md = [
  `# Capture: ${label}`,
  ``,
  `- URL: ${result.url}  (status ${result.status ?? "?"})`,
  `- Captured: ${result.capturedAt}`,
  `- robots.txt: ${robots.allowed ? "allowed" : "disallowed"} — ${robots.rule}`,
  `- Title: ${d.meta?.title ?? "—"}`,
  d.authWall ? `- ⚠️ Login wall detected — not inspected beyond it.` : null,
  ``,
  `## Screenshots`,
  ...Object.entries(result.viewports).map(([k, v]) => v.error ? `- ${k}: ERROR ${v.error}` : `- ${k}: \`${v.screenshots.fold}\`, \`${v.screenshots.full}\` (page height ${v.pageHeight}px)`),
  ``,
  `## Frontend signals (client-side, INFERRED for framework)`,
  `- Detected: ${(d.tech || []).join(", ") || "none"}`,
  `- Headers: ${Object.entries(docHeaders).filter(([k]) => k !== "content-security-policy").map(([k, v]) => `${k}=${v}`).join("; ") || "—"}`,
  `- Third-party hosts: ${Object.keys(network.hosts).filter((h) => !h.endsWith(new URL(origin).hostname.split(".").slice(-2).join("."))).slice(0, 15).join(", ") || "—"}`,
  ``,
  `## Design tokens (desktop, by frequency)`,
  `- Fonts: ${fmt(d.tokens?.fontFamily, 4)}`,
  `- Font sizes: ${fmt(d.tokens?.fontSize, 10)}`,
  `- Weights: ${fmt(d.tokens?.fontWeight, 5)}`,
  `- Text colours: ${fmt(d.tokens?.color)}`,
  `- Backgrounds: ${fmt(d.tokens?.background)}`,
  `- Radii: ${fmt(d.tokens?.radius)}`,
  `- Shadows: ${fmt(d.tokens?.shadow, 4)}`,
  `- Padding: ${fmt(d.tokens?.padding, 10)}`,
  `- Gaps: ${fmt(d.tokens?.gap, 8)}`,
  `- Motion: ${d.motion?.animatedElements ?? 0} animated elements; transitions ${fmt(d.motion?.transitions, 5)}`,
  ``,
  `## Structure`,
  `- Headings: ${(d.headings || []).slice(0, 15).map((h) => `${h.level}: ${h.text}`).join(" · ") || "—"}`,
  `- Largest CTAs: ${(d.ctas || []).slice(0, 10).map((c) => `"${c.text}" (${c.size}${c.aboveFold ? ", above fold" : ""})`).join(" · ") || "—"}`,
  `- Forms: ${(d.forms || []).map((f) => f.fields.map((x) => `${x.label || x.name || x.type}[${x.type}]`).join(", ")).join(" | ") || "—"}`,
  `- Repeated components: ${(d.repeated || []).map((r) => `${r.count}× ${r.item} ${r.size}${r.hasImage ? " +img" : ""}`).join(" · ") || "—"}`,
  `- Sticky/fixed: ${(d.sticky || []).map((s) => `${s.tag} ${s.position} ${s.size}`).join(" · ") || "—"}`,
  ``,
  `## Mobile differences`,
  ...["tablet", "mobile"].filter((k) => result.viewports[k] && !result.viewports[k].error).map((k) => {
    const v = result.viewports[k];
    return `- ${k}: height ${v.pageHeight}px; sticky ${v.sticky.map((s) => `${s.tag}@${s.bottom !== "auto" ? "bottom" : "top"}`).join(", ") || "none"}; top CTA "${v.ctas[0]?.text ?? "—"}"; fonts ${fmt(v.tokens.fontSize, 5)}`;
  }),
  ``,
  `## Observable API calls (paths only, query values redacted)`,
  network.rscPrefetches ? `- (plus ${network.rscPrefetches} Next.js RSC route prefetches — page navigation, not APIs)` : null,
  ...Object.entries(network.apiLike).slice(0, 20).map(([k, n]) => `- \`${k}\` ×${n}`),
  Object.keys(network.jsonShapes).length ? `\nJSON response shapes (keys/types only) are in capture.json → network.jsonShapes.` : "",
].filter((l) => l !== null).join("\n");
fs.writeFileSync(path.join(outDir, "summary.md"), md + "\n");
console.log(`✓ wrote ${path.join(outDir, "capture.json")} and summary.md`);
