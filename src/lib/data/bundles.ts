import { createClient } from "@/lib/supabase/server";

export async function getActiveBundles() {
  const supabase = await createClient();
  // Bundles don't go through their own review — they inherit visibility from
  // their initiating vendor, same as /explore does for listings. Without
  // this, an unapproved vendor's bundle would be publicly bookable before
  // any admin has reviewed them.
  const { data: approvedVendors } = await supabase
    .from("service_providers")
    .select("id")
    .eq("status", "approved");
  const approvedIds = (approvedVendors ?? []).map((v) => v.id);
  if (approvedIds.length === 0) return [];

  const { data } = await supabase
    .from("combined_packages")
    .select("*")
    .eq("status", "active")
    .in("initiating_vendor_id", approvedIds)
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

  let initiatingVendorApproved = false;
  if (pkg?.initiating_vendor_id) {
    const { data: vendor } = await supabase
      .from("service_providers")
      .select("status")
      .eq("id", pkg.initiating_vendor_id)
      .maybeSingle();
    initiatingVendorApproved = vendor?.status === "approved";
  }

  return { pkg, participants: participants ?? [], initiatingVendorApproved };
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
