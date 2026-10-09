"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requestQuote } from "@/lib/actions/quotes";

export type ActionState = { error?: string; success?: boolean } | null;

// events.guest_count is a free-text bucket label ("Under 80"), but
// quote_requests.estimated_guests is a required integer — translate to a
// reasonable representative number rather than leaving it unset.
function estimateGuestCount(bucket: string | null): number {
  if (!bucket) return 50;
  if (bucket.toLowerCase().includes("under")) return 50;
  if (bucket.toLowerCase().includes("over")) return 200;
  return 100;
}

export async function requestQuotesForEvent(
  eventId: string,
  vendorIds: string[]
): Promise<ActionState> {
  if (vendorIds.length === 0) return { error: "Select at least one vendor." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "Not logged in." };

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("organiser_email", user.email)
    .maybeSingle();

  if (!event) return { error: "Not your event." };

  const { data: vendors } = await supabase
    .from("service_providers")
    .select("id, name, owner_email, service_type")
    .in("id", vendorIds);

  if (!vendors || vendors.length === 0) return { error: "No vendors found." };

  const draft = {
    eventDate: event.event_date,
    eventType: event.event_type,
    location: event.suburb,
    estimatedGuests: estimateGuestCount(event.guest_count),
    budgetRange: event.budget_total ? `$${event.budget_total.toLocaleString()}` : "Flexible",
    details: event.notes || undefined,
  };

  const results = await Promise.all(
    vendors.map((v) =>
      requestQuote(v.id, v.owner_email ?? "", v.name, v.service_type, draft, eventId)
    )
  );

  const failed = results.filter((r) => r?.error);
  if (failed.length === vendors.length) {
    return { error: failed[0]?.error ?? "Could not send any quote requests." };
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  return { success: true };
}
