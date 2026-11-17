import { metaPixelTrack } from "@/lib/meta-pixel";
import { funnelParamsFrom } from "@/lib/page-views";

// Browser side of the anonymous analytics (see <PageViewTracker> and
// /api/track): a random per-browser id, nothing sent under Do Not Track or
// Global Privacy Control, and never an error the user can see.

export function analyticsVisitorId(): string | null {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return null;
    let id = localStorage.getItem("evntly_vid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("evntly_vid", id);
    }
    return id;
  } catch {
    return null;
  }
}

export function sendTrack(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Analytics must never break the page.
  }
}

/** Records a founding funnel step from the browser (claim click, sign-up attempt). */
export function trackFunnelEvent(event: "claim_click" | "signup_view" | "signup_attempt" | "listing_started") {
  if (event === "claim_click") metaPixelTrack("Lead"); // no-op until the pixel is switched on
  const visitorId = analyticsVisitorId();
  if (!visitorId) return;
  // The page's link tags travel with the step, so it is credited even if the
  // source cookie was never saved in this browser (see funnelParamsFrom).
  const params = funnelParamsFrom(window.location.search);
  sendTrack({ event, visitorId, ...(params ? { params } : {}) });
}
