// Which event the organiser is browsing for, set when they leave the planner
// for search or a vendor (a suggestion card), so a quote request sent from a
// vendor's profile lands on that event's board. First-party and functional:
// it holds only an event id, which the server checks belongs to the visitor.
export const PLAN_CONTEXT_COOKIE = "evntly_plan_event";
export const PLAN_CONTEXT_MAX_AGE = 60 * 60 * 24 * 7;

export const isEventId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f-]{36}$/.test(value);

/** Browser side: remember the event before following a planner link. */
export function rememberPlanEvent(eventId: string) {
  if (!isEventId(eventId)) return;
  try {
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${PLAN_CONTEXT_COOKIE}=${eventId}; path=/; max-age=${PLAN_CONTEXT_MAX_AGE}; samesite=lax${secure}`;
  } catch {
    // Storage blocked: the vendor page falls back to the latest event.
  }
}
