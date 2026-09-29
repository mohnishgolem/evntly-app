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
