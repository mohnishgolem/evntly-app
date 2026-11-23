#!/usr/bin/env node
// Create docs/reverse-engineering/<host>-<YYYY-MM-DD>/ with the five report templates and a
// captures/ folder. The whole analysis folder is gitignored. Never overwrites existing report files.
//
// Usage: node init-analysis.mjs <url> [--focus "vendor onboarding"] [--root docs/reverse-engineering]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parseArgs, die, ensureDir, slug } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const url = args._[0];
if (!url || !/^https?:\/\//.test(url)) die("Usage: init-analysis.mjs <http(s) url> [--focus text]");
const host = new URL(url).hostname.replace(/^www\./, "");

let repoRoot = process.cwd();
try { repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || repoRoot; } catch { /* git unavailable: use cwd */ }
const root = path.resolve(repoRoot, args.root || "docs/reverse-engineering");
const date = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }); // YYYY-MM-DD
const dir = ensureDir(path.join(root, `${slug(host)}-${date}`));
ensureDir(path.join(dir, "captures"));
// The whole folder stays out of git: captures are competitor material, and
// reports can quote Evntly's production numbers (the repo is public).
fs.writeFileSync(path.join(dir, ".gitignore"), "# Analysis stays local: competitor captures and internal figures. Never commit.\n*\n");

const tplDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");
const vars = { URL: url, HOST: host, DATE: date, FOCUS: args.focus || "general" };
const created = [], kept = [];
for (const f of fs.readdirSync(tplDir).filter((f) => f.endsWith(".md"))) {
  const dest = path.join(dir, f);
  if (fs.existsSync(dest)) { kept.push(f); continue; }
  fs.writeFileSync(dest, fs.readFileSync(path.join(tplDir, f), "utf8").replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m));
  created.push(f);
}
console.log(dir);
console.error(`created: ${created.join(", ") || "none"}${kept.length ? `; kept existing: ${kept.join(", ")}` : ""}`);
