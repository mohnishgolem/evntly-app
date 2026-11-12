// Meta Pixel: PREPARED, NOT ACTIVE.
//
// Three locks, all of which must open before anything loads:
//  1. META_PIXEL_PRIVACY_REVIEWED below is flipped to true in code, after the
//     privacy policy, cookie notice and consent wording are reviewed (it's a
//     code change on purpose, so it goes through a reviewed PR).
//  2. NEXT_PUBLIC_META_PIXEL_ID is set and NEXT_PUBLIC_META_PIXEL_ENABLED=true.
//  3. In the browser: the visitor has granted marketing consent (no consent
//     banner exists yet, so this is never true today) and Do Not Track /
//     Global Privacy Control are off.
// Events (once on): PageView, Lead (Claim click), CompleteRegistration
// (vendor account created). No email, name or other customer data is sent;
// advanced matching stays off.

export const META_PIXEL_PRIVACY_REVIEWED = false;

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

/** Server and client: is the pixel allowed to exist at all on this deploy? */
export function metaPixelConfigured(): boolean {
  return META_PIXEL_PRIVACY_REVIEWED && /^\d{10,20}$/.test(META_PIXEL_ID) && process.env.NEXT_PUBLIC_META_PIXEL_ENABLED === "true";
}

export const MARKETING_CONSENT_KEY = "evntly_marketing_consent";

/** Browser only: this visitor has said yes to marketing cookies, and hasn't opted out of tracking. */
export function hasMarketingConsent(): boolean {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return false;
    return localStorage.getItem(MARKETING_CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

export type MetaPixelEvent = "Lead" | "CompleteRegistration";

/** Fires a standard event if the pixel is loaded; otherwise does nothing. */
export function metaPixelTrack(event: MetaPixelEvent) {
  if (!metaPixelConfigured() || !hasMarketingConsent()) return;
  try {
    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
    fbq?.("track", event);
  } catch {
    // Never break the page for analytics.
  }
}

/** CSP additions, only when the pixel is configured. */
export const META_PIXEL_CSP = {
  script: "https://connect.facebook.net",
  connect: "https://www.facebook.com https://connect.facebook.net",
  img: "https://www.facebook.com",
};
