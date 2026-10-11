"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify, formatEventDate, formatAmount } from "@/lib/email";
import { categoryLabel } from "@/lib/config";

export type ActionState = { error?: string; success?: boolean } | null;

// Total event budget, not the hourly-rate buckets in config.ts's PRICE_BUCKETS
// — different unit, so this stays local rather than reusing that helper.
function budgetBand(total: number | null): string | null {
  if (!total) return null;
  if (total < 1000) return "Under $1,000";
  if (total < 3000) return "$1,000–3,000";
  if (total < 6000) return "$3,000–6,000";
  if (total < 10000) return "$6,000–10,000";
  return "$10,000+";
}

function notifyApplicationDeclined(to: string | null, eventType: string | null, eventDate: string | null) {
  notify({
    to,
    subject: `Update on your application: ${eventType ?? "event"} on ${formatEventDate(eventDate)}`,
    heading: "The organiser went with another vendor",
    lines: [
      `The ${eventType?.toLowerCase() ?? "event"} on ${formatEventDate(eventDate)} has been filled. New events are posted to the feed all the time — keep an eye out for the next one.`,
    ],
    cta: { label: "Browse the Event Feed", path: "/vendor-dashboard/event-feed" },
  });
}

export async function publishEventToFeed(eventId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "You need to be logged in to post an event." };

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("organiser_email", user.email)
    .maybeSingle();

  if (!event) return { error: "Event not found." };

  const { data: existing } = await supabase
    .from("event_listings")
    .select("id")
    .eq("source_event_id", eventId)
    .eq("status", "open")
    .maybeSingle();

  if (existing) return { error: "This event is already posted to the feed." };

  const { error } = await supabase.from("event_listings").insert({
    source_event_id: eventId,
    event_type: event.event_type,
    event_date: event.event_date,
    suburb: event.suburb,
    guest_count: event.guest_count,
    budget_total: event.budget_total,
    budget_band: budgetBand(event.budget_total),
    required_services: event.required_services,
    notes: event.notes,
    status: "open",
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/event-feed");
  return { success: true };
}

export async function closeEventListing(listingId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "Not logged in." };

  const { data: listing } = await supabase
    .from("event_listings")
    .select("id, source_event_id")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing) return { error: "Listing not found." };

  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", listing.source_event_id)
    .eq("organiser_email", user.email)
    .maybeSingle();

  if (!event) return { error: "Not your event listing." };

  const { error } = await supabase
    .from("event_listings")
    .update({ status: "closed" })
    .eq("id", listingId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/event-feed");
  return { success: true };
}

export async function applyToEventListing(
  listingId: string,
  pitch: string,
  quotedAmount: number
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "You need to be logged in to apply." };

  const { data: vendor } = await supabase
    .rpc("my_service_providers")
    .select("*")
    .maybeSingle();

  if (!vendor || vendor.status !== "approved") {
    return { error: "You need an approved listing to apply to events." };
  }

  const { data: listing } = await supabase
    .from("event_listings")
    .select("id, status, source_event_id, event_type, event_date")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing || listing.status !== "open") {
    return { error: "This event is no longer accepting applications." };
  }

  const { data: existing } = await supabase
    .from("event_applications")
    .select("id")
    .eq("listing_id", listingId)
    .eq("vendor_email", user.email)
    .maybeSingle();

  if (existing) return { error: "You've already applied to this event." };

  const { data: event } = await supabase
    .from("events")
    .select("organiser_email")
    .eq("id", listing.source_event_id)
    .maybeSingle();

  const { error } = await supabase.from("event_applications").insert({
    listing_id: listingId,
    vendor_id: vendor.id,
    vendor_email: user.email,
    vendor_name: vendor.name,
    service_type: vendor.service_type,
    organiser_email: event?.organiser_email ?? null,
    pitch: pitch || null,
    quoted_amount: quotedAmount,
    status: "pending",
  });

  if (error) {
    // 23505 = unique_violation on (listing_id, vendor_id) — a defense-in-depth
    // DB constraint catching a race the pre-check above could miss (e.g. a
    // double-click), not just the normal "already applied" path above.
    if (error.code === "23505") return { error: "You've already applied to this event." };
    return { error: error.message };
  }

  notify({
    to: event?.organiser_email,
    subject: `${vendor.name} applied to your ${listing.event_type ?? "event"}`,
    heading: `${vendor.name} wants to work your event`,
    lines: [
      `${vendor.name} (${categoryLabel(vendor.service_type)}) applied to your ${listing.event_type?.toLowerCase() ?? "event"} on ${formatEventDate(listing.event_date)} with a quote of ${formatAmount(quotedAmount)}.`,
    ],
    quote: pitch,
    cta: { label: "Review application", path: "/dashboard/event-feed" },
  });

  revalidatePath("/vendor-dashboard/event-feed");
  return { success: true };
}

