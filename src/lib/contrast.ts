// WCAG 2.2 colour contrast (relative luminance, sRGB). Pure functions so the
// brand tokens in globals.css can be checked by tests.
// https://www.w3.org/TR/WCAG22/#dfn-relative-luminance

export type Rgba = { r: number; g: number; b: number; a: number };

/** Parses #rgb, #rrggbb, rgb(r, g, b) and rgba(r, g, b, a). */
export function parseColor(input: string): Rgba {
  const s = input.trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const fn = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (fn) return { r: +fn[1], g: +fn[2], b: +fn[3], a: fn[4] === undefined ? 1 : +fn[4] };
  throw new Error(`Unsupported colour: ${input}`);
}

/** Paints `top` (may be translucent) over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

function channel(v: number) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgba | string): number {
  const c = typeof color === "string" ? parseColor(color) : color;
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** Contrast ratio between two opaque colours, from 1 to 21. */
export function contrastRatio(a: Rgba | string, b: Rgba | string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Text at least 24px, or at least 18.66px bold (700+), needs only 3:1. */
export function isLargeText(px: number, weight: number): boolean {
  return px >= 24 || (px >= 18.66 && weight >= 700);
}

export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_NON_TEXT = 3;
