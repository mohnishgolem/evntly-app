"use server";

import { EVENT_DATE_ERROR, isBookableEventDate } from "@/lib/event-dates";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify, formatEventDate, formatAmount } from "@/lib/email";
import { categoryLabel } from "@/lib/config";
import { quoteParticipantEmail } from "@/lib/supabase/admin";
import { z } from "zod";
import { checkRateLimit, RATE_LIMIT_ERROR } from "@/lib/rate-limit";
import { SAMPLE_LISTING_CONTACT_ERROR } from "@/lib/sample-listings";
import type { Database } from "@/lib/supabase/database.types";

export type ActionState = { error?: string; success?: boolean; quoteId?: string } | null;

/** Where a quote request came from (quote_requests.origin). */
export type QuoteOrigin = "vendor_profile" | "event_board" | "smart_match";
const ORIGINS: QuoteOrigin[] = ["vendor_profile", "event_board", "smart_match"];

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

// Server actions are public HTTP endpoints — validate everything the browser
// sends, whatever the form enforced.
const quoteDraftSchema = z.object({
  eventDate: z.iso.date().refine((d) => isBookableEventDate(d), EVENT_DATE_ERROR),
  eventType: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(200),
  estimatedGuests: z.number().min(1).max(100000).transform(Math.round),
  estimatedHours: z.number().min(0).max(240).optional(),
  budgetRange: z.string().trim().min(1).max(80),
  details: z.string().max(5000).optional(),
});

export async function requestQuote(
  vendorId: string,
  draft: QuoteRequestDraft,
  eventId?: string,
  opts: { origin?: QuoteOrigin; matchScore?: number | null } = {}
): Promise<ActionState> {
  const origin: QuoteOrigin = opts.origin && ORIGINS.includes(opts.origin) ? opts.origin : "vendor_profile";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "You need to be logged in to request a quote." };
  const parsedDraft = quoteDraftSchema.safeParse(draft);
  if (!parsedDraft.success) {
    const dateIssue = parsedDraft.error.issues.some((i) => i.path[0] === "eventDate");
    return { error: dateIssue ? EVENT_DATE_ERROR : "Check the quote details and try again." };
  }
  draft = parsedDraft.data;
  if (!(await checkRateLimit("quoteUser", user.id))) return { error: RATE_LIMIT_ERROR };

  const { data: target } = await supabase.from("service_providers").select("is_demo").eq("id", vendorId).maybeSingle();
  if (target?.is_demo) return { error: SAMPLE_LISTING_CONTACT_ERROR };

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
      origin,
      event_id: eventId ?? null,
    })
    .select("id, service_type")
    .single();

  if (error) {
    // quote_requests_live_invite_uniq: one open request per vendor per event.
    if (error.code === "23505") return { error: "You've already asked this vendor for a quote for this event." };
    return { error: friendlyError(error.message) };
  }

  const matched = origin === "smart_match";
  notify({
    category: "enquiries",
    to: (await quoteParticipantEmail(quote.id, "vendor_email")) ?? "",
    subject: matched
      ? `You've been matched: ${draft.eventType} in ${draft.location} on ${formatEventDate(draft.eventDate)}`
      : `New quote request: ${draft.eventType} on ${formatEventDate(draft.eventDate)}`,
    heading: matched ? "Evntly matched you to an event" : "You have a new quote request",
    lines: [
      `Someone is planning a ${draft.eventType.toLowerCase()} in ${draft.location} on ${formatEventDate(draft.eventDate)} and would like a quote from you.`,
      `Service: ${categoryLabel(quote.service_type ?? "")}. Guests: about ${draft.estimatedGuests}${draft.estimatedHours ? `. Hours: ${draft.estimatedHours}` : ""}. Budget: ${draft.budgetRange}.`,
      matched && opts.matchScore != null
        ? `It's a ${opts.matchScore}% match for your area, prices and availability. The customer picked you from their matches.`
        : "Couples usually book whoever replies first — send your quote while it's fresh.",
    ],
    quote: draft.details,
    cta: { label: "Reply with a quote", path: matched ? "/vendor-dashboard/opportunities" : "/vendor-dashboard/enquiries" },
  });

  revalidatePath("/dashboard/quotes");
  return { success: true, quoteId: quote.id };
}

