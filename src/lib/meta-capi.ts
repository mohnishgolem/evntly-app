import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { metaPixelConfigured, META_PIXEL_ID, AD_CONSENT_COOKIE, REGISTRATION_EVENT_COOKIE } from "@/lib/meta-pixel";
import { clientIpFrom } from "@/lib/rate-limit";

// Meta Conversions API (server side of the Meta Pixel).
//
// One event only: CompleteRegistration, sent when a vendor has confirmed their
// email (by code or by link). The browser pixel sends the same event with the
// same event_id, so Meta counts it once.
//
// Privacy:
//  - Nothing is sent unless the pixel is switched on (lib/meta-pixel.ts) AND
//    this browser said yes to ad measurement (the evntly_ad_consent cookie set
//    by <AdConsentBanner>). No consent, no event, from either side.
//  - No email, phone, name or account id is sent. user_data holds only what
//    Meta needs to match the click: IP address, user agent, and Meta's own
//    _fbp/_fbc browser cookies (present only if the pixel loaded).
//  - The event id is a one-way hash of the account id, so it repeats for the
//    same account (deduplication) without revealing it.
//  - The access token lives only in the server env (META_CAPI_ACCESS_TOKEN).

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

/** Stable, non-reversible event id for one account's registration. */
export function registrationEventId(userId: string): string {
  return "reg_" + createHash("sha256").update(`evntly-registration:${userId}`).digest("hex").slice(0, 32);
}

export type CapiUserData = { client_ip_address?: string; client_user_agent?: string; fbp?: string; fbc?: string };

/** The request body Meta expects; exported for tests. No personal data fields. */
export function completeRegistrationPayload(opts: {
  eventId: string;
  eventTime: number;
  sourceUrl: string;
  userData: CapiUserData;
  testEventCode?: string;
}) {
  const user_data = Object.fromEntries(Object.entries(opts.userData).filter(([, v]) => typeof v === "string" && v.length > 0));
  return {
    data: [
      {
        event_name: "CompleteRegistration",
        event_time: opts.eventTime,
        event_id: opts.eventId,
        action_source: "website",
        event_source_url: opts.sourceUrl,
        user_data,
        custom_data: { content_name: "founding_vendor_registration", status: "email_confirmed" },
      },
    ],
    ...(opts.testEventCode ? { test_event_code: opts.testEventCode } : {}),
  };
}

const FB_COOKIE = /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_.-]{1,200}$/;

/**
 * Only a genuinely new registration counts: the account was created in the
 * last 30 days and its email was confirmed in the last 10 minutes. Supabase
 * sets email_confirmed_at once, at the first confirmation, so a repeated
 * email link, a second code attempt, a re-login or a password reset later
 * never passes this check. Repeats inside the 10 minutes reuse the same
 * event id, which Meta deduplicates.
 */
export function isNewConfirmation(user: { created_at?: string | null; email_confirmed_at?: string | null }, now = Date.now()): boolean {
  const created = user.created_at ? Date.parse(user.created_at) : NaN;
  const confirmed = user.email_confirmed_at ? Date.parse(user.email_confirmed_at) : NaN;
  if (!Number.isFinite(created) || !Number.isFinite(confirmed)) return false;
  return now - created <= 30 * 24 * 3600 * 1000 && now - confirmed <= 10 * 60 * 1000 && confirmed <= now + 60 * 1000;
}

/** Is the server allowed to send to Meta for this request? */
export function capiEnabled(consent: string | undefined): boolean {
  return metaPixelConfigured() && !!process.env.META_CAPI_ACCESS_TOKEN && consent === "granted";
}

/**
 * A vendor has just confirmed their email for the first time. If (and only
 * if) this browser consented, send CompleteRegistration to Meta and leave the event id in a
 * short-lived cookie so <RegistrationPixel> fires the browser copy with the
 * same id. Never throws and never blocks sign-up for more than ~2.5s.
 */
export async function recordVendorRegistration(
  user: { id: string; created_at?: string | null; email_confirmed_at?: string | null },
  sourceUrl: string
): Promise<{ sent: boolean }> {
  try {
    if (!isNewConfirmation(user)) return { sent: false };
    const jar = await cookies();
    if (!capiEnabled(jar.get(AD_CONSENT_COOKIE)?.value)) return { sent: false };

    const eventId = registrationEventId(user.id);
    const h = await headers();
    const fbp = jar.get("_fbp")?.value;
    const fbc = jar.get("_fbc")?.value;
    const body = completeRegistrationPayload({
      eventId,
      eventTime: Math.floor(Date.now() / 1000),
      sourceUrl,
      userData: {
        client_ip_address: ((ip) => (ip && ip !== "unknown" ? ip : undefined))(clientIpFrom(h)),
        client_user_agent: h.get("user-agent")?.slice(0, 512) || undefined,
        fbp: fbp && FB_COOKIE.test(fbp) ? fbp : undefined,
        fbc: fbc && FB_COOKIE.test(fbc) ? fbc : undefined,
      },
      testEventCode: process.env.META_CAPI_TEST_EVENT_CODE || undefined,
    });

    // Hand the id to the browser pixel (read once, then deleted by the client).
    // Set before calling Meta: if the server request fails, the browser copy
    // still arrives and is counted once.
    jar.set(REGISTRATION_EVENT_COOKIE, eventId, { path: "/", maxAge: 600, sameSite: "lax", secure: true, httpOnly: false });

    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.META_CAPI_ACCESS_TOKEN}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[meta-capi] CompleteRegistration rejected:", res.status);
      return { sent: false };
    }
    return { sent: true };
  } catch (e) {
    console.error("[meta-capi] could not send CompleteRegistration:", e instanceof Error ? e.message : e);
    return { sent: false };
  }
}