export async function respondToApplication(
  applicationId: string,
  action: "accept" | "decline"
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "Not logged in." };

  const { data: application } = await supabase
    .from("event_applications")
    .select("*")
    .eq("id", applicationId)
    .single();

  if (!application) return { error: "Application not found." };
  if (application.status !== "pending") return { error: "This application has already been responded to." };

  const { data: listing } = await supabase
    .from("event_listings")
    .select("*")
    .eq("id", application.listing_id)
    .single();

  if (!listing) return { error: "Listing not found." };

  // Ownership isn't a single .eq() like acceptQuote's client_email check —
  // event_applications has no organiser_email-of-the-listing-owner column,
  // only a path through event_listings.source_event_id -> events.organiser_email.
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", listing.source_event_id)
    .eq("organiser_email", user.email)
    .maybeSingle();

  if (!event) return { error: "Not your event listing." };

  if (action === "decline") {
    const { error } = await supabase
      .from("event_applications")
      .update({ status: "declined" })
      .eq("id", applicationId);

    if (error) return { error: error.message };

    notifyApplicationDeclined(application.vendor_email, listing.event_type, listing.event_date);

    revalidatePath("/dashboard/event-feed");
    return { success: true };
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      provider_id: application.vendor_id,
      provider_name: application.vendor_name,
      provider_owner_email: application.vendor_email,
      service_type: application.service_type,
      event_date: listing.event_date,
      total_price: application.quoted_amount,
      status: "pending",
      escrow_status: "held",
      client_email: user.email,
      client_name: (user.user_metadata?.full_name as string | undefined) ?? null,
      event_address: listing.suburb,
      event_id: listing.source_event_id,
      notes: application.pitch,
    })
    .select("id")
    .single();

  if (bookingError || !booking) {
    return { error: bookingError?.message ?? "Could not create booking." };
  }

  const { error: updateError } = await supabase
    .from("event_applications")
    .update({ status: "accepted", booking_id: booking.id, booking_confirmed: true })
    .eq("id", applicationId);

  if (updateError) return { error: updateError.message };

  // A listing can require multiple service types at once (e.g. photographer
  // AND DJ) — only auto-decline other pending applicants for the SAME role,
  // not every application on the listing.
  const { data: autoDeclined } = await supabase
    .from("event_applications")
    .update({ status: "declined" })
    .eq("listing_id", listing.id)
    .eq("service_type", application.service_type)
    .eq("status", "pending")
    .neq("id", applicationId)
    .select("vendor_email");

  notify({
    to: application.vendor_email,
    subject: `You got the job: ${listing.event_type ?? "event"} on ${formatEventDate(listing.event_date)}`,
    heading: "Your application was accepted",
    lines: [
      `The organiser accepted your ${formatAmount(application.quoted_amount)} quote for their ${listing.event_type?.toLowerCase() ?? "event"} on ${formatEventDate(listing.event_date)}${listing.suburb ? ` in ${listing.suburb}` : ""}.`,
      "Confirm the booking to lock in the date.",
    ],
    cta: { label: "Confirm booking", path: "/vendor-dashboard/bookings" },
  });
  for (const other of autoDeclined ?? []) {
    notifyApplicationDeclined(other.vendor_email, listing.event_type, listing.event_date);
  }

  revalidatePath("/dashboard/event-feed");
  revalidatePath("/dashboard/bookings");
  return { success: true };
}
