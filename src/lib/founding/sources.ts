import { SITE_URL } from "@/lib/config";

// Where a founding-vendor applicant came from. Stored on the application
// (beta_applications.source) — no other tracking, no personal data.
export const FOUNDING_SOURCES = [
  { value: "instagram_bio", label: "Instagram bio", utm: { source: "instagram", medium: "bio" } },
  { value: "instagram_story", label: "Instagram Stories", utm: { source: "instagram", medium: "story" } },
  { value: "instagram_dm", label: "Instagram DMs", utm: { source: "instagram", medium: "dm" } },
  { value: "waitlist_email", label: "Waitlist email", utm: { source: "waitlist", medium: "email" } },
  { value: "direct_outreach", label: "Direct outreach", utm: { source: "outreach", medium: "direct" } },
  { value: "meta_ads", label: "Meta ads (paid)", utm: { source: "meta", medium: "paid" } },
  { value: "referral", label: "Vendor referral", utm: null },
  { value: "direct", label: "Direct / other", utm: null },
] as const;

export type FoundingSource = (typeof FOUNDING_SOURCES)[number]["value"];

export const FOUNDING_CAMPAIGN = "founding_vendors";

/** Recruitment goal shown on the admin dashboard (approved Founding Vendors). */
export const FOUNDING_GOAL = 200;
export const FOUNDING_PATH = "/founding-vendors";
export const CLAIM_PATH = "/founding-vendors/claim";

/** Cookie that remembers the source between the landing page and claiming. */
export const SOURCE_COOKIE = "evntly_fv_src";
/** Cookie that remembers which post or link (?utm_content=) brought the visitor. */
export const CAMPAIGN_COOKIE = "evntly_fv_cmp";
/** Cookie that remembers a founding vendor's referral code (?ref=) until claiming. */
export const REF_COOKIE = "evntly_fv_ref";

/** Referral codes are 8–12 lowercase letters/digits (see the referrals migration). */
export function isReferralCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{8,12}$/.test(value);
}

/** The referral code from ?ref=, normalised, or null. */
export function referralFromParams(params: Record<string, string | string[] | undefined>): string | null {
  const raw = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const code = raw?.trim().toLowerCase();
  return isReferralCode(code) ? code : null;
}

/** An approved founding vendor's shareable invite link. */
export function referralLink(code: string, base = SITE_URL) {
  const url = new URL(FOUNDING_PATH, base);
  url.searchParams.set("ref", code);
  return url.toString();
}

/**
 * Campaign tags name the post or link a visitor came from (utm_content=reel-a-1117,
 * link_in_bio, dm-batch3). Lowercase letters, digits, "_" and "-", 1–40 chars.
 */
export function isCampaignTag(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(value);
}

/** The campaign tag from ?utm_content= (or the short ?c=), normalised, or null. */
export function campaignFromParams(params: Record<string, string | string[] | undefined>): string | null {
  for (const key of ["utm_content", "c"]) {
    const raw = params[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
    if (isCampaignTag(value)) return value;
  }
  return null;
}

/** A landing-page link for one post: its source plus a campaign tag. */
export function campaignLink(source: FoundingSource, campaign: string, base = SITE_URL) {
  if (!isCampaignTag(campaign)) throw new Error(`Invalid campaign tag: ${campaign}`);
  const url = new URL(FOUNDING_PATH, base);
  url.searchParams.set("src", source);
  url.searchParams.set("utm_content", campaign);
  return url.toString();
}

export function isFoundingSource(value: unknown): value is FoundingSource {
  return FOUNDING_SOURCES.some((s) => s.value === value);
}

export function sourceLabel(value: string) {
  return FOUNDING_SOURCES.find((s) => s.value === value)?.label ?? value;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() ?? "";

const PAID_MEDIUMS = new Set(["paid", "paid_social", "paidsocial", "cpc", "ppc", "ad", "ads", "boost"]);

/** Maps ?utm_source=&utm_medium= (or ?src=<source>) to a known source, else null. */
export function sourceFromParams(params: Params): FoundingSource | null {
  const src = first(params.src);
  if (isFoundingSource(src)) return src;
  if (referralFromParams(params)) return "referral";
  const source = first(params.utm_source);
  const medium = first(params.utm_medium);
  if (!source) return null;
  // Paid Instagram/Facebook traffic (boosts and Ads Manager) is its own source,
  // so ad spend can be judged on its own sign-ups.
  if (["meta", "facebook", "fb", "instagram", "ig"].includes(source) && PAID_MEDIUMS.has(medium)) return "meta_ads";
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
