"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: boolean } | null;

export async function markOnMyWay(jobCardId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { error } = await supabase
    .from("job_cards")
    .update({ on_my_way: true, on_my_way_at: new Date().toISOString(), status: "on_the_way" })
    .eq("id", jobCardId)
    .eq("vendor_user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/vendor-dashboard/bookings");
  revalidatePath("/dashboard/bookings");
  return { success: true };
}

export async function markDelivered(jobCardId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { error } = await supabase
    .from("job_cards")
    .update({ delivered_at: new Date().toISOString(), status: "delivered" })
    .eq("id", jobCardId)
    .eq("vendor_user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/vendor-dashboard/bookings");
  revalidatePath("/dashboard/bookings");
  return { success: true };
}

export async function confirmJobDelivery(jobCardId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { error } = await supabase
    .from("job_cards")
    .update({ confirmed_at: new Date().toISOString(), status: "confirmed" })
    .eq("id", jobCardId)
    .eq("organiser_user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/bookings");
  revalidatePath("/vendor-dashboard/bookings");
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
