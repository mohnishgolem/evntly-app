import { SITE_URL } from "@/lib/config";

// Share profile: a vendor shares their live listing as an Instagram Story
// (1080 × 1920) or a profile card with a QR code (1080 × 1350). Pure helpers,
// used by the dashboard, the artwork renderer, the proxy and /api/track.

/**
 * Where a visit to a vendor page came from when it arrived through Share
 * profile (?src= on /vendor/<id>, the same tag the founding links use).
 * Keep in sync with page_views_source_check and quote_requests.share_source.
 */
export const SHARE_SOURCES = ["share_story", "share_link", "share_qr"] as const;
export type ShareSource = (typeof SHARE_SOURCES)[number];

export function isShareSource(value: unknown): value is ShareSource {
  return SHARE_SOURCES.includes(value as ShareSource);
}

/** Cookie (path /vendor/<id>) that carries a share visit to the quote request. */
export const SHARE_SOURCE_COOKIE = "evntly_share_src";
export const SHARE_SOURCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** The public listing link a share action hands out, tagged with its source. */
export function shareProfileUrl(vendorId: string, source: ShareSource, base = SITE_URL) {
  const url = new URL(`/vendor/${encodeURIComponent(vendorId)}`, base);
  url.searchParams.set("src", source);
  return url.toString();
}

/** For the proxy: the share source of a /vendor/<id>?src=share_* page load, else null. */
export function shareSourceFromUrl(url: URL): { vendorId: string; source: ShareSource } | null {
  const source = url.searchParams.get("src");
  if (!isShareSource(source)) return null;
  const match = url.pathname.match(/^\/vendor\/([0-9a-f-]{36})$/);
  return match ? { vendorId: match[1], source } : null;
}

/**
 * The share visit a sign-up started from, read from its return path
 * (?next=/vendor/<id>?book=1&src=share_qr — see BookVendor). Server-side and
 * cookie-free, so it holds even when the cookie never reached this request.
 */
export function shareFromNext(next: string | null | undefined): { vendorId: string; source: ShareSource } | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  try {
    return shareSourceFromUrl(new URL(next, "https://evntly.invalid"));
  } catch {
    return null;
  }
}

/**
 * A vendor got a share ready: saved or copied artwork or a link. This shows
 * intent to share, never that anything was posted. Which channel it feeds
 * follows the link it carries: Story → share_story; card link or Share →
 * share_link; the saved card image carries the QR code → share_qr.
 */
export const SHARE_PREPARED_ACTIONS = ["story_save", "story_copy", "card_copy", "card_share", "card_save"] as const;
export type SharePreparedAction = (typeof SHARE_PREPARED_ACTIONS)[number];
export function preparedSource(action: SharePreparedAction): ShareSource {
  if (action.startsWith("story_")) return "share_story";
  return action === "card_save" ? "share_qr" : "share_link";
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/**
 * Portfolio items a canvas can draw: images only, never HEIC (browsers can't
 * show it). The same rule the database uses for listing covers
 * (listing_portfolio_cover_urls), so the share default is the card's cover.
 */
export function isDisplayablePortfolioImage(item: { media_type?: string | null; media_url?: string | null }) {
  return item.media_type === "image" && !!item.media_url && !/\.heic($|[?#])/i.test(item.media_url);
}

export type SharePhoto = { url: string; kind: "portfolio" | "avatar" };

/**
 * The photos a vendor can pick from, in the listing's order: displayable
 * portfolio images first, then the profile photo. The first one is the
 * default (the listing card's own rule, see listingCoverUrl); none at all
 * means the Evntly-branded fallback.
 */
export function sharePhotoOptions(portfolio: { media_type?: string | null; media_url?: string | null }[], avatarUrl?: string | null) {
  const out: SharePhoto[] = [];
  for (const item of portfolio) {
    if (isDisplayablePortfolioImage(item) && !out.some((p) => p.url === item.media_url)) out.push({ url: item.media_url!, kind: "portfolio" });
  }
  if (avatarUrl && !out.some((p) => p.url === avatarUrl)) out.push({ url: avatarUrl, kind: "avatar" });
  return out;
}

const PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

/**
 * A copy of a Supabase Storage photo at most `width` px wide, aspect ratio
 * kept (Supabase image transformations). Big enough for a 1080 px export
 * without shipping a 10 MB original to the phone. Other URLs are unchanged.
 */
export function shareImageUrl(url: string, width: number) {
  const i = url.indexOf(PUBLIC_OBJECT_PATH);
  if (i === -1 || !url.startsWith("https://") || url.includes("?")) return url;
  return `${url.slice(0, i)}${RENDER_PATH}${url.slice(i + PUBLIC_OBJECT_PATH.length)}?width=${width}&quality=85`;
}

// ---------------------------------------------------------------------------
// Formats and crop
// ---------------------------------------------------------------------------

export type ShareFormat = "story" | "card";

export const SHARE_FORMATS: Record<ShareFormat, { width: number; height: number; photo: { x: number; y: number; w: number; h: number } }> = {
  // Full-height photo.
  story: { width: 1080, height: 1920, photo: { x: 0, y: 0, w: 1080, h: 1920 } },
  // One large photo above a white footer.
  card: { width: 1080, height: 1350, photo: { x: 0, y: 0, w: 1080, h: 920 } },
};

/**
 * Where Instagram's link sticker goes on the Story: a clear band below the
 * middle, above the vendor details. Nothing is drawn here except the photo.
 */
export const STORY_STICKER_ZONE = { x: 140, y: 1130, w: 800, h: 260 };

/**
 * The crop of one photo in one format: `zoom` ≥ 1 on top of "cover", and the
 * focus point (0–1 on each axis) that decides which part of the photo shows.
 */
export type ShareCrop = { zoom: number; fx: number; fy: number };
export const DEFAULT_CROP: ShareCrop = { zoom: 1, fx: 0.5, fy: 0.5 };
export const MAX_ZOOM = 3;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function clampCrop(c: ShareCrop): ShareCrop {
  return { zoom: clamp(Number.isFinite(c.zoom) ? c.zoom : 1, 1, MAX_ZOOM), fx: clamp(c.fx, 0, 1), fy: clamp(c.fy, 0, 1) };
}

/**
 * Where to draw an image of `iw` × `ih` so it covers the `w` × `h` frame at
 * this crop. Preview and export both use it, so they always match.
 */
export function coverRect(iw: number, ih: number, w: number, h: number, crop: ShareCrop) {
  const c = clampCrop(crop);
  const scale = Math.max(w / iw, h / ih) * c.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  return { x: (w - dw) * c.fx, y: (h - dh) * c.fy, w: dw, h: dh };
}

/**
 * The crop after dragging the photo by (dx, dy) frame pixels: the focus
 * moves the opposite way, by the share of the overflow that was dragged.
 */
export function panCrop(crop: ShareCrop, dx: number, dy: number, iw: number, ih: number, w: number, h: number): ShareCrop {
  const r = coverRect(iw, ih, w, h, crop);
  const overX = r.w - w;
  const overY = r.h - h;
  return clampCrop({
    zoom: crop.zoom,
    fx: overX > 0 ? crop.fx - dx / overX : crop.fx,
    fy: overY > 0 ? crop.fy - dy / overY : crop.fy,
  });
}

/** File names for the exports, e.g. sara-louise-photography-evntly-story.jpg. */
export function shareFileName(vendorName: string, format: ShareFormat) {
  const slug = vendorName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "evntly";
  return `${slug}-evntly-${format === "story" ? "story" : "profile-card"}.jpg`;
}
