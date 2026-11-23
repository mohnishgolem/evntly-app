// Shared helpers for reverse-engineer-app scripts.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  tablet: { viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

export const SESSION_DIR = path.join(os.homedir(), ".claude", "reverse-engineer-app", "sessions");

/** Minimal flag parser: positional args + --key value / --flag. */
export function parseArgs(argv, booleans = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (booleans.includes(key)) out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

export function die(msg, code = 1) {
  console.error(`✖ ${msg}`);
  process.exit(code);
}

export async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    die(`playwright-core is not installed. Run: bash ${path.dirname(new URL(import.meta.url).pathname)}/setup.sh`);
  }
}

export async function launchChrome(chromium, { headed = false } = {}) {
  try {
    return await chromium.launch({ channel: "chrome", headless: !headed });
  } catch (e) {
    die(`Could not launch Google Chrome (${e.message.split("\n")[0]}). Install Chrome or run doctor.mjs.`);
  }
}

export function isLocal(u) {
  const h = new URL(u).hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost") || h.endsWith(".test");
}

export function slug(s) {
  return String(s).toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";
}

export function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Strip query values (keep keys) and fragments so captures don't store tokens/PII. */
export function redactUrl(u) {
  try {
    const url = new URL(u);
    const keys = [...url.searchParams.keys()];
    url.search = keys.length ? "?" + [...new Set(keys)].map((k) => `${k}=…`).join("&") : "";
    url.hash = "";
    return url.toString();
  } catch {
    return String(u).split("?")[0];
  }
}

/**
 * robots.txt check for User-agent: * (longest-match Allow/Disallow, * and $ wildcards).
 * Returns { allowed, crawlDelay, rule, robotsUrl, status }.
 */
export async function checkRobots(targetUrl) {
  const u = new URL(targetUrl);
  const robotsUrl = `${u.origin}/robots.txt`;
  let text = "";
  let status;
  try {
    const res = await fetch(robotsUrl, { redirect: "follow", signal: AbortSignal.timeout(10000) });
    status = res.status;
    if (res.status >= 400 && res.status < 500) return { allowed: true, crawlDelay: null, rule: "no robots.txt (4xx)", robotsUrl, status };
    if (!res.ok) return { allowed: false, crawlDelay: null, rule: `robots.txt returned ${res.status} — treat as disallowed`, robotsUrl, status };
    text = await res.text();
  } catch (e) {
    return { allowed: false, crawlDelay: null, rule: `robots.txt unreachable (${e.message}) — treat as disallowed`, robotsUrl, status };
  }
  // Parse groups.
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!lastWasAgent) groups.push((cur = { agents: [], rules: [], crawlDelay: null }));
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (field === "allow" || field === "disallow") cur.rules.push({ type: field, path: value });
      if (field === "crawl-delay") cur.crawlDelay = Number(value) || null;
    }
  }
  // Evaluate the "*" group plus any Claude/Anthropic-specific groups; the strictest wins.
  const AGENTS = ["*", "claudebot", "claude-user", "claude-searchbot", "anthropic-ai"];
  const relevant = groups.filter((g) => g.agents.some((a) => AGENTS.includes(a)));
  const p = u.pathname + u.search;
  let verdict = { allowed: true, rule: "no matching rule", crawlDelay: null };
  for (const g of relevant) {
    let best = null;
    for (const r of g.rules) {
      if (r.type === "disallow" && r.path === "") continue;
      const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
      if (re.test(p) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === "allow"))) best = r;
    }
    const who = g.agents.filter((a) => AGENTS.includes(a)).join(",");
    if (g.crawlDelay) verdict.crawlDelay = Math.max(verdict.crawlDelay || 0, g.crawlDelay);
    if (best && best.type === "disallow") verdict = { ...verdict, allowed: false, rule: `[${who}] disallow: ${best.path}` };
    else if (best && verdict.allowed) verdict.rule = `[${who}] allow: ${best.path}`;
  }
  return { ...verdict, robotsUrl, status };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
