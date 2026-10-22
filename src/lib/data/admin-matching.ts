import "server-only";

import { createClient } from "@/lib/supabase/server";
import { PUBLIC_VENDOR_COLUMNS } from "@/lib/vendor-columns";
import { loadMatchingSettings, matchEventCategories, type MatchingSettings } from "@/lib/data/matching";
import type { Evaluation, MatchVendor, ScoreParts } from "@/lib/matching/engine";
import type { Database } from "@/lib/supabase/database.types";

export type MatchingReport = {
  days: number;
  searches: { total: number; events: number; with_matches: number; with_confirmed: number; widened: number };
  by_service: { service: string; total: number; failures: number; avg_matches: number }[];
  failures: {
    event_id: string;
    service: string;
    suburb: string | null;
    event_date: string | null;
    run_date: string;
    excluded: number;
    exclusion_counts: Record<string, number>;
  }[];
  exclusions: Record<string, number>;
  quotes: {
    requests: number;
    smart: number;
    responded: number;
    avg_response_hours: number | null;
    quoted: number;
    accepted: number;
    decided: number;
  };
  bookings: { confirmed: number; value: number; commission_bps: number };
  vendors: {
    approved: number;
    with_packages: number;
    service_area_set: number;
    calendar_current: number;
    responded: number;
    invited: number;
  };
};

/** admin_matching_report refuses anyone who isn't an MFA-verified admin. */
export async function getMatchingReport(days: number): Promise<MatchingReport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_matching_report", { p_days: days });
  if (error || !data) return null;
  return data as unknown as MatchingReport;
}

export async function getMatchingSettingsForAdmin(): Promise<MatchingSettings & { rawWeights: Record<string, number> | null }> {
  const supabase = await createClient();
  const settings = await loadMatchingSettings(supabase);
  const { data } = await supabase.rpc("matching_settings");
  const raw = (data as { weights?: Record<string, number> } | null)?.weights ?? null;
  return { ...settings, rawWeights: raw };
}

export type ExplainedVendor = {
  id: string;
  name: string;
  isDemo: boolean;
  status: Evaluation["status"];
  score: number | null;
  parts: ScoreParts | null;
  reason: string | null;
  exclusions: string[];
  pending: string[];
  estimateCents: number | null;
  distanceKm: number | null;
};

export type ExplainedCategory = {
  service: string;
  budgetCents: number | null;
  widened: boolean;
  vendors: ExplainedVendor[];
};

type Event = Database["public"]["Tables"]["events"]["Row"];

/**
 * Re-runs matching for an event as it would run now and explains every
 * listing in its categories — including unapproved ones, which admins can
 * read — so support can answer "why wasn't X suggested?". Read-only.
 */
export async function explainEventMatching(event: Event): Promise<{ enabled: boolean; categories: ExplainedCategory[] }> {
  const supabase = await createClient();
  const settings = await loadMatchingSettings(supabase);
  if (!event.required_services.length) return { enabled: settings.enabled, categories: [] };

  const { data } = await supabase
    .from("service_providers")
    .select(PUBLIC_VENDOR_COLUMNS)
    .in("service_type", event.required_services)
    .limit(400);
  const candidates = (data ?? []) as MatchVendor[];
  const names = new Map((data ?? []).map((v) => [v.id, { name: v.name, isDemo: !!v.is_demo }]));

  // Explain even when matching is switched off, so admins can preview it.
  const { matches, budgets } = await matchEventCategories(supabase, event, candidates, { ...settings, enabled: true });

  const categories = event.required_services.map((service) => {
    const m = matches.get(service);
    const scored = m ? [...m.eligible, ...m.unconfirmed] : [];
    const vendors: ExplainedVendor[] = [
      ...scored.map((s) => ({
        id: s.vendorId,
        name: names.get(s.vendorId)?.name ?? s.vendorId,
        isDemo: names.get(s.vendorId)?.isDemo ?? false,
        status: s.status,
        score: s.score,
        parts: s.parts,
        reason: s.reason,
        exclusions: [],
        pending: s.pending.map((p) => p.message),
        estimateCents: s.price?.totalCents ?? null,
        distanceKm: s.distanceKm == null ? null : Math.round(s.distanceKm),
      })),
      ...(m?.excluded ?? []).map((e) => ({
        id: e.vendorId,
        name: names.get(e.vendorId)?.name ?? e.vendorId,
        isDemo: names.get(e.vendorId)?.isDemo ?? false,
        status: e.status,
        score: null,
        parts: null,
        reason: null,
        exclusions: e.exclusions.map((x) => x.message),
        pending: e.pending.map((p) => p.message),
        estimateCents: e.price?.totalCents ?? null,
        distanceKm: e.distanceKm == null ? null : Math.round(e.distanceKm),
      })),
    ];
    return { service, budgetCents: budgets.get(service) ?? null, widened: m?.widened ?? false, vendors };
  });

  return { enabled: settings.enabled, categories };
}
