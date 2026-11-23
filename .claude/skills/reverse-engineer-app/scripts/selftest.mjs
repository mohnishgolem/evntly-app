#!/usr/bin/env node
// Self-test of the isolation guard: Evntly checks must refuse every target
// except a verified evntly-isolated server, with no fallback. Uses stand-in
// servers on port 3100 (no Next.js, no network, nothing touches Supabase).
// Port 3100 must be free. Exit 0 = all cases behaved; 1 = a case failed.
//
// Usage: node selftest.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ISOLATED_PORT, ISOLATED_SUPABASE_URL } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "re-selftest-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A repo root whose launch.json has a correct evntly-isolated entry.
const repo = path.join(tmp, "repo");
fs.mkdirSync(path.join(repo, ".claude"), { recursive: true });
const isolatedEntry = (url, key) => ({
  name: "evntly-isolated",
  runtimeExecutable: "env",
  runtimeArgs: [`NEXT_PUBLIC_SUPABASE_URL=${url}`, `SUPABASE_SERVICE_ROLE_KEY=${key}`, "npm", "run", "dev", "--", "-p", String(ISOLATED_PORT)],
  port: ISOLATED_PORT,
});
fs.writeFileSync(path.join(repo, ".claude", "launch.json"), JSON.stringify({ configurations: [isolatedEntry(ISOLATED_SUPABASE_URL, "")] }));
const badRepo = path.join(tmp, "bad");
fs.mkdirSync(path.join(badRepo, ".claude"), { recursive: true });
fs.writeFileSync(path.join(badRepo, ".claude", "launch.json"), JSON.stringify({ configurations: [isolatedEntry("https://example.supabase.co", "")] }));
const noRepo = path.join(tmp, "none");
fs.mkdirSync(path.join(noRepo, ".claude"), { recursive: true });
fs.writeFileSync(path.join(noRepo, ".claude", "launch.json"), JSON.stringify({ configurations: [] }));

// Stand-in dev server: one page and one script. "next dev" in its arguments
// makes it look like a Next dev process to the guard.
const fake = path.join(tmp, "fake.cjs");
fs.writeFileSync(
  fake,
  `const http=require("http");const js=process.argv[2];http.createServer((q,s)=>{if(q.url==="/")return s.end('<script src="/_next/static/chunks/app.js"></script>');if(q.url.startsWith("/_next/"))return s.end(js);s.statusCode=404;s.end();}).listen(${ISOLATED_PORT},"127.0.0.1");`
);

const guard = (url, root) =>
  spawnSync(process.execPath, ["--input-type=module", "-e", `import { assertIsolatedEvntly } from ${JSON.stringify(path.join(here, "lib.mjs"))}; await assertIsolatedEvntly([${JSON.stringify(url)}], { repoRoot: ${JSON.stringify(root)} });`], {
    encoding: "utf8",
  });

async function withServer(env, js, fn) {
  const child = spawn(process.execPath, [fake, js, "next", "dev"], { env: { PATH: process.env.PATH, ...env }, stdio: "ignore" });
  await sleep(700);
  try {
    return fn();
  } finally {
    child.kill();
    await sleep(200);
  }
}

const local = `http://localhost:${ISOLATED_PORT}/`;
const cases = [
  ["production site", () => guard("https://evntlyapp.com/", repo), 4],
  ["Vercel preview", () => guard("https://evntly-preview.vercel.app/", repo), 4],
  ["evntly-dev port 3000", () => guard("http://localhost:3000/", repo), 4],
  ["no evntly-isolated entry", () => guard(local, noRepo), 4],
  ["entry not isolated", () => guard(local, badRepo), 4],
  ["nothing running", () => guard(local, repo), 4],
  ["dev server using .env.local (production)", () => withServer({}, "x()", () => guard(local, repo)), 4],
  ["dev server with hosted Supabase", () => withServer({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "dummy" }, "x()", () => guard(local, repo)), 4],
  ["isolated env, hosted Supabase in client code", () => withServer({ NEXT_PUBLIC_SUPABASE_URL: ISOLATED_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "" }, 'x("https://example.supabase.co")', () => guard(local, repo)), 4],
  ["evntly-isolated", () => withServer({ NEXT_PUBLIC_SUPABASE_URL: ISOLATED_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "" }, "x()", () => guard(local, repo)), 0],
];

let failed = 0;
for (const [name, run, expected] of cases) {
  const res = await run();
  const ok = res.status === expected;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✖"} ${name}: exit ${res.status} (expected ${expected})`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n✖ ${failed} case(s) failed` : "\n✓ isolation guard: all cases behaved");
process.exit(failed ? 1 : 0);
