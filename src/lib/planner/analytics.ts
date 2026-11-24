import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// First-party planner analytics (public.planner_events, service role only).
// Same privacy rules as page views: nothing is recorded for browsers sending
// Do Not Track or Global Privacy Control, no names or emails are stored, and
// recording never breaks the action it measures. Meta's pixel is not used.

export const PLANNER_EVENTS = [
  "event_created",
  "planner_opened",
  "task_completed",
  "recommendation_clicked",
  "vendor_saved",
  "vendor_enquiry",
  // Before an account exists (needs 20261129090000_planner_guest_events).
  "plan_started",
  "plan_previewed",
  "plan_save_clicked",
] as const;
export type PlannerEvent = (typeof PLANNER_EVENTS)[number];

/** Events the browser may send to /api/track; the rest are recorded by server actions. */
export const CLIENT_PLANNER_EVENTS: readonly PlannerEvent[] = ["planner_opened", "recommendation_clicked"];

/** Browser events that need no account or event (the guest steps on /plan). */
export const GUEST_PLANNER_EVENTS: readonly PlannerEvent[] = ["plan_started", "plan_previewed", "plan_save_clicked"];

export function isPlannerEvent(value: unknown): value is PlannerEvent {
  return PLANNER_EVENTS.includes(value as PlannerEvent);
}

export const plannerDetail = (value: unknown) =>
  typeof value === "string" && /^[a-z0-9_:]{1,60}$/.test(value) ? value : null;

async function optedOut() {
  try {
    const h = await headers();
    return h.get("dnt") === "1" || h.get("sec-gpc") === "1";
  } catch {
    return false;
  }
}

export async function recordPlannerEvent(
  event: PlannerEvent,
  opts: { userId?: string | null; eventId?: string | null; visitorId?: string | null; detail?: string | null } = {}
): Promise<void> {
  try {
    if (await optedOut()) return;
    const admin = createAdminClient();
    if (!admin) return;
    await admin.from("planner_events").insert({
      event,
      user_id: opts.userId ?? null,
      event_id: typeof opts.eventId === "string" && opts.eventId.length <= 64 ? opts.eventId : null,
      visitor_id: opts.visitorId && /^[A-Za-z0-9-]{8,64}$/.test(opts.visitorId) ? opts.visitorId : null,
      detail: plannerDetail(opts.detail),
    });
  } catch (e) {
    console.error("[planner] could not record", event, e instanceof Error ? e.message : e);
  }
}
