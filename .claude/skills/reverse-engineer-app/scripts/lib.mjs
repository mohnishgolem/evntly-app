// Shared helpers for reverse-engineer-app scripts.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

// ---------------------------------------------------------------------------
// Evntly app checks run ONLY against evntly-isolated: a local dev server whose
// Supabase URL points at a closed loopback port, with no service-role key.
// Anything else (production, Vercel previews, evntly-dev on port 3000, which
// uses the production database) is refused. There is no fallback.

export const ISOLATED_PORT = 3100;
export const ISOLATED_SUPABASE_URL = "http://127.0.0.1:9";
/** Hosts that mean "connected to production". */
export const PRODUCTION_HOSTS = /(^|\.)supabase\.(co|in)$|(^|\.)evntlyapp\.com$|(^|\.)vercel\.app$/i;
const PRODUCTION_BACKEND_IN_CODE = /[a-z0-9-]+\.supabase\.(co|in)\b/i;

const refuse = (msg) => die(`${msg}\nStopping: Evntly checks never fall back to production or a production-connected server.`, 4);

/** The evntly-isolated entry in .claude/launch.json, checked to be really isolated. */
export function isolatedLaunchConfig(repoRoot) {
  const file = path.join(repoRoot, ".claude", "launch.json");
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8")).configurations?.find((c) => c.name === "evntly-isolated");
  } catch {
    return { ok: false, reason: `can't read ${file}` };
  }
  if (!config) return { ok: false, reason: "no \"evntly-isolated\" entry in .claude/launch.json (it is added by the vendor-onboarding PR, #84)" };
  const args = (config.runtimeArgs ?? []).map(String);
  const env = Object.fromEntries(args.filter((a) => /^[A-Z_]+=/.test(a)).map((a) => [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)]));
  if (env.NEXT_PUBLIC_SUPABASE_URL !== ISOLATED_SUPABASE_URL) return { ok: false, reason: `evntly-isolated must set NEXT_PUBLIC_SUPABASE_URL=${ISOLATED_SUPABASE_URL}` };
  if (env.SUPABASE_SERVICE_ROLE_KEY !== "") return { ok: false, reason: "evntly-isolated must blank SUPABASE_SERVICE_ROLE_KEY" };
  if (Number(config.port) !== ISOLATED_PORT) return { ok: false, reason: `evntly-isolated must use port ${ISOLATED_PORT}` };
  return { ok: true };
}

/**
 * The Supabase settings of the dev server listening on `port`, read from the
 * environment of the `next dev` process that owns it (Next renames its server
 * child, which hides that child's environment; the child inherits it). Returns
 * only what's needed for the decision; values are never printed. Null when it
 * can't be read, which callers treat as "not isolated".
 */
export function devServerSupabaseEnv(port) {
  let pid;
  try {
    pid = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split(/\s+/)[0];
  } catch {
    return null;
  }
  const readEnv = (p) => {
    const proc = `/proc/${p}/environ`;
    if (fs.existsSync(proc)) {
      const pairs = fs.readFileSync(proc).toString().split("\0").filter(Boolean);
      return { env: Object.fromEntries(pairs.map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)])), command: fs.readFileSync(`/proc/${p}/cmdline`).toString().replace(/\0/g, " ") };
    }
    const out = execFileSync("ps", ["-E", "-ww", "-o", "command=", "-p", p], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const get = (k) => out.match(new RegExp(`(?:^|\\s)${k}=(\\S*)`))?.[1];
    const names = [...out.matchAll(/(?:^|\s)([A-Z_][A-Z0-9_]{2,})=/g)].length;
    return names ? { env: { NEXT_PUBLIC_SUPABASE_URL: get("NEXT_PUBLIC_SUPABASE_URL"), SUPABASE_SERVICE_ROLE_KEY: get("SUPABASE_SERVICE_ROLE_KEY") }, command: out } : null;
  };
  try {
    for (let p = pid, i = 0; p && p !== "1" && i < 6; i++) {
      const seen = readEnv(p);
      if (seen && /\bnext\b.*\bdev\b/.test(seen.command)) {
        return { supabaseUrl: seen.env.NEXT_PUBLIC_SUPABASE_URL, serviceKeyEmpty: seen.env.SUPABASE_SERVICE_ROLE_KEY === "" };
      }
      p = execFileSync("ps", ["-o", "ppid=", "-p", p], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Exit (code 4) unless every URL is on a running, verified evntly-isolated
 * server: the launch.json entry is isolated, the `next dev` process on the
 * port was started with Supabase at the loopback URL and no service-role key,
 * and its client code references no hosted Supabase project.
 */
export async function assertIsolatedEvntly(urls, { repoRoot = findRepoRoot() } = {}) {
  for (const u of urls) {
    const url = new URL(u);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== String(ISOLATED_PORT)) {
      refuse(`Refusing ${u}: Evntly app checks run only on evntly-isolated (http://localhost:${ISOLATED_PORT}).`);
    }
  }
  const cfg = isolatedLaunchConfig(repoRoot);
  if (!cfg.ok) refuse(`evntly-isolated isn't available: ${cfg.reason}.`);

  const base = new URL(urls[0]).origin;
  let html;
  try {
    html = await (await fetch(`${base}/`, { signal: AbortSignal.timeout(90_000) })).text();
  } catch {
    refuse(`evntly-isolated isn't running at ${base}. Start it with preview_start name "evntly-isolated".`);
  }
  const live = devServerSupabaseEnv(ISOLATED_PORT);
  if (!live) refuse(`Couldn't read the settings of the dev server on port ${ISOLATED_PORT}, so it can't be confirmed as evntly-isolated.`);
  if (live.supabaseUrl !== ISOLATED_SUPABASE_URL || !live.serviceKeyEmpty) {
    refuse(`The dev server on port ${ISOLATED_PORT} wasn't started as evntly-isolated (its Supabase settings aren't the isolated ones). Stop it and start "evntly-isolated".`);
  }
  const scripts = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => s.startsWith("/_next/")))];
  for (const src of scripts.slice(0, 120)) {
    let js = "";
    try {
      js = await (await fetch(base + src, { signal: AbortSignal.timeout(30_000) })).text();
    } catch {
      continue;
    }
    if (PRODUCTION_BACKEND_IN_CODE.test(js)) refuse(`The server on ${base} is connected to a hosted Supabase project (found in ${src}). It is not evntly-isolated.`);
  }
  if (PRODUCTION_BACKEND_IN_CODE.test(html)) refuse(`The server on ${base} references a hosted Supabase project. It is not evntly-isolated.`);
  console.log(`isolation: verified evntly-isolated at ${base} (Supabase → ${ISOLATED_SUPABASE_URL}, no hosted project)`);
}

/** Block every request to production hosts from a Playwright context; returns the blocked list. */
export async function blockProduction(context) {
  const blocked = [];
  await context.route("**/*", (route) => {
    let host = "";
    try { host = new URL(route.request().url()).hostname; } catch { /* data: etc. */ }
    if (host && PRODUCTION_HOSTS.test(host)) {
      blocked.push(redactUrl(route.request().url()));
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  return blocked;
}

export function findRepoRoot(start = path.dirname(new URL(import.meta.url).pathname)) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, ".claude", "launch.json")) || fs.existsSync(path.join(dir, ".git"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}
