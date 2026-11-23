#!/usr/bin/env node
// Responsive + basic quality check for YOUR OWN pages (Evntly local dev or preview).
// For each URL × viewport × theme: horizontal overflow, small tap targets, tiny text,
// images without alt, missing h1, console/page errors, failed same-origin requests.
//
// Usage: node responsive-check.mjs <url> [more urls…] --out <dir>
//          [--viewports desktop,tablet,mobile] [--themes light,dark] [--session <name>]
// Exit code 1 if any CRITICAL issue (overflow, page error, HTTP >= 400 on the page itself).
import fs from "node:fs";
import path from "node:path";
import { VIEWPORTS, SESSION_DIR, parseArgs, die, loadPlaywright, launchChrome, slug, ensureDir, redactUrl, isLocal } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const urls = args._;
if (!urls.length || !args.out) die("Usage: responsive-check.mjs <url…> --out <dir>");
for (const u of urls) if (!isLocal(u) && !/evntly/.test(new URL(u).hostname)) {
  console.warn(`! ${u} is not a local or Evntly host. This check is meant for your own app; it only reads the page.`);
}
const outDir = ensureDir(args.out);
const viewports = (args.viewports || "desktop,tablet,mobile").split(",");
const themes = (args.themes || "light,dark").split(",");
let storageState;
if (args.session) storageState = path.join(SESSION_DIR, `${slug(args.session)}.json`);

const { chromium } = await loadPlaywright();
const browser = await launchChrome(chromium);
const rows = [];
let critical = 0;

for (const url of urls) {
  for (const vp of viewports) {
    for (const theme of themes) {
      const ctx = await browser.newContext({ ...VIEWPORTS[vp], colorScheme: theme, storageState });
      // Evntly sets .light/.dark from localStorage before paint; mirror the requested theme.
      await ctx.addInitScript((t) => { try { localStorage.setItem("evntly-theme", t); } catch {} }, theme);
      const page = await ctx.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const failed = [];
      page.on("console", (m) => m.type() === "error" && consoleErrors.length < 10 && consoleErrors.push(m.text().slice(0, 200)));
      page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 200)));
      page.on("response", (r) => {
        if (r.status() >= 400 && new URL(r.url()).origin === new URL(url).origin && failed.length < 10) failed.push(`${r.status()} ${redactUrl(r.url())}`);
      });
      let status = 0;
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        status = resp?.status() ?? 0;
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);
      } catch (e) {
        pageErrors.push(`navigation: ${e.message.split("\n")[0]}`);
      }
      const m = await page.evaluate((isTouch) => {
        const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
        const describe = (el) => {
          const id = el.id ? `#${el.id}` : "";
          const cls = typeof el.className === "string" ? "." + el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
          const text = (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 30);
          return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
        };
        const W = document.documentElement.clientWidth;
        const overflowPx = document.documentElement.scrollWidth - W;
        const offenders = [];
        if (overflowPx > 1) {
          for (const el of document.body.querySelectorAll("*")) {
            if (!vis(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.right > W + 1 && offenders.length < 5) {
              // skip elements inside a horizontally scrollable container (intentional carousels)
              let p = el.parentElement, scroller = false;
              while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") { scroller = true; break; } p = p.parentElement; }
              if (!scroller) offenders.push(`${describe(el)} right=${Math.round(r.right)}`);
            }
          }
        }
        const targets = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link]")].filter(vis);
        const tooSmall = [], under44 = [];
        for (const el of targets) {
          const r = el.getBoundingClientRect();
          const inline = getComputedStyle(el).display === "inline" && el.closest("p, li, span");
          if (inline) continue; // inline text links are exempt (WCAG 2.5.8)
          if (r.width < 24 || r.height < 24) tooSmall.length < 8 && tooSmall.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
          else if (isTouch && (r.width < 44 || r.height < 44)) under44.push(describe(el));
        }
        const tinyText = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode() && tinyText.length < 8) {
          const n = walker.currentNode; if (!n.textContent.trim()) continue;
          const el = n.parentElement; if (!el || !vis(el)) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 12) tinyText.push(`${describe(el)} ${fs}px`);
        }
        const imgsNoAlt = [...document.images].filter((i) => vis(i) && !i.hasAttribute("alt")).length;
        return { overflowPx: Math.max(0, overflowPx), offenders, tooSmall, under44Count: under44.length, tinyText, imgsNoAlt, h1: document.querySelectorAll("h1").length, title: document.title };
      }, !!VIEWPORTS[vp].hasTouch);
      const shot = path.join(outDir, `${slug(new URL(url).pathname.replace(/^\/$/, "") || "home")}-${vp}-${theme}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => page.screenshot({ path: shot }));
      await ctx.close();
      const crit = (m.overflowPx > 1 && m.offenders.length > 0) || pageErrors.length > 0 || status >= 400;
      if (crit) critical++;
      rows.push({ url: redactUrl(url), viewport: vp, theme, status, critical: crit, ...m, consoleErrors, pageErrors, failedRequests: failed, screenshot: path.relative(outDir, shot) });
      console.log(`${crit ? "✖" : "✓"} ${url} ${vp}/${theme}: overflow ${m.overflowPx}px, small targets ${m.tooSmall.length}, tiny text ${m.tinyText.length}, errors ${pageErrors.length}/${consoleErrors.length}`);
    }
  }
}
await browser.close();

fs.writeFileSync(path.join(outDir, "responsive-results.json"), JSON.stringify(rows, null, 2));
const md = [
  `# Responsive check — ${new Date().toISOString()}`,
  ``,
  `| Page | Viewport | Theme | HTTP | Overflow px | <24px targets | <44px (touch, advisory) | Text <12px | Img no alt | h1 | Page errors | Console errors | Failed reqs | Result |`,
  `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${new URL(r.url).pathname} | ${r.viewport} | ${r.theme} | ${r.status} | ${r.overflowPx} | ${r.tooSmall.length} | ${r.under44Count} | ${r.tinyText.length} | ${r.imgsNoAlt} | ${r.h1} | ${r.pageErrors.length} | ${r.consoleErrors.length} | ${r.failedRequests.length} | ${r.critical ? "❌ FAIL" : "✅ pass"} |`),
  ``,
  `## Details`,
  ...rows.filter((r) => r.critical || r.tooSmall.length || r.tinyText.length || r.consoleErrors.length || r.failedRequests.length).map((r) => [
    `### ${new URL(r.url).pathname} — ${r.viewport}/${r.theme}`,
    r.offenders.length ? `- Overflowing: ${r.offenders.join("; ")}` : null,
    r.tooSmall.length ? `- Small targets: ${r.tooSmall.join("; ")}` : null,
    r.tinyText.length ? `- Tiny text: ${r.tinyText.join("; ")}` : null,
    r.pageErrors.length ? `- Page errors: ${r.pageErrors.join("; ")}` : null,
    r.consoleErrors.length ? `- Console errors: ${r.consoleErrors.join("; ")}` : null,
    r.failedRequests.length ? `- Failed requests: ${r.failedRequests.join("; ")}` : null,
    `- Screenshot: \`${r.screenshot}\``,
  ].filter(Boolean).join("\n")),
].join("\n");
fs.writeFileSync(path.join(outDir, "responsive-results.md"), md + "\n");
console.log(`\n${critical ? `✖ ${critical} critical` : "✓ no critical issues"} — ${path.join(outDir, "responsive-results.md")}`);
process.exit(critical ? 1 : 0);
