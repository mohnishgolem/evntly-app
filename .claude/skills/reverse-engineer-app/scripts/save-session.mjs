#!/usr/bin/env node
// For accounts Sai OWNS only. Opens a visible Chrome at the login page; Sai types the
// credentials and logs in; closing the window ends the session. Cookies/localStorage are
// saved after every navigation to ~/.claude/reverse-engineer-app/sessions/<name>.json (0600).
// The script never reads, prints or types credentials.
//
// Usage: node save-session.mjs <login url> --name <site-name>
import fs from "node:fs";
import path from "node:path";
import { SESSION_DIR, parseArgs, die, loadPlaywright, launchChrome, ensureDir, slug } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const url = args._[0];
if (!url || !args.name) die("Usage: save-session.mjs <login url> --name <site-name>");
ensureDir(SESSION_DIR);
fs.chmodSync(SESSION_DIR, 0o700);
const file = path.join(SESSION_DIR, `${slug(args.name)}.json`);

const { chromium } = await loadPlaywright();
const browser = await launchChrome(chromium, { headed: true });
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
const save = async () => {
  try { await ctx.storageState({ path: file }); fs.chmodSync(file, 0o600); } catch { /* context closing */ }
};
page.on("framenavigated", (f) => f === page.mainFrame() && save());
await page.goto(url);
console.log("Log in in the Chrome window (you type the credentials). Close the window when you're signed in.");
await new Promise((r) => { page.on("close", r); browser.on("disconnected", r); });
await save();
await browser.close().catch(() => {});
console.log(`Saved session → ${file}\nUse with: capture.mjs <url> --session ${slug(args.name)}\nDelete it when finished: rm "${file}"`);
