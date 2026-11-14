import { metaPixelTrack } from "@/lib/meta-pixel";

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
export function trackFunnelEvent(event: "claim_click" | "signup_view" | "signup_attempt") {
  if (event === "claim_click") metaPixelTrack("Lead"); // no-op until the pixel is switched on
  const visitorId = analyticsVisitorId();
  if (!visitorId) return;
  sendTrack({ event, visitorId });
}
