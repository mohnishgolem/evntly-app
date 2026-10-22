"use server";

import { EVENT_DATE_ERROR, isBookableEventDate } from "@/lib/event-dates";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { geocodeSuburb } from "@/lib/geocode";
import { EVENT_TYPES, GUEST_BUCKETS, isLaunchCategory } from "@/lib/config";
import { eventTimesSchema, NOT_LOGGED_IN } from "@/lib/event-times";

export type PlanDraft = {
  eventType: string;
  eventDate: string;
  suburb: string;
  guestCount: string;
  budgetTotal: number;
  requiredServices: string[];
  notes?: string;
  /** "HH:MM", Sydney. Optional so drafts saved before times existed still claim. */
  startTime?: string;
  endTime?: string;
};

// Server actions are public endpoints: validate everything, whatever /plan
// enforced in the browser.
const planSchema = z
  .object({
    eventType: z.enum(EVENT_TYPES),
    eventDate: z.iso.date(),
    suburb: z.string().trim().min(1).max(120),
    guestCount: z.enum(GUEST_BUCKETS),
    budgetTotal: z.number().min(0).max(10_000_000),
    requiredServices: z.array(z.string()).min(1).max(20),
    notes: z.string().trim().max(2000).optional(),
  })
  .and(eventTimesSchema);

export async function claimEventPlan(draft: PlanDraft) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: NOT_LOGGED_IN };
  }
  const parsed = planSchema.safeParse(draft);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your event details." };
  const d = parsed.data;
  if (!isBookableEventDate(d.eventDate)) return { error: EVENT_DATE_ERROR };
  const services = [...new Set(d.requiredServices)];
  if (!services.every(isLaunchCategory)) return { error: "Unknown vendor category." };

  // Suburb-level coordinates let the Event Board match vendors by service
  // area. Best-effort: the event saves without them if the lookup fails.
  const place = await geocodeSuburb(d.suburb).catch(() => null);

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      organiser_email: user.email,
      event_type: d.eventType,
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
  return { success: true, eventId: event.id };
}
