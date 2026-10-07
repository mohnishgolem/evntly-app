"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: boolean } | null;

export async function reportVendor(
  vendorId: string,
  vendorEmail: string | null,
  reason: string,
  details: string
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "You need to be logged in to report a vendor." };
  if (!reason.trim()) return { error: "Choose a reason." };

  const { error } = await supabase.from("reports").insert({
    content_type: "vendor",
    content_id: vendorId,
    reporter_email: user.email,
    reported_email: vendorEmail,
    reason: reason.trim(),
    details: details.trim() || null,
    status: "pending",
  });

  if (error) return { error: error.message };

  return { success: true };
}
