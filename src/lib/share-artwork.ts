import QRCode from "qrcode";
import { coverRect, SHARE_FORMATS, type ShareCrop, type ShareFormat } from "@/lib/share-profile";

// Draws the Share profile artwork on a canvas. The dashboard preview and the
// exported file come from this one function at the same 1080 px size (the
// preview is the same canvas, scaled down by CSS), so they can't differ.

export type ArtworkDetails = {
  name: string;
  category: string;
  area: string;
  /** Profile card only: what the QR code opens. */
  qrUrl?: string;
};

const CORAL = "#e8604a";
const INK = "#1d1d1f";
const MUTED = "#5f5f66";
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

/** A small map pin, drawn so it never depends on an emoji font. */
function pin(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s * 0.38, s * 0.38, Math.PI, 0);
  ctx.lineTo(x + s / 2, y + s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s * 0.38, s * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
  const areaBaseline = 1700;
  const nameLast = areaBaseline - 70;
  const nameFirst = nameLast - lineH * (name.lines.length - 1);
  const pillTop = nameFirst - name.size - 40 - 58;

  pill(ctx, d.category, 72, pillTop, 30);

  ctx.fillStyle = "#fff";
  ctx.font = `800 ${name.size}px ${SANS}`;
  name.lines.forEach((l, i) => ctx.fillText(l, 72, nameFirst + i * lineH));

  pin(ctx, 72, areaBaseline - 36, 38, CORAL);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `600 42px ${SANS}`;
  ctx.fillText(d.area, 124, areaBaseline);
}

function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, box: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const m = Math.floor(box / n); // whole pixels per module keep the edges sharp
  const size = m * n;
  const ox = x + Math.floor((box - size) / 2);
  const oy = y + Math.floor((box - size) / 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(ox - m * 4, oy - m * 4, size + m * 8, size + m * 8); // quiet zone
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) ctx.fillRect(ox + c * m, oy + r * m, m, m);
  }
}

function drawCard(ctx: CanvasRenderingContext2D, d: ArtworkDetails) {
  const top = SHARE_FORMATS.card.photo.h;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, top, 1080, 1350 - top);
  ctx.fillStyle = CORAL;
  ctx.fillRect(0, top, 1080, 8);

  // QR on the right, details on the left.
  const qrBox = 252;
  const qrX = 1080 - 60 - qrBox;
  const qrY = top + 8 + Math.round((1350 - top - 8 - qrBox) / 2);
  if (d.qrUrl) drawQr(ctx, d.qrUrl, qrX, qrY, qrBox);

  const left = 64;
  const maxW = qrX - left - 48;
  const name = fitText(ctx, d.name, maxW, 2, [64, 58, 52, 46, 40]);
  const lineH = Math.round(name.size * 1.1);
  let y = top + 8 + 40 + name.size;
  ctx.fillStyle = INK;
  ctx.font = `800 ${name.size}px ${SANS}`;
  name.lines.forEach((l, i) => ctx.fillText(l, left, y + i * lineH));
  y += lineH * (name.lines.length - 1) + 50;

  ctx.font = `700 30px ${SANS}`;
  ctx.fillStyle = CORAL;
  const cat = d.category.toUpperCase();
  ctx.fillText(cat, left, y);
  const catW = ctx.measureText(cat).width;
  ctx.fillStyle = MUTED;
  ctx.font = `500 32px ${SANS}`;
  const area = wrap(ctx, `· ${d.area}`, maxW - catW - 10, 1)[0];
  ctx.fillText(area, left + catW + 10, y);

  // Call to action, and the wordmark at the bottom.
  ctx.fillStyle = INK;
  ctx.font = `600 29px ${SANS}`;
  const cta = wrap(ctx, "Scan to view profile & request a quote.", maxW, 2);
  const ctaY = 1350 - 104 - (cta.length - 1) * 36;
  cta.forEach((l, i) => ctx.fillText(l, left, ctaY + i * 36));
  ctx.fillStyle = CORAL;
  ctx.font = `48px ${logoFamily()}`;
  ctx.fillText("Evntly", left, 1350 - 40);
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
