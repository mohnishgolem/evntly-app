"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify, formatEventDate, formatAmount } from "@/lib/email";
import { categoryLabel } from "@/lib/config";
import { isQuoteExpired } from "@/lib/quote-expiry";

export type ActionState = { error?: string; success?: boolean } | null;

// The lockdown trigger refuses changes to an expired request; turn its raw
// exception into something a person can act on.
function friendlyError(message: string) {
  return /has expired/i.test(message)
    ? "This quote request has expired. Refresh to see the latest."
    : message;
}

export type QuoteRequestDraft = {
  eventDate: string;
  eventType: string;
  location: string;
  estimatedGuests: number;
  estimatedHours?: number;
  budgetRange: string;
  details?: string;
};

export async function requestQuote(
  vendorId: string,
  draft: QuoteRequestDraft,
  eventId?: string
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "You need to be logged in to request a quote." };

  // Vendor details come from the DB, never the caller — this is a server
  // action, so a client-supplied email would let anyone point the quote (and
  // its notification email) at an arbitrary address. The vendor's email isn't
  // publicly readable, so the fill_quote_request_vendor trigger sets
  // vendor_email/vendor_name/service_type from vendor_id (and rejects vendors
  // that aren't approved); we read them back for the notification.
  const { data: quote, error } = await supabase
    .from("quote_requests")
    .insert({
      vendor_id: vendorId,
      client_email: user.email,
      event_date: draft.eventDate,
      event_type: draft.eventType,
      location: draft.location,
      estimated_guests: draft.estimatedGuests,
      estimated_hours: draft.estimatedHours ?? null,
      budget_range: draft.budgetRange,
      details: draft.details || null,
      status: "pending",
      origin: "vendor_profile",
      event_id: eventId ?? null,
    })
    .select("vendor_email, service_type")
    .single();

  if (error) return { error: error.message };

  notify({
    to: quote.vendor_email,
    subject: `New quote request: ${draft.eventType} on ${formatEventDate(draft.eventDate)}`,
    heading: "You have a new quote request",
    lines: [
      `Someone is planning a ${draft.eventType.toLowerCase()} in ${draft.location} on ${formatEventDate(draft.eventDate)} and would like a quote from you.`,
      `Service: ${categoryLabel(quote.service_type ?? "")}. Guests: about ${draft.estimatedGuests}. Budget: ${draft.budgetRange}.`,
      "Couples usually book whoever replies first — send your quote while it's fresh.",
    ],
    quote: draft.details,
    cta: { label: "Reply with a quote", path: "/vendor-dashboard/quotes" },
  });

  revalidatePath("/dashboard/quotes");
  return { success: true };
}

// Vendor responds to a pending quote request with a price, or declines it.
export async function respondToQuote(
  quoteId: string,
  action: "quote" | "decline",
  quotedAmount: number | null,
  vendorNote: string
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { data: quote, error } = await supabase
    .from("quote_requests")
    .update({
      status: action === "quote" ? "quoted" : "declined",
      quoted_amount: action === "quote" ? quotedAmount : null,
      vendor_note: vendorNote || null,
    })
    .eq("id", quoteId)
    .eq("vendor_email", user.email)
    .select("client_email, vendor_name, event_type, event_date")
    .single();

  if (error) return { error: friendlyError(error.message) };

  const eventLabel = `${quote.event_type ?? "event"} on ${formatEventDate(quote.event_date)}`;
  notify(
    action === "quote"
      ? {
          to: quote.client_email,
          subject: `${quote.vendor_name} sent you a quote`,
          heading: `${quote.vendor_name} quoted ${formatAmount(quotedAmount)}`,
          lines: [`${quote.vendor_name} has replied to your quote request for your ${eventLabel}.`],
          quote: vendorNote,
          cta: { label: "View quote", path: "/dashboard/quotes" },
        }
      : {
          to: quote.client_email,
          subject: `${quote.vendor_name} can't take your ${quote.event_type ?? "event"}`,
          heading: `${quote.vendor_name} declined your request`,
          lines: [
            `${quote.vendor_name} isn't able to take on your ${eventLabel}.`,
            "There are plenty of other vendors on Evntly — you can request quotes from a few more in a couple of clicks.",
          ],
          quote: vendorNote,
          cta: { label: "Find another vendor", path: "/explore" },
        }
  );

  revalidatePath("/vendor-dashboard/quotes");
  return { success: true };
}

// Customer accepts a quoted price — this creates the actual booking record.
export async function acceptQuote(quoteId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { data: quote, error: fetchError } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("id", quoteId)
    .eq("client_email", user.email)
    .single();

  if (fetchError || !quote) return { error: "Quote request not found." };
  // Checked before the booking insert so an expired quote can't leave an
  // orphaned booking behind when the DB then refuses the status change.
  if (isQuoteExpired(quote)) {
    return { error: "This quote has expired. Ask the vendor for a new one." };
  }
  if (quote.status !== "quoted" || quote.quoted_amount == null) {
    return { error: "This quote isn't ready to accept yet." };
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      provider_id: quote.vendor_id,
      provider_name: quote.vendor_name,
      provider_owner_email: quote.vendor_email,
      service_type: quote.service_type ?? "event_planner",
      event_date: quote.event_date,
      total_price: quote.quoted_amount,
      status: "pending",
      escrow_status: "held",
      client_email: quote.client_email,
      client_name: quote.client_name,
      event_address: quote.location,
      event_id: quote.event_id,
      notes: quote.details,
    })
    .select("id")
    .single();

  if (bookingError || !booking) return { error: bookingError?.message ?? "Could not create booking." };

  const { error: updateError } = await supabase
    .from("quote_requests")
    .update({ status: "accepted", booking_id: booking.id })
    .eq("id", quoteId);

  if (updateError) return { error: friendlyError(updateError.message) };

  notify({
    to: quote.vendor_email,
    subject: `Your quote was accepted: ${quote.event_type ?? "event"} on ${formatEventDate(quote.event_date)}`,
    heading: "Your quote was accepted",
    lines: [
      `Good news — your ${formatAmount(quote.quoted_amount)} quote for the ${quote.event_type?.toLowerCase() ?? "event"} on ${formatEventDate(quote.event_date)} was accepted.`,
      "Confirm the booking to lock in the date.",
    ],
    cta: { label: "Confirm booking", path: "/vendor-dashboard/bookings" },
  });

  revalidatePath("/dashboard/quotes");
  revalidatePath("/dashboard/bookings");
  return { success: true };
}

export async function cancelQuote(quoteId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { error } = await supabase
    .from("quote_requests")
    .update({ status: "cancelled" })
    .eq("id", quoteId)
    .eq("client_email", user.email);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/quotes");
  return { success: true };
}
