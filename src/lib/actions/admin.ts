"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/data/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/email";

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

  // The vendor dashboard promises "we'll email you when it's live".
  if (status === "approved") await emailListingLive(vendorId);

  revalidatePath("/admin", "layout");
  return { success: true };
}

// owner_email isn't readable with the admin's own session (column SELECT is
// revoked), so look it up with the service role.
async function emailListingLive(vendorId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: v } = await admin
    .from("service_providers")
    .select("name, owner_email, is_demo")
    .eq("id", vendorId)
    .maybeSingle();
  if (!v || v.is_demo) return;
  notify({
    to: v.owner_email,
    category: "bookings",
    subject: `${v.name} is live on Evntly`,
    heading: "Your listing is live",
    lines: [
      `${v.name} has been approved and customers can now find you on Explore and send you quote requests.`,
      "Add portfolio photos and keep your calendar up to date: complete listings get more requests.",
    ],
    cta: { label: "Open your dashboard", path: "/vendor-dashboard" },
  });
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
