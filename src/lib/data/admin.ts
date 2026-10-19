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

// Flagged off-platform payment attempts (and legacy contact-info
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

export type ErrorSummaryEntry = Awaited<ReturnType<typeof getErrorSummaryForAdmin>>[number];

// Grouped error log (server + browser) for the last 7 days. The RPC returns
// nothing unless the caller is an MFA-verified admin.
export async function getErrorSummaryForAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_error_summary", { p_days: 7 });
  return data ?? [];
}

export type FunnelStep = { step: number; label: string; people: number };

// Funnel counts for the last 7 and 30 days (admin_funnel returns nothing
// unless the caller is an MFA-verified admin).
export async function getFunnelForAdmin() {
  const supabase = await createClient();
  const [week, month] = await Promise.all([
    supabase.rpc("admin_funnel", { p_days: 7 }),
    supabase.rpc("admin_funnel", { p_days: 30 }),
  ]);
  const byStep = new Map<number, { label: string; week: number; month: number }>();
  for (const r of month.data ?? []) byStep.set(r.step, { label: r.label, week: 0, month: Number(r.people) });
  for (const r of week.data ?? []) {
    const row = byStep.get(r.step) ?? { label: r.label, week: 0, month: 0 };
    row.week = Number(r.people);
    byStep.set(r.step, row);
  }
  return [...byStep.entries()].sort(([a], [b]) => a - b).map(([step, v]) => ({ step, ...v }));
}
