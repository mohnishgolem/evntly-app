// Meta Pixel + Conversions API: built, OFF until switched on.
//
// Three locks, all of which must open before anything loads or is sent:
//  1. META_PIXEL_PRIVACY_REVIEWED below is true. It is flipped in the reviewed
//     PR that adds the ad-measurement consent banner and the privacy policy
//     paragraph about Meta measurement (merging that PR is the review).
//  2. NEXT_PUBLIC_META_PIXEL_ID is set and NEXT_PUBLIC_META_PIXEL_ENABLED=true
//     (and META_CAPI_ACCESS_TOKEN for the server side).
//  3. Per browser: the visitor pressed "Allow" on the ad-measurement banner,
//     and Do Not Track / Global Privacy Control are off.
// Events: PageView, Lead (Claim click), CompleteRegistration (vendor email
// confirmed; browser + server with one shared event id). No email, phone,
// name or account id is sent; advanced matching stays off.

export const META_PIXEL_PRIVACY_REVIEWED = true;

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

/** Server and client: is the pixel allowed to exist at all on this deploy? */
export function metaPixelConfigured(): boolean {
  return META_PIXEL_PRIVACY_REVIEWED && /^\d{10,20}$/.test(META_PIXEL_ID) && process.env.NEXT_PUBLIC_META_PIXEL_ENABLED === "true";
}

/** The visitor's ad-measurement choice: "granted" or "denied" (cookie so the server can read it). */
export const AD_CONSENT_COOKIE = "evntly_ad_consent";
/** Short-lived hand-off of the CompleteRegistration event id from the server to the browser pixel. */
export const REGISTRATION_EVENT_COOKIE = "evntly_reg_evt";
/** Fired on window when the choice changes, so the pixel can load without a reload. */
export const AD_CONSENT_EVENT = "evntly:ad-consent";

function readCookie(name: string): string | undefined {
  try {
    return document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  } catch {
    return undefined;
  }
}

function trackingOptOut(): boolean {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    return nav.doNotTrack === "1" || !!nav.globalPrivacyControl;
  } catch {
    return true;
  }
}

/** Browser only: "granted" | "denied" | undefined (not asked yet). DNT/GPC count as "denied". */
export function adConsentChoice(): "granted" | "denied" | undefined {
  if (trackingOptOut()) return "denied";
  const v = readCookie(AD_CONSENT_COOKIE);
  return v === "granted" || v === "denied" ? v : undefined;
}

/** Browser only: this visitor allowed ad measurement and hasn't opted out of tracking. */
export function hasMarketingConsent(): boolean {
  return adConsentChoice() === "granted";
}

/** Browser only: store the visitor's choice for a year and tell listeners. */
export function setAdConsent(choice: "granted" | "denied") {
  try {
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${AD_CONSENT_COOKIE}=${choice}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}`;
    if (choice === "denied") {
      // Meta's own cookies, if a pixel ever loaded before, are removed too.
      for (const c of ["_fbp", "_fbc"]) document.cookie = `${c}=; path=/; max-age=0; samesite=lax${secure}`;
    }
    window.dispatchEvent(new Event(AD_CONSENT_EVENT));
  } catch {
    // Storage blocked: behave as "not allowed".
  }
}

export type MetaPixelEvent = "Lead" | "CompleteRegistration";

/** Fires a standard event if the pixel is loaded; otherwise does nothing. */
export function metaPixelTrack(event: MetaPixelEvent, eventId?: string) {
  if (!metaPixelConfigured() || !hasMarketingConsent()) return;
  try {
    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
    if (eventId) fbq?.("track", event, {}, { eventID: eventId });
    else fbq?.("track", event);
  } catch {
    // Never break the page for analytics.
  }
}

/** Browser only: take (and delete) the registration event id the server left. */
export function takeRegistrationEventId(): string | undefined {
  const v = readCookie(REGISTRATION_EVENT_COOKIE);
  if (!v) return undefined;
  try {
    document.cookie = `${REGISTRATION_EVENT_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // ignore
  }
  return /^reg_[a-f0-9]{32}$/.test(v) ? v : undefined;
}

/** CSP additions, only when the pixel is configured. */
export const META_PIXEL_CSP = {
  script: "https://connect.facebook.net",
  connect: "https://www.facebook.com https://connect.facebook.net",
  img: "https://www.facebook.com",
};
