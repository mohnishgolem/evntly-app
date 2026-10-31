import { SITE_URL } from "@/lib/config";

// Where a founding-vendor applicant came from. Stored on the application
// (beta_applications.source) — no other tracking, no personal data.
export const FOUNDING_SOURCES = [
  { value: "instagram_bio", label: "Instagram bio", utm: { source: "instagram", medium: "bio" } },
  { value: "instagram_story", label: "Instagram Stories", utm: { source: "instagram", medium: "story" } },
  { value: "instagram_dm", label: "Instagram DMs", utm: { source: "instagram", medium: "dm" } },
  { value: "waitlist_email", label: "Waitlist email", utm: { source: "waitlist", medium: "email" } },
  { value: "direct_outreach", label: "Direct outreach", utm: { source: "outreach", medium: "direct" } },
  { value: "direct", label: "Direct / other", utm: null },
] as const;

export type FoundingSource = (typeof FOUNDING_SOURCES)[number]["value"];

export const FOUNDING_CAMPAIGN = "founding_vendors";
export const FOUNDING_PATH = "/founding-vendors";
export const CLAIM_PATH = "/founding-vendors/claim";

/** Cookie that remembers the source between the landing page and claiming. */
export const SOURCE_COOKIE = "evntly_fv_src";

export function isFoundingSource(value: unknown): value is FoundingSource {
  return FOUNDING_SOURCES.some((s) => s.value === value);
}

export function sourceLabel(value: string) {
  return FOUNDING_SOURCES.find((s) => s.value === value)?.label ?? value;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() ?? "";

/** Maps ?utm_source=&utm_medium= (or ?src=<source>) to a known source, else null. */
export function sourceFromParams(params: Params): FoundingSource | null {
  const src = first(params.src);
  if (isFoundingSource(src)) return src;
  const source = first(params.utm_source);
  const medium = first(params.utm_medium);
  if (!source) return null;
  if (source === "instagram" || source === "ig") {
    if (medium.startsWith("story") || medium === "stories") return "instagram_story";
    if (medium === "dm" || medium === "dms") return "instagram_dm";
    return "instagram_bio";
  }
  if (source === "waitlist" || (medium === "email" && source !== "outreach")) return "waitlist_email";
  if (source === "outreach") return "direct_outreach";
  return "direct";
}

/** Shareable landing-page link for a source, with UTM tags. */
export function foundingShareLink(source: FoundingSource, base = SITE_URL) {
  const entry = FOUNDING_SOURCES.find((s) => s.value === source);
  const url = new URL(FOUNDING_PATH, base);
  if (entry?.utm) {
    url.searchParams.set("utm_source", entry.utm.source);
    url.searchParams.set("utm_medium", entry.utm.medium);
    url.searchParams.set("utm_campaign", FOUNDING_CAMPAIGN);
  }
  return url.toString();
}

/** True for paths under /founding-vendors — vendors signing up from there return to it. */
export function isFoundingPath(path: string | null | undefined) {
  return !!path && (path === FOUNDING_PATH || path.startsWith(`${FOUNDING_PATH}/`) || path.startsWith(`${FOUNDING_PATH}?`));
}
