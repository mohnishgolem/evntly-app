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

// One-off steps: a page that mounts twice (React re-render, back/forward
// cache, a remount on navigation) must not record the step twice. Production
// showed 3 same-visitor repeats within 10 seconds in 30 days. Clicks and
// attempts are real repeated actions and are still sent each time.
const ONCE_PER_SESSION = new Set(["signup_view", "listing_started"]);

/** True the first time this browser session records `event`. */
export function firstInSession(event: string): boolean {
  try {
    const key = `evntly_funnel_${event}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true; // storage blocked: send rather than lose the step
  }
}

/** Records a founding funnel step from the browser (claim click, sign-up attempt). */
export function trackFunnelEvent(event: "claim_click" | "signup_view" | "signup_attempt" | "listing_started") {
  if (event === "claim_click") metaPixelTrack("Lead"); // no-op until the pixel is switched on
  const visitorId = analyticsVisitorId();
  if (!visitorId) return;
  if (ONCE_PER_SESSION.has(event) && !firstInSession(event)) return;
  // The page's link tags travel with the step, so it is credited even if the
  // source cookie was never saved in this browser (see funnelParamsFrom).
  const params = funnelParamsFrom(window.location.search);
  sendTrack({ event, visitorId, ...(params ? { params } : {}) });
}

export type VendorJourneyEvent = "vendor_cta" | "calculator_used" | "builder_started" | "builder_step" | "builder_preview" | "save_clicked";
const VENDOR_ONCE = new Set<VendorJourneyEvent>(["calculator_used", "builder_started", "builder_preview"]);

/**
 * Vendor journey steps (/become-a-vendor). `detail` is a short code such as
 * the builder step id. One-off steps count once per browser session.
 */
export function trackVendorJourney(event: VendorJourneyEvent, detail?: string) {
  const visitorId = analyticsVisitorId();
  if (!visitorId) return;
  if (VENDOR_ONCE.has(event) && !firstInSession(`vj_${event}`)) return;
  if (event === "builder_step" && detail && !firstInSession(`vj_step_${detail}`)) return;
  const params = funnelParamsFrom(window.location.search);
  sendTrack({ event, visitorId, ...(detail ? { detail } : {}), ...(params ? { params } : {}) });
}

/** Planner events from the browser (opened, suggestion tapped). Same opt-outs as page views. */
export function trackPlanner(event: "planner_opened" | "recommendation_clicked", eventId: string, detail?: string) {
  const visitorId = analyticsVisitorId();
  if (!visitorId) return;
  sendTrack({ visitorId, planner: { event, eventId, ...(detail ? { detail } : {}) } });
}

/** Planner steps before an account exists (started the form, saw the preview, chose to save). */
export function trackPlannerGuest(event: "plan_started" | "plan_previewed" | "plan_save_clicked") {
  const visitorId = analyticsVisitorId();
  if (!visitorId) return;
  if (!firstInSession(`planner_${event}`)) return;
  sendTrack({ visitorId, planner: { event } });
}
