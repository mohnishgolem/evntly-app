"use server";

import { EVENT_DATE_ERROR, isBookableEventDate } from "@/lib/event-dates";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodeSuburb } from "@/lib/geocode";

export type PlanDraft = {
  eventType: string;
  eventDate: string;
  suburb: string;
  guestCount: string;
  budgetTotal: number;
  requiredServices: string[];
  notes?: string;
};

export async function claimEventPlan(draft: PlanDraft) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "Not logged in" };
  }
  if (!isBookableEventDate(draft.eventDate)) return { error: EVENT_DATE_ERROR };

  // Suburb-level coordinates let the Event Board match vendors by service
  // area. Best-effort: the event saves without them if the lookup fails.
  const place = await geocodeSuburb(draft.suburb).catch(() => null);

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      organiser_email: user.email,
      event_type: draft.eventType,
      event_date: draft.eventDate,
      suburb: draft.suburb,
      guest_count: draft.guestCount,
      budget_total: draft.budgetTotal,
      required_services: draft.requiredServices,
      notes: draft.notes || null,
      status: "planning",
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
    })
    .select("id")
    .single();

  if (error || !event) return { error: error?.message ?? "Could not save your event." };

  revalidatePath("/dashboard");
  return { success: true, eventId: event.id };
}
