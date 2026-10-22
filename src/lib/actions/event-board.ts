"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { EVENT_DATE_ERROR, isBookableEventDate } from "@/lib/event-dates";
import { GUEST_BUCKETS, isLaunchCategory } from "@/lib/config";
import { geocodeSuburb } from "@/lib/geocode";
import { eventTimesSchema, shortTime } from "@/lib/event-times";
import type { Database } from "@/lib/supabase/database.types";

export type BoardActionState = { error?: string; success?: boolean } | null;

// RLS already limits every read and write here to the caller's own events
// (and event_vendors to rows on their own events). The ownership check gives
// a clean error instead of a silent no-op, and is the server-side gate the
// UI can't bypass.
async function ownEvent(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || typeof eventId !== "string") return { supabase, user: null, event: null };
  const { data: event } = await supabase
    .from("events")
    .select("id, event_date, suburb, required_services, start_time, end_time")
    .eq("id", eventId)
    .eq("organiser_user_id", user.id)
    .maybeSingle();
  return { supabase, user, event };
}

function revalidateBoard(eventId: string) {
  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard");
}

// ── Shortlist ───────────────────────────────────────────────────────────

export async function setShortlisted(eventId: string, providerId: string, shortlisted: boolean): Promise<BoardActionState> {
  const { supabase, event } = await ownEvent(eventId);
  if (!event) return { error: "Event not found." };
  if (typeof providerId !== "string" || !providerId) return { error: "Vendor not found." };

  if (shortlisted) {
    // service_type and organiser come from the fill_event_vendor trigger,
    // which also refuses listings that aren't approved.
    const { error } = await supabase
      .from("event_vendors")
      .upsert({ event_id: eventId, provider_id: providerId }, { onConflict: "event_id,provider_id", ignoreDuplicates: true });
    if (error) return { error: /not available/i.test(error.message) ? "That vendor isn't available." : "Couldn't shortlist this vendor." };
  } else {
    const { error } = await supabase.from("event_vendors").delete().eq("event_id", eventId).eq("provider_id", providerId);
    if (error) return { error: "Couldn't update your shortlist." };
  }

  revalidateBoard(eventId);
  return { success: true };
}

// ── Categories ──────────────────────────────────────────────────────────

export async function setEventCategories(eventId: string, services: string[]): Promise<BoardActionState> {
  if (!Array.isArray(services) || services.length > 20) return { error: "Pick your vendor categories." };
  const clean = [...new Set(services)].filter((s): s is string => typeof s === "string" && isLaunchCategory(s));
  if (clean.length !== new Set(services).size) return { error: "Unknown vendor category." };

  const { supabase, event } = await ownEvent(eventId);
  if (!event) return { error: "Event not found." };

  const { error } = await supabase.from("events").update({ required_services: clean }).eq("id", eventId);
  if (error) return { error: "Couldn't save your categories." };
  revalidateBoard(eventId);
  return { success: true };
}

// ── Edit / delete ───────────────────────────────────────────────────────

const eventSchema = z
  .object({
    name: z.string().trim().max(80),
    eventDate: z.iso.date(),
    suburb: z.string().trim().min(1, "Add a suburb.").max(120),
    guestCount: z.enum(GUEST_BUCKETS),
    budgetTotal: z.number().min(0).max(10_000_000),
    notes: z.string().trim().max(2000),
    /** Whole dollars per category. */
    categoryBudgets: z.record(z.string(), z.number().min(0).max(10_000_000)).optional(),
  })
  .and(eventTimesSchema);

export type EventDetailsInput = z.input<typeof eventSchema>;

/** Active bookings tie vendors to the date and place, so those stay put. */
async function activeBookingCount(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string, userId: string) {
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("client_user_id", userId)
    .in("status", ["pending", "confirmed"]);
  return count ?? 0;
}

export async function updateEventDetails(eventId: string, input: EventDetailsInput): Promise<BoardActionState> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the event details." };
  const d = parsed.data;

  const { supabase, user, event } = await ownEvent(eventId);
  if (!event || !user) return { error: "Event not found." };

  const dateChanged = d.eventDate !== event.event_date;
  const placeChanged = d.suburb.toLowerCase() !== event.suburb.toLowerCase();
  const timesChanged =
    (d.startTime ?? "") !== shortTime(event.start_time) || (d.endTime ?? "") !== shortTime(event.end_time);
  if (dateChanged && !isBookableEventDate(d.eventDate)) return { error: EVENT_DATE_ERROR };
  if ((dateChanged || placeChanged || timesChanged) && (await activeBookingCount(supabase, eventId, user.id)) > 0) {
    return { error: "You have vendors booked for this date, time and place. Cancel those bookings before moving the event." };
  }

  // Per-category budgets: only for this event's categories, stored in cents,
  // and together no more than the total.
  const categoryBudgets: Record<string, number> = {};
  for (const [service, dollars] of Object.entries(d.categoryBudgets ?? {})) {
    if (!event.required_services.includes(service)) return { error: "Unknown vendor category." };
    if (dollars > 0) categoryBudgets[service] = Math.round(dollars * 100);
  }
  const budgeted = Object.values(categoryBudgets).reduce((a, b) => a + b, 0);
  if (d.budgetTotal > 0 && budgeted > Math.round(d.budgetTotal * 100)) {
    return { error: "Your category budgets add up to more than your total budget." };
  }

  const update: Database["public"]["Tables"]["events"]["Update"] = {
    name: d.name || null,
    event_date: d.eventDate,
    suburb: d.suburb,
    guest_count: d.guestCount,
    budget_total: Math.round(d.budgetTotal * 100) / 100,
    notes: d.notes || null,
    start_time: d.startTime ?? null,
    end_time: d.endTime ?? null,
    category_budgets: categoryBudgets,
  };
  if (placeChanged) {
    const place = await geocodeSuburb(d.suburb).catch(() => null);
    update.latitude = place?.latitude ?? null;
    update.longitude = place?.longitude ?? null;
  }

  const { error } = await supabase.from("events").update(update).eq("id", eventId);
  if (error) return { error: "Couldn't save your event." };
  revalidateBoard(eventId);
  return { success: true };
}

export async function deleteEvent(eventId: string): Promise<BoardActionState> {
  const { supabase, user, event } = await ownEvent(eventId);
  if (!event || !user) return { error: "Event not found." };

  // Quotes and bookings reference the event by id; deleting it under live
  // ones would orphan a vendor's enquiry or booking.
  const [bookings, { count: openQuotes }] = await Promise.all([
    activeBookingCount(supabase, eventId, user.id),
    supabase
      .from("quote_requests")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("client_user_id", user.id)
      .in("status", ["pending", "quoted"]),
  ]);
  if (bookings > 0) return { error: "This event has bookings. Cancel them before deleting the event." };
  if ((openQuotes ?? 0) > 0) return { error: "This event has open quote requests. Cancel them before deleting the event." };

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) return { error: "Couldn't delete this event." };

  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard");
  redirect("/dashboard/events");
}
