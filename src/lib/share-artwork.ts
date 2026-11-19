import QRCode from "qrcode";
import { coverRect, SHARE_FORMATS, type ShareCrop, type ShareFormat } from "@/lib/share-profile";

// Draws the Share profile artwork on a canvas. The dashboard preview and the
// exported file come from this one function at the same 1080 px size (the
// preview is the same canvas, scaled down by CSS), so they can't differ.

export type ArtworkDetails = {
  name: string;
  category: string;
  /** Profile card only: what the QR code opens. */
  qrUrl?: string;
};

const CORAL = "#e8604a";
const INK = "#1d1d1f";
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';

/** The wordmark's font family (next/font hashes the name; see app/layout.tsx). */
function logoFamily() {
  if (typeof document === "undefined") return "cursive";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-logo").trim();
  return v || "cursive";
}

/** Waits for the wordmark font so the first export isn't drawn in a fallback face. */
export async function loadArtworkFonts() {
  try {
    await document.fonts.load(`64px ${logoFamily()}`, "Evntly");
    await document.fonts.ready;
  } catch {
    // The artwork still draws with a fallback font.
  }
}

/** Splits text into at most `maxLines` lines no wider than `maxW`, ellipsising the last. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= maxW || !line) {
      line = next;
    } else {
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines - 1) {
        line = words.slice(i).join(" ");
        break;
      }
    }
  }
  if (line) lines.push(line);
  const last = lines.length - 1;
  if (ctx.measureText(lines[last]).width > maxW) {
    let s = lines[last];
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    lines[last] = `${s.trimEnd()}…`;
  }
  return lines;
}

/** The largest size (from `sizes`) at which the text fits in `maxLines`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number, sizes: number[], weight = 700) {
  for (const size of sizes) {
    ctx.font = `${weight} ${size}px ${SANS}`;
    const lines = wrap(ctx, text, maxW, maxLines);
    if (!lines.some((l) => l.endsWith("…")) || size === sizes[sizes.length - 1]) return { size, lines };
  }
  return { size: sizes[sizes.length - 1], lines: [text] };
}

function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement | ImageBitmap | null, format: ShareFormat, crop: ShareCrop) {
  const { photo } = SHARE_FORMATS[format];
  ctx.save();
  ctx.beginPath();
  ctx.rect(photo.x, photo.y, photo.w, photo.h);
  ctx.clip();
  if (img && img.width > 0 && img.height > 0) {
    const r = coverRect(img.width, img.height, photo.w, photo.h, crop);
    ctx.drawImage(img, photo.x + r.x, photo.y + r.y, r.w, r.h);
  } else {
    // Evntly-branded fallback: coral, with the wordmark large and faint.
    const g = ctx.createLinearGradient(0, photo.y, photo.w, photo.y + photo.h);
    g.addColorStop(0, CORAL);
    g.addColorStop(1, "#b9412f");
    ctx.fillStyle = g;
    ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = `${Math.round(photo.w * 0.3)}px ${logoFamily()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Evntly", photo.x + photo.w / 2, photo.y + photo.h * 0.42);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}

function verticalShade(ctx: CanvasRenderingContext2D, y0: number, y1: number, from: number, to: number) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(0,0,0,${from})`);
  g.addColorStop(1, `rgba(0,0,0,${to})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, 1080, y1 - y0);
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.font = `700 ${size}px ${SANS}`;
  const label = text.toUpperCase();
  const padX = size * 0.75;
  const h = size * 1.9;
  const w = ctx.measureText(label).width + padX * 2;
  ctx.fillStyle = CORAL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + padX, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return h;
}

function drawStory(ctx: CanvasRenderingContext2D, d: ArtworkDetails) {
  // Shade top and bottom so the logo and details read on any photo.
  verticalShade(ctx, 0, 420, 0.45, 0);
  verticalShade(ctx, 1080, 1920, 0, 0.82);

  // Small logo, below Instagram's progress bar and account row.
  ctx.fillStyle = "#fff";
  ctx.font = `60px ${logoFamily()}`;
  ctx.fillText("Evntly", 72, 270);

  // Vendor details sit below the link-sticker space (STORY_STICKER_ZONE) and
  // above Instagram's reply bar.
  const name = fitText(ctx, d.name, 936, 2, [96, 88, 80, 72, 64]);
  const lineH = Math.round(name.size * 1.08);
  // No location: some vendors don't want it shown.
  const nameLast = 1690;
  const nameFirst = nameLast - lineH * (name.lines.length - 1);
  const pillTop = nameFirst - name.size - 40 - 58;

  pill(ctx, d.category, 72, pillTop, 30);

  ctx.fillStyle = "#fff";
  ctx.font = `800 ${name.size}px ${SANS}`;
  name.lines.forEach((l, i) => ctx.fillText(l, 72, nameFirst + i * lineH));
}

/**
 * The QR code as an Evntly tile: a white rounded card with a black outline,
 * rounded finder squares, joined rounded modules, the Evntly badge in the
 * middle and a "Scan for a quote" pill. Error correction Q (25%) covers the
 * badge, and at least ~5 modules of white stay around the code (quiet zone).
 * Returns the tile's height.
 */
