import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PlanPreview } from "@/components/planner/plan-preview";

export const metadata: Metadata = {
  title: "Your plan",
  robots: { index: false, follow: false },
};

// A guest's plan before they have an account: built in the browser from the
// draft /plan saved there, with real vendor counts from the server. Saving it
// creates the account, then the dashboard turns the draft into their event
// (see PlanClaimer).
export default async function PlanPreviewPage() {
  const supabase = await createClient();
  // Approved, real listings only: sample listings never count as options.
  const { data } = await supabase.from("service_providers").select("service_type").eq("status", "approved").not("is_demo", "is", true).limit(2000);
  const counts: Record<string, number> = {};
  for (const v of data ?? []) counts[v.service_type] = (counts[v.service_type] ?? 0) + 1;
  return <PlanPreview approvedCounts={counts} />;
}
