import { createClient } from "@/lib/supabase/server";

export async function getActiveBundles() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("combined_packages")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getBundleWithParticipants(id: string) {
  const supabase = await createClient();
  const [{ data: pkg }, { data: participants }] = await Promise.all([
    supabase.from("combined_packages").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("combined_package_participants")
      .select("*")
      .eq("combined_package_id", id),
  ]);
  return { pkg, participants: participants ?? [] };
}

export async function getVendorPackages(vendorEmail: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("combined_packages")
    .select("*")
    .eq("initiating_vendor_email", vendorEmail)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getPendingInvitesForVendor(vendorEmail: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("combined_package_participants")
    .select("*")
    .eq("vendor_email", vendorEmail)
    .eq("acceptance_status", "pending")
    .eq("is_initiator", false);
  return data ?? [];
}
