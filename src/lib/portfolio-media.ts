// Portfolio files live in the public "portfolio" bucket at
// "<ownerUserId>/<providerId>/<uuid>.<ext>". Raster images and short videos
// only — no SVG/HTML (they can carry script and the bucket is public).
// Keep in sync with the bucket's allowed_mime_types and file_size_limit.

export const PORTFOLIO_BUCKET = "portfolio";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const MAX_PORTFOLIO_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PORTFOLIO_VIDEO_BYTES = 50 * 1024 * 1024;
export const PORTFOLIO_ACCEPT = Object.keys(EXT_BY_TYPE).join(",");

export type PortfolioMediaType = "image" | "video";

export function portfolioMediaType(mime: string): PortfolioMediaType | null {
  if (!(mime in EXT_BY_TYPE)) return null;
  return mime.startsWith("video/") ? "video" : "image";
}

/** Returns an error message, or null if the file can be uploaded. */
export function portfolioFileError(file: { type: string; size: number }) {
  const kind = portfolioMediaType(file.type);
  if (!kind) return "Upload a photo (JPG, PNG, WEBP, GIF, HEIC) or a video (MP4, WEBM, MOV).";
  if (kind === "image" && file.size > MAX_PORTFOLIO_IMAGE_BYTES) return "That photo is over 10 MB.";
  if (kind === "video" && file.size > MAX_PORTFOLIO_VIDEO_BYTES) {
    return "That video is over 50 MB. Trim it to a short clip and try again.";
  }
  return null;
}

export function portfolioPath(userId: string, providerId: string, mime: string) {
  return `${userId}/${providerId}/${crypto.randomUUID()}.${EXT_BY_TYPE[mime]}`;
}

/** The path must be a direct child of the caller's folder for this listing. */
export function isOwnPortfolioPath(path: string, userId: string, providerId: string, mime: string) {
  const prefix = `${userId}/${providerId}/`;
  const rest = path.slice(prefix.length);
  return (
    path.startsWith(prefix) &&
    /^[0-9a-f-]{36}\.[a-z0-9]+$/.test(rest) &&
    rest.endsWith(`.${EXT_BY_TYPE[mime]}`)
  );
}

/** The storage path inside the portfolio bucket for one of its public URLs. */
export function portfolioPathFromUrl(url: string) {
  const marker = `/storage/v1/object/public/${PORTFOLIO_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]);
  return path.includes("..") ? null : path;
}

const PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

/**
 * A small, square-cropped copy of a Supabase Storage image for cards and map
 * thumbnails (Supabase image transformations: a 4.6 MB portfolio photo comes
 * back at ~130 KB). Anything that isn't a Supabase public-storage URL (demo
 * avatars, external links) is returned unchanged.
 */
export function resizedImageUrl(url: string, size: number): string {
  const i = url.indexOf(PUBLIC_OBJECT_PATH);
  if (i === -1 || !url.startsWith("https://") || url.includes("?")) return url;
  const base = url.slice(0, i) + RENDER_PATH + url.slice(i + PUBLIC_OBJECT_PATH.length);
  return `${base}?width=${size}&height=${size}&resize=cover&quality=70`;
}

/**
 * The picture a listing card shows: the first portfolio photo (vendors'
 * work sells better than a logo, and most have no profile photo), else the
 * profile photo, else null for the category icon. `portfolio_urls` is kept in
 * sync by the database (migration 20261122090000_listing_portfolio_covers).
 */
export function listingCoverUrl(v: { portfolio_urls?: string[] | null; avatar_url?: string | null }, size: number) {
  const url = v.portfolio_urls?.find(Boolean) ?? v.avatar_url ?? null;
  return url ? resizedImageUrl(url, size) : null;
}
