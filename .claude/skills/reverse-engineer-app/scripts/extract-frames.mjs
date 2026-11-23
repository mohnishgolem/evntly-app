#!/usr/bin/env node
// Extract still frames from a screen recording Sai made (screenshot mode), using the
// installed Chrome's video decoder: no ffmpeg needed. Writes frame-<seconds>.png files.
//
// Usage: node extract-frames.mjs <video.mp4|.mov|.webm> --out <dir> [--every 2] [--max 60] [--width 430]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, die, loadPlaywright, ensureDir } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const video = args._[0];
if (!video || !args.out) die("Usage: extract-frames.mjs <video> --out <dir> [--every 2] [--max 60]");
if (!fs.existsSync(video)) die(`Not found: ${video}`);
const every = Number(args.every || 2);
const max = Number(args.max || 60);
const width = Number(args.width || 430);
const outDir = ensureDir(path.resolve(args.out));

const html = path.join(outDir, ".player.html");
fs.writeFileSync(html, `<!doctype html><body style="margin:0;background:#000"><video id="v" muted playsinline preload="auto" style="display:block;width:${width}px" src="${pathToFileURL(path.resolve(video)).href}"></video></body>`);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(html).href);
const meta = await page.evaluate(() => new Promise((ok) => {
  const v = document.getElementById("v");
  const done = () => ok({ duration: v.duration, w: v.videoWidth, h: v.videoHeight, error: v.error ? v.error.code : null });
  if (v.readyState >= 1) done(); else { v.onloadedmetadata = done; v.onerror = done; }
  setTimeout(done, 15000);
}));
if (meta.error || !meta.duration || !isFinite(meta.duration)) {
  await browser.close();
  die(`Chrome could not decode this video (error ${meta.error}). Try exporting it as H.264 MP4.`);
}
console.log(`video ${meta.w}x${meta.h}, ${meta.duration.toFixed(1)}s`);
const el = page.locator("#v");
const times = [];
for (let t = 0; t < meta.duration && times.length < max; t += every) times.push(t);
if (meta.duration - times.at(-1) > every / 2 && times.length < max) times.push(Math.max(0, meta.duration - 0.1));
for (const t of times) {
  await page.evaluate((t) => new Promise((ok) => { const v = document.getElementById("v"); v.onseeked = () => requestAnimationFrame(() => ok()); v.currentTime = t; }), t);
  await el.screenshot({ path: path.join(outDir, `frame-${t.toFixed(1).padStart(6, "0")}s.png`) });
}
await browser.close();
fs.unlinkSync(html);
console.log(`✓ ${times.length} frames → ${outDir}`);
