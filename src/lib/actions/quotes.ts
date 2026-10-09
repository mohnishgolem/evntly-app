"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: boolean } | null;

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
  vendorEmail: string,
  vendorName: string,
  serviceType: string,
  draft: QuoteRequestDraft,
  eventId?: string
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "You need to be logged in to request a quote." };

  const { error } = await supabase.from("quote_requests").insert({
    vendor_id: vendorId,
    vendor_email: vendorEmail,
    vendor_name: vendorName,
    service_type: serviceType,
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
  });

  if (error) return { error: error.message };

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

  const { error } = await supabase
    .from("quote_requests")
    .update({
      status: action === "quote" ? "quoted" : "declined",
      quoted_amount: action === "quote" ? quotedAmount : null,
      vendor_note: vendorNote || null,
    })
    .eq("id", quoteId)
    .eq("vendor_email", user.email);

  if (error) return { error: error.message };

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

  if (updateError) return { error: updateError.message };

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
