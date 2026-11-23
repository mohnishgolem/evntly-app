#!/usr/bin/env node
// Check the tools the skill depends on. Exit 1 if a hard requirement is missing.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findRepoRoot, isolatedLaunchConfig } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const checks = [];
const run = (cmd, a) => { try { return { ok: true, out: execFileSync(cmd, a, { stdio: ["ignore", "pipe", "pipe"], timeout: 15000 }).toString().trim() }; } catch (e) { return { ok: false, out: ((e.stderr || "") + (e.stdout || "")).toString().trim() || e.message }; } };
const add = (name, ok, detail, hard = false) => checks.push({ name, ok, detail, hard });

const major = Number(process.versions.node.split(".")[0]);
add("Node.js ≥ 20 (playwright-core 1.65.1)", major >= 20, process.version, true);

const chromePaths = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"];
const chrome = chromePaths.find((p) => fs.existsSync(p));
add("Google Chrome (used by Playwright channel 'chrome')", !!chrome, chrome || "not found — install Chrome", true);

const pw = path.join(here, "node_modules", "playwright-core", "package.json");
const want = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8")).dependencies["playwright-core"];
const have = fs.existsSync(pw) ? JSON.parse(fs.readFileSync(pw, "utf8")).version : null;
add(`playwright-core ${want} in scripts/`, have === want, have ? (have === want ? `v${have}` : `v${have} installed, ${want} pinned: run bash ${path.join(here, "setup.sh")}`) : `run: bash ${path.join(here, "setup.sh")}`, true);

// A real headless launch: catches a Chrome update the pinned Playwright can't drive.
if (have === want && chrome) {
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const version = browser.version();
    await browser.close();
    add("Chrome launches under Playwright", true, `Chrome ${version}`, true);
  } catch (e) {
    add("Chrome launches under Playwright", false, (e.message || String(e)).split("\n")[0], true);
  }
}

const iso = isolatedLaunchConfig(findRepoRoot());
add("evntly-isolated configured (needed only for Evntly app checks)", iso.ok, iso.ok ? "launch.json entry is isolated (Supabase → loopback, no service key)" : iso.reason);

const git = run("git", ["--version"]);
add("git (Phases 6–7)", git.ok, git.ok ? git.out : /xcodebuild -license/.test(git.out) ? "blocked: Xcode licence not accepted — run `sudo xcodebuild -license` in Terminal" : git.out.split("\n")[0]);
const gh = run("gh", ["auth", "status"]);
add("gh CLI authenticated (PRs)", gh.ok, gh.ok ? "authenticated" : (gh.out.split("\n")[0] || "not installed / not logged in"));

for (const c of checks) console.log(`${c.ok ? "✓" : c.hard ? "✖" : "!"} ${c.name}: ${c.detail}`);
const hardFail = checks.some((c) => c.hard && !c.ok);
console.log(hardFail ? "\nMissing hard requirements — capture/responsive scripts won't run." : "\nReady.");
process.exit(hardFail ? 1 : 0);
