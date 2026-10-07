"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: boolean } | null;

export async function setVendorStatus(
  vendorId: string,
  status: "approved" | "rejected" | "suspended"
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_providers")
    .update({ status })
    .eq("id", vendorId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true };
}

export async function setUserRole(
  userId: string,
  role: "customer" | "vendor" | "admin"
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ role }).eq("id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true };
}

export async function updateReportStatus(
  reportId: string,
  status: "reviewed" | "dismissed" | "actioned"
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("reports").update({ status }).eq("id", reportId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true };
}
