import { createClient } from "@/lib/supabase/server";
import { PACKAGE_COLUMNS, PARTICIPANT_COLUMNS } from "@/lib/public-columns";

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
    .select(PACKAGE_COLUMNS)
    .eq("status", "active")
    .in("initiating_vendor_id", approvedIds)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getBundleWithParticipants(id: string) {
  const supabase = await createClient();
  const [{ data: pkg }, { data: participants }] = await Promise.all([
    supabase.from("combined_packages").select(PACKAGE_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("combined_package_participants")
      .select(PARTICIPANT_COLUMNS)
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

export async function getVendorPackages(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("combined_packages")
    .select(PACKAGE_COLUMNS)
    .eq("initiating_vendor_user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

// Invites waiting on this vendor, with the proposing vendor's business name
// (participants don't store it, and emails aren't readable).
export async function getPendingInvitesForVendor(userId: string) {
  const supabase = await createClient();
  const { data: invites } = await supabase
    .from("combined_package_participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("vendor_user_id", userId)
    .eq("acceptance_status", "pending")
    .eq("is_initiator", false);
  if (!invites?.length) return [];

  const { data: packages } = await supabase
    .from("combined_packages")
    .select("id, initiating_vendor_name")
    .in("id", [...new Set(invites.map((i) => i.combined_package_id))]);
  const proposer = new Map((packages ?? []).map((p) => [p.id, p.initiating_vendor_name]));
  return invites.map((i) => ({ ...i, proposed_by: proposer.get(i.combined_package_id) ?? "Another vendor" }));
}
