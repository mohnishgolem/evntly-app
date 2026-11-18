import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { acquisitionMetrics, type ApplicationFacts, type ProspectRecord } from "@/lib/acquisition/pipeline";
import type { BetaAdminData } from "@/lib/data/admin-founding";
import { dailyTarget, summariseVerifiedFunnel } from "@/lib/acquisition/verified-funnel";

const PROSPECT_COLUMNS =
  "id, business_name, category, suburb, email, instagram, phone, website, lead_quality, consent_basis, stage, contacted_at, follow_up_count, next_follow_up_at, replied_at, do_not_contact, do_not_contact_reason, created_at";

// The Vendor Acquisition section of Admin → Beta Vendors, and the daily
// report. Prospects are admin-only (RLS); the later stages come from the
// founding applications already loaded for the page.
export async function getAcquisitionData(beta: BetaAdminData, opts: { serviceClient?: SupabaseClient<Database> } = {}) {
  const supabase = opts.serviceClient ?? (await createClient());
  const [{ data, error }, verifiedRes] = await Promise.all([
    supabase.from("vendor_prospects").select(PROSPECT_COLUMNS).order("created_at", { ascending: false }).limit(5000),
    // Admin page only: the RPC is gated on is_admin() (a signed-in admin with
    // MFA), so the service-role cron would just get zeros. Skip it there.
    opts.serviceClient ? Promise.resolve({ data: null, error: { message: "skipped" } }) : supabase.rpc("admin_verified_vendor_funnel"),
  ]);

  const applications: ApplicationFacts[] = beta.rows
    .filter((r) => r.applicationId)
    .map((r) => ({
      email: r.email,
      applicationId: r.applicationId,
      applicationStatus: r.applicationStatus,
      onboardingPercent: r.onboardingPercent,
      listingStatus: r.listingStatus,
      decidedAt: r.decidedAt,
    }));

  return {
    // Missing table = the migration isn't applied yet; the section says so.
    deployed: !error,
    // Null until migration 20261120090000_admin_verified_vendor_funnel is applied.
    verified: verifiedRes.error ? null : withTarget(summariseVerifiedFunnel(verifiedRes.data ?? [])),
    ...acquisitionMetrics((data ?? []) as ProspectRecord[], applications),
  };
}

// 200 verified registrations by 30 Nov 2026. Sydney calendar day: AEDT is
// UTC+11 for the whole sprint.
function withTarget(v: ReturnType<typeof summariseVerifiedFunnel>) {
  return { ...v, target: dailyTarget(v.verified, 200, new Date(Date.now() + 11 * 3_600_000), new Date(Date.UTC(2026, 10, 30))) };
}

export type AcquisitionData = Awaited<ReturnType<typeof getAcquisitionData>>;
