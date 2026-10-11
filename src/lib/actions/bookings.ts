"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify, formatEventDate } from "@/lib/email";

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

  if (booking) {
    const when = formatEventDate(booking.event_date);
    const copy = {
      confirm: {
        subject: `${booking.provider_name} confirmed your booking for ${when}`,
        heading: "Your booking is confirmed",
        line: `${booking.provider_name} has confirmed your booking for ${when}. You can track everything for the day from your dashboard.`,
      },
      complete: {
        subject: `How was ${booking.provider_name}?`,
        heading: "Your booking is complete",
        line: `${booking.provider_name} has marked your booking on ${when} as complete. A quick review helps other people planning events find great vendors.`,
      },
      cancel: {
        subject: `${booking.provider_name} cancelled your booking for ${when}`,
        heading: "Your booking was cancelled",
        line: `${booking.provider_name} has cancelled your booking for ${when}. You can find and request quotes from other vendors on Evntly.`,
      },
    }[action];
    notify({
      to: booking.client_email,
      subject: copy.subject,
      heading: copy.heading,
      lines: [copy.line],
      cta: { label: "View booking", path: "/dashboard/bookings" },
    });
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

  const { data: booking, error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("client_email", user.email)
    .select("provider_owner_email, client_name, event_date")
    .single();

  if (error) return { error: error.message };

  notify({
    to: booking.provider_owner_email,
    subject: `Booking cancelled: ${formatEventDate(booking.event_date)}`,
    heading: "A booking was cancelled",
    lines: [`${booking.client_name ?? "Your customer"} has cancelled their booking for ${formatEventDate(booking.event_date)}. That date is free again.`],
    cta: { label: "View bookings", path: "/vendor-dashboard/bookings" },
  });

  revalidatePath("/dashboard/bookings");
  return { success: true };
}
