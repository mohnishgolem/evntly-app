"use server";

import { EVENT_DATE_ERROR, isBookableEventDate } from "@/lib/event-dates";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodeSuburb } from "@/lib/geocode";
import { isLaunchCategory } from "@/lib/config";
import { NOT_LOGGED_IN } from "@/lib/event-times";
import { planDraftSchema, type PlanDraft } from "@/lib/planner/draft";
import { recordPlannerEvent } from "@/lib/planner/analytics";

export type { PlanDraft } from "@/lib/planner/draft";

/**
 * Saves a plan as the signed-in customer's event. `from` says where the
 * draft came from, for planner analytics: "form" (signed in on /plan) or
 * "guest" (a guest preview saved after creating an account).
 */
export async function claimEventPlan(draft: PlanDraft, from: "form" | "guest" = "form") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: NOT_LOGGED_IN };
  }
  const parsed = planDraftSchema.safeParse(draft);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your event details." };
  const d = parsed.data;
  if (!isBookableEventDate(d.eventDate)) return { error: EVENT_DATE_ERROR };
  const services = [...new Set(d.requiredServices)];
  if (!services.every(isLaunchCategory)) return { error: "Unknown vendor category." };

  // Suburb-level coordinates let the Event Board match vendors by service
  // area. Best-effort: the event saves without them if the lookup fails.
  const place = d.suburb ? await geocodeSuburb(d.suburb).catch(() => null) : null;

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      organiser_email: user.email,
      event_type: d.eventType,
      name: d.name || null,
      event_date: d.eventDate,
      suburb: d.suburb,
      guest_count: d.guestCount,
      budget_total: Math.round(d.budgetTotal * 100) / 100,
      required_services: services,
      notes: d.notes || null,
      start_time: d.startTime ?? null,
      end_time: d.endTime ?? null,
      status: "planning",
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
    })
    .select("id")
    .single();

  if (error || !event) return { error: "Could not save your event." };

  revalidatePath("/dashboard");
  await recordPlannerEvent("event_created", { userId: user.id, eventId: event.id, detail: from === "guest" ? "guest_preview" : "form" });
  return { success: true, eventId: event.id };
}
