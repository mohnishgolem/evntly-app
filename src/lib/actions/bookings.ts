"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: boolean } | null;

const VENDOR_TRANSITIONS: Record<string, string> = {
  confirm: "confirmed",
  complete: "completed",
  cancel: "cancelled",
};

export async function updateBookingStatus(
  bookingId: string,
  action: "confirm" | "complete" | "cancel"
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { data: booking, error } = await supabase
    .from("bookings")
    .update({ status: VENDOR_TRANSITIONS[action] })
    .eq("id", bookingId)
    .eq("provider_owner_email", user.email)
    .select("*")
    .single();

  if (error) return { error: error.message };

  // Confirming a booking kicks off day-of-event ops tracking.
  if (action === "confirm" && booking) {
    const { data: existingCard } = await supabase
      .from("job_cards")
      .select("id")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (!existingCard) {
      await supabase.from("job_cards").insert({
        booking_id: bookingId,
        event_id: booking.event_id,
        vendor_email: user.email,
        provider_id: booking.provider_id,
        provider_name: booking.provider_name,
        service_type: booking.service_type,
        event_date: booking.event_date,
        venue_address: booking.event_address,
        organiser_email: booking.client_email,
        organiser_name: booking.client_name,
        escrow_amount: booking.total_price,
        status: "scheduled",
      });
    }
  }

  revalidatePath("/vendor-dashboard/bookings");
  revalidatePath("/dashboard/bookings");
  return { success: true };
}

export async function cancelBookingAsCustomer(bookingId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("client_email", user.email);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/bookings");
  return { success: true };
}
