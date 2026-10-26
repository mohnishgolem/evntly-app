"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify, formatEventDate } from "@/lib/email";
import { bookingParticipantEmail } from "@/lib/supabase/admin";
import { releaseDepositForBooking } from "@/lib/payments/server";

export type ActionState = { error?: string; success?: boolean } | null;

// Completion isn't a vendor action: the vendor marks the job done on its job
// card and the customer's confirmation completes the booking (see
// lib/actions/job-cards.ts). The database enforces the same transitions.
const VENDOR_TRANSITIONS: Record<string, string> = {
  confirm: "confirmed",
  cancel: "cancelled",
};

export async function updateBookingStatus(
  bookingId: string,
  action: "confirm" | "cancel"
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };
  // Server actions take whatever the browser sends; only known actions.
  const status = VENDOR_TRANSITIONS[action];
  if (!status) return { error: "That isn't something you can do to a booking." };

  // RLS + the bookings lockdown trigger limit status changes to the vendor
  // (pending -> confirmed/cancelled, confirmed -> cancelled); confirming also
  // opens the job card (create_job_card_on_confirm trigger).
  const { data: booking, error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .eq("provider_owner_user_id", user.id)
    .select("id, provider_name, event_date")
    .single();

  if (error) {
    // bookings_vendor_no_overlap: Postgres refuses a second confirmed booking
    // that overlaps one the vendor already has, even if two confirmations
    // race each other.
    if (error.code === "23P01") {
      return { error: "You already have a confirmed booking at that time. Cancel or move it before confirming this one." };
    }
    return { error: error.message };
  }

  // A paid deposit becomes the vendor's once they confirm (the plan both
  // parties agreed says so). Re-checked in the database before any transfer.
  if (booking && action === "confirm") await releaseDepositForBooking(booking.id);

  if (booking) {
    const when = formatEventDate(booking.event_date);
    const copy = {
      confirm: {
        subject: `${booking.provider_name} confirmed your booking for ${when}`,
        heading: "Your booking is confirmed",
        line: `${booking.provider_name} has confirmed your booking for ${when}. You can track everything for the day from your dashboard.`,
      },
      cancel: {
        subject: `${booking.provider_name} cancelled your booking for ${when}`,
        heading: "Your booking was cancelled",
        line: `${booking.provider_name} has cancelled your booking for ${when}. You can find and request quotes from other vendors on Evntly.`,
      },
    }[action];
    notify({
      category: "bookings",
      to: (await bookingParticipantEmail(booking.id, "client_email")) ?? "",
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
    .eq("client_user_id", user.id)
    .select("id, client_name, event_date")
    .single();

  if (error) return { error: error.message };

  notify({
    category: "bookings",
    to: (await bookingParticipantEmail(booking.id, "provider_owner_email")) ?? "",
    subject: `Booking cancelled: ${formatEventDate(booking.event_date)}`,
    heading: "A booking was cancelled",
    lines: [`${booking.client_name ?? "Your customer"} has cancelled their booking for ${formatEventDate(booking.event_date)}. That date is free again.`],
    cta: { label: "View bookings", path: "/vendor-dashboard/bookings" },
  });

  revalidatePath("/dashboard/bookings");
  return { success: true };
}
