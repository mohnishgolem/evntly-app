import { createClient } from "@/lib/supabase/server";

export async function getPendingVendors() {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("admin_service_providers")
    .select("*")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getAllVendorsForAdmin() {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("admin_service_providers")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getAllUsersForAdmin() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getReportsForAdmin() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export type LeakLogEntry = Awaited<ReturnType<typeof getLeakLogForAdmin>>[number];

// Blocked off-platform payment attempts (and legacy contact-info
// redactions), newest first. leakage_events is admin-only under RLS. Each
// entry is tied back to the vendor listing its conversation belongs to
// (conversation ids are "<providerId>:<customerUserId>") so the admin can
// see whether the vendor or the customer tried to take payment off-platform.
export async function getLeakLogForAdmin() {
  const supabase = await createClient();
  const [{ data: events }, { data: vendors }] = await Promise.all([
    supabase
      .from("leakage_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.rpc("admin_service_providers").select("id, name, owner_email, status"),
  ]);

  const vendorsById = new Map((vendors ?? []).map((v) => [v.id, v]));
  return (events ?? []).map((e) => {
    const vendor = e.conversation_id
      ? (vendorsById.get(e.conversation_id.split(":")[0]) ?? null)
      : null;
    return {
      ...e,
      vendor,
      senderIsVendor: !!vendor && vendor.owner_email === e.sender_email,
    };
  });
}