// Vendor responds to a pending quote request with a priced, itemised quote,
// or declines it. Amounts arrive in dollars; travel and deposit are stored in
// cents and can't exceed the total (also a DB check).
const quoteReplySchema = z
  .object({
    amount: z.number().positive("Enter a valid quote amount.").max(1_000_000),
    coverageHours: z.number().min(0.5).max(72).nullable(),
    travelFee: z.number().min(0).max(1_000_000).nullable(),
    inclusions: z.array(z.string().trim().min(1).max(120)).max(20),
    deliveryDays: z.number().int().min(0).max(365).nullable(),
    deposit: z.number().min(0).max(1_000_000).nullable(),
    cancellationTerms: z.string().trim().max(2000),
    description: z.string().trim().max(2000),
  })
  .refine((d) => d.travelFee == null || d.travelFee <= d.amount, "Travel is part of the total, so it can't be more than it.")
  .refine((d) => d.deposit == null || d.deposit <= d.amount, "The deposit can't be more than the total.");

export type QuoteReply = z.input<typeof quoteReplySchema>;

export async function respondToQuote(
  quoteId: string,
  action: "quote" | "decline",
  reply: QuoteReply | null,
  vendorNote: string
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };
  if (typeof vendorNote !== "string" || vendorNote.length > 5000) return { error: "That note is too long." };

  let update: Database["public"]["Tables"]["quote_requests"]["Update"];
  if (action === "quote") {
    const parsed = quoteReplySchema.safeParse(reply);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your quote." };
    const r = parsed.data;
    const cents = (n: number | null) => (n == null ? null : Math.round(n * 100));
    update = {
      status: "quoted",
      quoted_amount: Math.round(r.amount * 100) / 100,
      vendor_note: vendorNote || null,
      coverage_hours: r.coverageHours,
      travel_fee_cents: cents(r.travelFee),
      inclusions: r.inclusions,
      delivery_days: r.deliveryDays,
      deposit_cents: cents(r.deposit),
      cancellation_terms: r.cancellationTerms || null,
      service_description: r.description || null,
    };
  } else if (action === "decline") {
    update = { status: "declined", vendor_note: vendorNote || null };
  } else {
    return { error: "Unknown action." };
  }

  const { data: quote, error } = await supabase
    .from("quote_requests")
    .update(update)
    // RLS limits this to participants, and the lockdown trigger only lets
    // the vendor set a price or decline.
    .eq("id", quoteId)
    .select("vendor_name, event_type, event_date, event_id, quoted_amount")
    .single();

  if (error) return { error: friendlyError(error.message) };

  const clientEmail = (await quoteParticipantEmail(quoteId, "client_email")) ?? "";
  const board = quote.event_id ? `/dashboard/events/${quote.event_id}` : null;

  const eventLabel = `${quote.event_type ?? "event"} on ${formatEventDate(quote.event_date)}`;
  notify(
    action === "quote"
      ? {
          category: "quotes",
          to: clientEmail,
          subject: `${quote.vendor_name} sent you a quote`,
          heading: `${quote.vendor_name} quoted ${formatAmount(quote.quoted_amount)}`,
          lines: [`${quote.vendor_name} has replied to your quote request for your ${eventLabel}.`],
          quote: vendorNote,
          cta: board ? { label: "Compare quotes", path: board } : { label: "View quote", path: "/dashboard/quotes" },
        }
      : {
          category: "quotes",
          to: clientEmail,
          subject: `${quote.vendor_name} can't take your ${quote.event_type ?? "event"}`,
          heading: `${quote.vendor_name} declined your request`,
          lines: [
            `${quote.vendor_name} isn't able to take on your ${eventLabel}.`,
            board
              ? "Your event board has other matching vendors — you can invite the next best one in a click."
              : "There are plenty of other vendors on Evntly — you can request quotes from a few more in a couple of clicks.",
          ],
          quote: vendorNote,
          cta: board ? { label: "Invite another vendor", path: board } : { label: "Find another vendor", path: "/explore" },
        }
  );

  revalidatePath("/vendor-dashboard", "layout");
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
      category: "quotes",
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
