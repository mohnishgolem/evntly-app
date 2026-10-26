"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify, formatEventDate } from "@/lib/email";
import { bookingParticipantEmail } from "@/lib/supabase/admin";
import type { TablesUpdate } from "@/lib/supabase/database.types";

export type ActionState = { error?: string; success?: boolean } | null;

// Job card steps. The database (enforce_job_cards_lockdown) decides who may
// take each step and when: the vendor marks "on the way" and then "done"
// (only from the event date, on a confirmed booking); the customer then
// confirms, which completes the booking (complete_booking_on_job_confirmed).
// An update that matches no row is reported, not treated as success.
async function stepJobCard(
  jobCardId: string,
  as: "vendor" | "organiser",
  changes: TablesUpdate<"job_cards">
): Promise<{ error: string } | { jobCard: { booking_id: string; provider_name: string | null; event_date: string } }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { data, error } = await supabase
    .from("job_cards")
    .update(changes)
    .eq("id", jobCardId)
    .eq(as === "vendor" ? "vendor_user_id" : "organiser_user_id", user.id)
    .select("booking_id, provider_name, event_date")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This job card isn't yours to update." };

  revalidatePath("/vendor-dashboard/bookings");
  revalidatePath("/dashboard/bookings");
  revalidatePath(`/bookings/${data.booking_id}`);
  return { jobCard: data };
}

export async function markOnMyWay(jobCardId: string): Promise<ActionState> {
  const res = await stepJobCard(jobCardId, "vendor", {
    on_my_way: true,
    on_my_way_at: new Date().toISOString(),
    status: "on_the_way",
  });
  return "error" in res ? res : { success: true };
}

export async function markDelivered(jobCardId: string): Promise<ActionState> {
  const res = await stepJobCard(jobCardId, "vendor", {
    delivered_at: new Date().toISOString(),
    status: "delivered",
  });
  if ("error" in res) return res;

  const { jobCard } = res;
  const vendor = jobCard.provider_name ?? "Your vendor";
  notify({
    category: "bookings",
    to: (await bookingParticipantEmail(jobCard.booking_id, "client_email")) ?? "",
    subject: `${vendor} marked your booking as done`,
    heading: "Please confirm your booking is complete",
    lines: [
      `${vendor} has marked the job on ${formatEventDate(jobCard.event_date)} as done. If everything went as agreed, confirm it on Evntly to complete the booking.`,
    ],
    cta: { label: "Confirm booking", path: `/bookings/${jobCard.booking_id}` },
  });
  return { success: true };
}

export async function confirmJobDelivery(jobCardId: string): Promise<ActionState> {
  const res = await stepJobCard(jobCardId, "organiser", {
    confirmed_at: new Date().toISOString(),
    status: "confirmed",
  });
  if ("error" in res) return res;

  const { jobCard } = res;
  const vendor = jobCard.provider_name ?? "your vendor";
  const when = formatEventDate(jobCard.event_date);
  notify({
    category: "bookings",
    to: (await bookingParticipantEmail(jobCard.booking_id, "provider_owner_email")) ?? "",
    subject: `Booking complete: ${when}`,
    heading: "Your customer confirmed the booking is complete",
    lines: [`The customer confirmed the job on ${when} went as agreed. The booking is now complete.`],
    cta: { label: "View bookings", path: "/vendor-dashboard/bookings" },
  });
  notify({
    category: "bookings",
    to: (await bookingParticipantEmail(jobCard.booking_id, "client_email")) ?? "",
    subject: `How was ${vendor}?`,
    heading: "Your booking is complete",
    lines: [`Thanks for confirming your booking on ${when}. A quick review helps other people planning events find great vendors.`],
    cta: { label: "Leave a review", path: "/dashboard/bookings" },
  });
  return { success: true };
}

// The fill_checklist_item_parties trigger addresses the item to the job
// card's vendor and organiser; RLS refuses it unless the caller is one.
export async function addChecklistItem(
  jobCardId: string,
  label: string,
  ownerRole: "vendor" | "organiser"
): Promise<ActionState> {
  if (!label.trim()) return { error: "Enter a task first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { error } = await supabase.from("stage_checklist_items").insert({
    job_card_id: jobCardId,
    label: label.trim(),
    owner_role: ownerRole,
    status: "pending",
  });
  if (error) return { error: error.message };

  revalidatePath("/vendor-dashboard/bookings");
  revalidatePath("/dashboard/bookings");
  return { success: true };
}

export async function toggleChecklistItem(itemId: string, done: boolean): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { error } = await supabase
    .from("stage_checklist_items")
    .update({
      status: done ? "done" : "pending",
      done_by_email: done ? user.email : null,
      done_at: done ? new Date().toISOString() : null,
    })
    .eq("id", itemId);
  if (error) return { error: error.message };

  revalidatePath("/vendor-dashboard/bookings");
  revalidatePath("/dashboard/bookings");
  return { success: true };
}
