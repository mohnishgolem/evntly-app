"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/data/user";

export type ActionState = { error?: string; success?: boolean } | null;

export type VendorStatus = "approved" | "rejected" | "suspended" | "pending_review";
const VENDOR_STATUSES: VendorStatus[] = ["approved", "rejected", "suspended", "pending_review"];

// RLS is the real enforcement boundary for these tables, but every write
// here is also gated in code so a logged-in non-admin gets a clean error
// instead of a raw Postgres rejection if the policies ever change.
// Admin writes additionally require an MFA-verified (aal2) session.
async function requireAdmin() {
  const { session, admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") return null;
  return session;
}

export async function setVendorStatus(
  vendorId: string,
  status: VendorStatus
): Promise<ActionState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!VENDOR_STATUSES.includes(status)) return { error: "Invalid status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_providers")
    .update({ status })
    .eq("id", vendorId);

  if (error) return { error: error.message };

  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function setFoundingVendor(
  vendorId: string,
  founding: boolean
): Promise<ActionState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (typeof founding !== "boolean") return { error: "Invalid value." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_providers")
    .update({ founding_vendor: founding })
    .eq("id", vendorId)
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length) return { error: "Listing not found." };

  // Founding vendors sort first and carry a badge on every public surface.
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  revalidatePath("/explore");
  revalidatePath(`/vendor/${vendorId}`);
  return { success: true };
}

export async function setUserRole(
  userId: string,
  role: "customer" | "vendor" | "admin"
): Promise<ActionState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ role }).eq("id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function updateReportStatus(
  reportId: string,
  status: "reviewed" | "dismissed" | "actioned"
): Promise<ActionState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("reports").update({ status }).eq("id", reportId);

  if (error) return { error: error.message };

  revalidatePath("/admin", "layout");
  return { success: true };
}
