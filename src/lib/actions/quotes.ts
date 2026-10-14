"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify, formatEventDate, formatAmount } from "@/lib/email";
import { categoryLabel } from "@/lib/config";
import { quoteParticipantEmail } from "@/lib/supabase/admin";

export type ActionState = { error?: string; success?: boolean } | null;

// The lockdown trigger refuses changes to an expired request; turn its raw
// exception into something a person can act on.
function friendlyError(message: string) {
  return /has expired/i.test(message) && !/Ask the vendor/.test(message)
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
  // its notification email) at an arbitrary address. The
  // fill_quote_request_vendor trigger sets vendor_email/vendor_name/
  // service_type from vendor_id (and rejects vendors that aren't approved).
  // Neither side can read the other's email back, so the notification
  // address is looked up server-side.
  const { data: quote, error } = await supabase
    .from("quote_requests")
    .insert({
      vendor_id: vendorId,
      client_email: user.email,
      client_name: (user.user_metadata?.full_name as string | undefined)?.trim() || null,
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
    .select("id, service_type")
    .single();

  if (error) return { error: error.message };

  notify({
    to: (await quoteParticipantEmail(quote.id, "vendor_email")) ?? "",
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
    // RLS limits this to participants, and the lockdown trigger only lets
    // the vendor set a price or decline.
    .eq("id", quoteId)
    .select("vendor_name, event_type, event_date")
    .single();

  if (error) return { error: friendlyError(error.message) };

  const clientEmail = (await quoteParticipantEmail(quoteId, "client_email")) ?? "";

  const eventLabel = `${quote.event_type ?? "event"} on ${formatEventDate(quote.event_date)}`;
  notify(
    action === "quote"
      ? {
          to: clientEmail,
          subject: `${quote.vendor_name} sent you a quote`,
          heading: `${quote.vendor_name} quoted ${formatAmount(quotedAmount)}`,
          lines: [`${quote.vendor_name} has replied to your quote request for your ${eventLabel}.`],
          quote: vendorNote,
          cta: { label: "View quote", path: "/dashboard/quotes" },
        }
      : {
          to: clientEmail,
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

// Customer accepts a quoted price — the accept_quote RPC creates the booking
// and marks the quote accepted in one transaction (refusing expired quotes),
// so the customer never needs the vendor's email for the booking row.
export async function acceptQuote(quoteId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { error } = await supabase.rpc("accept_quote", { p_quote_id: quoteId });
  if (error) return { error: friendlyError(error.message) };

  const { data: quote } = await supabase
    .rpc("my_quote_requests", { as_role: "client" })
    .eq("id", quoteId)
    .maybeSingle();

  if (quote) {
    notify({
      to: (await quoteParticipantEmail(quoteId, "vendor_email")) ?? "",
      subject: `Your quote was accepted: ${quote.event_type ?? "event"} on ${formatEventDate(quote.event_date)}`,
      heading: "Your quote was accepted",
      lines: [
        `Good news — your ${formatAmount(quote.quoted_amount)} quote for the ${quote.event_type?.toLowerCase() ?? "event"} on ${formatEventDate(quote.event_date)} was accepted.`,
        "Confirm the booking to lock in the date.",
      ],
      cta: { label: "Confirm booking", path: "/vendor-dashboard/bookings" },
    });
  }

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
    // RLS + the lockdown trigger restrict cancelling to the customer.
    .eq("id", quoteId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/quotes");
  return { success: true };
}