export function drawQrTile(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number) {
  const border = 6;
  const pad = 26;
  const area = w - 2 * (border + pad);
  const qr = QRCode.create(text, { errorCorrectionLevel: "Q" });
  const n = qr.modules.size;
  const m = Math.floor(area / n); // whole pixels per module keep edges crisp
  const size = m * n;
  const pillH = 54;
  const h = border + pad + area + 14 + pillH + 18 + border;
  const ox = x + Math.round((w - size) / 2);
  const oy = y + border + pad + Math.round((area - size) / 2);

  // Tile.
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 46);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(x + border, y + border, w - 2 * border, h - 2 * border, 40);
  ctx.fill();

  // Centre badge: an odd number of modules wide, ~22% of the code.
  let L = Math.round(n * 0.22);
  if (L % 2 === 0) L += 1;
  const c0 = (n - L) / 2;
  const isFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const inBadge = (r: number, c: number) => r >= c0 - 1 && r < c0 + L + 1 && c >= c0 - 1 && c < c0 + L + 1;
  const dark = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && !!qr.modules.get(r, c) && !isFinder(r, c) && !inBadge(r, c);

  // Modules: each corner is rounded unless a neighbour joins it, so runs of
  // modules read as one soft shape.
  ctx.fillStyle = "#000";
  const rad = m * 0.5;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark(r, c)) continue;
      const up = dark(r - 1, c), down = dark(r + 1, c), left = dark(r, c - 1), right = dark(r, c + 1);
      ctx.beginPath();
      ctx.roundRect(ox + c * m, oy + r * m, m, m, [
        up || left ? 0 : rad,
        up || right ? 0 : rad,
        down || right ? 0 : rad,
        down || left ? 0 : rad,
      ]);
      ctx.fill();
    }
  }

  // Finder squares.
  for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const fx = ox + fc * m, fy = oy + fr * m;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(fx, fy, 7 * m, 7 * m, 2.2 * m);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect(fx + m, fy + m, 5 * m, 5 * m, 1.5 * m);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(fx + 2 * m, fy + 2 * m, 3 * m, 3 * m, 0.9 * m);
    ctx.fill();
  }

  // Evntly badge.
  const bs = L * m;
  const bx = ox + c0 * m, by = oy + c0 * m;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(bx, by, bs, bs, bs * 0.26);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fs = Math.round(bs * 0.36);
  ctx.font = `${fs}px ${logoFamily()}`;
  while (fs > 8 && ctx.measureText("Evntly").width > bs * 0.82) ctx.font = `${--fs}px ${logoFamily()}`;
  ctx.fillText("Evntly", bx + bs / 2, by + bs / 2 + fs * 0.06);

  // "Scan for a quote" pill with the coral scan corners.
  const px = x + border + 16, pw = w - 2 * (border + 16);
  const py = y + h - border - 18 - pillH;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(px, py, pw, pillH, pillH / 2);
  ctx.fill();
  ctx.font = `600 23px ${SANS}`;
  const label = "Scan for a quote";
  const icon = 24, gap = 12;
  const tw = ctx.measureText(label).width;
  const sx = px + (pw - (icon + gap + tw)) / 2;
  const iy = py + (pillH - icon) / 2;
  ctx.strokeStyle = CORAL;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  const k = 8;
  for (const [cx, cy, dx, dy] of [[sx, iy, 1, 1], [sx + icon, iy, -1, 1], [sx, iy + icon, 1, -1], [sx + icon, iy + icon, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * k);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * k, cy);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText(label, sx + icon + gap, py + pillH / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return h;
}

function drawCard(ctx: CanvasRenderingContext2D, d: ArtworkDetails) {
  const top = SHARE_FORMATS.card.photo.h;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, top, 1080, 1350 - top);
  ctx.fillStyle = CORAL;
  ctx.fillRect(0, top, 1080, 8);

  // QR tile on the right, details on the left.
  const tileW = 330;
  const tileX = 1080 - 52 - tileW;
  if (d.qrUrl) drawQrTile(ctx, d.qrUrl, tileX, top + 8 + 12, tileW); // 390 px tall, fits the 430 px footer

  // Details on the left, laid out top to bottom so nothing can overlap:
  // name (1–2 lines), category, call to action (no location). The QR tile
  // carries the Evntly badge. A two-line name uses a smaller size.
  const left = 64;
  const maxW = tileX - left - 44;
  let name = fitText(ctx, d.name, maxW, 2, [62, 56, 50]);
  if (name.lines.length > 1) name = fitText(ctx, d.name, maxW, 2, [46, 42, 38]);
  const lineH = Math.round(name.size * 1.1);
  let y = top + 8 + 60 + name.size;
  ctx.fillStyle = INK;
  ctx.font = `800 ${name.size}px ${SANS}`;
  name.lines.forEach((l, i) => ctx.fillText(l, left, y + i * lineH));
  y += lineH * (name.lines.length - 1) + 44;

  ctx.font = `700 28px ${SANS}`;
  ctx.fillStyle = CORAL;
  const cat = d.category.toUpperCase();
  ctx.fillText(wrap(ctx, cat, maxW, 1)[0], left, y);

  // Call to action (up to two lines) under the details.
  ctx.fillStyle = INK;
  ctx.font = `600 30px ${SANS}`;
  wrap(ctx, "Scan to view profile & request a quote.", maxW, 2).forEach((l, i) => ctx.fillText(l, left, y + 64 + i * 40));
}

/** Draws the whole artwork for a format onto a canvas sized to it. */
export function drawArtwork(
  canvas: HTMLCanvasElement,
  format: ShareFormat,
  img: HTMLImageElement | ImageBitmap | null,
  crop: ShareCrop,
  details: ArtworkDetails
) {
  const { width, height } = SHARE_FORMATS[format];
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#101014";
  ctx.fillRect(0, 0, width, height);
  drawPhoto(ctx, img, format, crop);
  if (format === "story") drawStory(ctx, details);
  else drawCard(ctx, details);
}

/** The canvas as a JPEG file (Instagram and Photos re-encode anyway). */
export function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(new File([blob], name, { type: "image/jpeg" })) : reject(new Error("export_failed"))), "image/jpeg", 0.92);
  });
}

/** Loads a photo for drawing; CORS-enabled so the canvas can be exported. */
export function loadArtworkImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_failed"));
    img.src = url;
  });
}
