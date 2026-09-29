import { createClient } from "@/lib/supabase/server";

export async function getPendingVendors() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_providers")
    .select("*")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getAllVendorsForAdmin() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_providers")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}
