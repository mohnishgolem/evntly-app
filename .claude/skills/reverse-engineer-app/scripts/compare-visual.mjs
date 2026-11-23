#!/usr/bin/env node
// Pixel diff two PNG screenshots (Evntly before vs after) using a headless Chrome canvas —
// no extra image libraries. Writes a diff PNG (changed pixels in coral over a faded "after").
//
// Usage: node compare-visual.mjs <before.png> <after.png> --out <diff.png>
//          [--threshold 0.1] [--max-diff 100]
// threshold: per-channel colour distance 0–1 that counts as "changed" (default 0.1).
// max-diff: exit 1 if % changed pixels exceeds this (default 100 = never fail).
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, loadPlaywright, launchChrome, ensureDir } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const [a, b] = args._;
if (!a || !b || !args.out) die("Usage: compare-visual.mjs <before.png> <after.png> --out <diff.png>");
for (const f of [a, b]) if (!fs.existsSync(f)) die(`Not found: ${f}`);
const threshold = Number(args.threshold ?? 0.1);
const maxDiff = Number(args["max-diff"] ?? 100);
const toUrl = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;

const { chromium } = await loadPlaywright();
const browser = await launchChrome(chromium);
const page = await browser.newPage();
const res = await page.evaluate(async ({ A, B, threshold }) => {
  const load = (src) => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = src; });
  const [ia, ib] = await Promise.all([load(A), load(B)]);
  const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
  const ctx = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
  const da = ctx(ia), db = ctx(ib);
  const out = new OffscreenCanvas(w, h);
  const ox = out.getContext("2d");
  const od = ox.createImageData(w, h);
  const t = threshold * 255;
  let changed = 0, minY = h, maxY = -1;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
    if (d > t) {
      changed++; od.data[i] = 232; od.data[i + 1] = 96; od.data[i + 2] = 74; od.data[i + 3] = 255;
      const y = Math.floor(i / 4 / w); if (y < minY) minY = y; if (y > maxY) maxY = y;
    } else {
      const g = (db[i] + db[i + 1] + db[i + 2]) / 3; od.data[i] = od.data[i + 1] = od.data[i + 2] = 255 - (255 - g) * 0.25; od.data[i + 3] = 255;
    }
  }
  ox.putImageData(od, 0, 0);
  const blob = await out.convertToBlob({ type: "image/png" });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { w, h, sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height], changed, pct: (changed / (w * h)) * 100, band: maxY >= 0 ? [minY, maxY] : null, png: btoa(bin) };
}, { A: toUrl(a), B: toUrl(b), threshold });
await browser.close();

ensureDir(path.dirname(path.resolve(args.out)));
fs.writeFileSync(args.out, Buffer.from(res.png, "base64"));
const sizeNote = res.sizeA.join("x") !== res.sizeB.join("x") ? ` (sizes differ: ${res.sizeA.join("x")} vs ${res.sizeB.join("x")}; compared top-left ${res.w}x${res.h})` : "";
const summary = { before: a, after: b, diff: args.out, comparedSize: `${res.w}x${res.h}`, changedPixels: res.changed, changedPercent: Number(res.pct.toFixed(3)), changedRows: res.band, sizeMismatch: !!sizeNote };
console.log(JSON.stringify(summary, null, 2));
console.log(`${res.pct > maxDiff ? "✖" : "✓"} ${res.pct.toFixed(3)}% pixels changed${sizeNote}${res.band ? `, rows ${res.band[0]}–${res.band[1]}` : ""}`);
process.exit(res.pct > maxDiff ? 1 : 0);
