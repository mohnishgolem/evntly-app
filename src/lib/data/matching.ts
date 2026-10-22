import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  categoryBudgetCents,
  DEFAULT_WEIGHTS,
  matchCategory,
  normaliseWeights,
  type BusySlot,
  type CategoryMatches,
  type MatchContext,
  type MatchEvent,
  type MatchVendor,
  type MatchWeights,
} from "@/lib/matching/engine";
import type { MatchPackage } from "@/lib/matching/pricing";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type MatchingSettings = { enabled: boolean; weights: MatchWeights };

/** Admin switch + weights (matching_settings RPC). Fails safe to "on, defaults". */
export async function loadMatchingSettings(supabase: Supabase): Promise<MatchingSettings> {
  const { data, error } = await supabase.rpc("matching_settings");
  if (error || !data || typeof data !== "object") return { enabled: true, weights: DEFAULT_WEIGHTS };
  const d = data as { enabled?: unknown; weights?: unknown };
  return { enabled: d.enabled !== false, weights: normaliseWeights(d.weights) };
}

const PACKAGE_COLUMNS =
  "id, provider_id, name, price_cents, included_hours, extra_hour_cents, inclusions, delivery_days, deposit_percent, active" as const;

/** "YYYY-MM-DD" + n days. */
function addDays(isoDate: string, n: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Everything the engine needs besides the vendor rows, read under the
 * caller's RLS: active packages on approved listings, portfolio sizes, and
 * confirmed time slots around the event (the day before through the day
 * after, so overnight bookings either side are seen).
 */
export async function loadMatchContext(
  supabase: Supabase,
  vendorIds: string[],
  eventDate: string,
  weights: MatchWeights
): Promise<MatchContext> {
  const packages = new Map<string, MatchPackage[]>();
  const portfolioCounts = new Map<string, number>();
  if (vendorIds.length === 0) return { packages, portfolioCounts, busy: [], weights, now: new Date() };

  const [pkgRes, portfolioRes, busyRes] = await Promise.all([
    supabase.from("vendor_packages").select(PACKAGE_COLUMNS).in("provider_id", vendorIds).eq("active", true),
    supabase.from("portfolio_items").select("provider_id").in("provider_id", vendorIds).limit(5000),
    supabase.rpc("vendor_busy_slots", { p_from: `${addDays(eventDate, -1)}T00:00:00`, p_to: `${addDays(eventDate, 2)}T00:00:00` }),
  ]);

  for (const p of pkgRes.data ?? []) {
    const list = packages.get(p.provider_id) ?? [];
    list.push({ ...p, included_hours: p.included_hours == null ? null : Number(p.included_hours) });
    packages.set(p.provider_id, list);
  }
  for (const row of portfolioRes.data ?? []) {
    portfolioCounts.set(row.provider_id, (portfolioCounts.get(row.provider_id) ?? 0) + 1);
  }
  const busy: BusySlot[] = (busyRes.data ?? []).map((b) => ({
    provider_id: b.provider_id,
    slot_start: b.slot_start,
    slot_end: b.slot_end,
  }));

  return { packages, portfolioCounts, busy, weights, now: new Date() };
}

type MatchableEventRow = {
  event_type: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  suburb: string;
  latitude: number | null;
  longitude: number | null;
  budget_total: number;
  required_services: string[];
  category_budgets: unknown;
};

/**
 * Run Stage A + B for each of an event's categories over `candidates`
 * (approved listings in those categories). Shared by the Event Board and the
 * quote-invite action, so what a customer is shown and what the server
 * re-checks before sending can't drift apart. Empty when matching is off.
 */
export async function matchEventCategories(
  supabase: Supabase,
  event: MatchableEventRow,
  candidates: MatchVendor[],
  settings: MatchingSettings
) {
  const matches = new Map<string, CategoryMatches>();
  const budgets = new Map<string, number | null>();
  for (const service of event.required_services) {
    budgets.set(
      service,
      categoryBudgetCents(service, event.budget_total, event.required_services, event.category_budgets as Record<string, unknown>)
    );
  }
  if (!settings.enabled || candidates.length === 0) return { matches, budgets };

  const ctx = await loadMatchContext(supabase, candidates.map((v) => v.id), event.event_date, settings.weights);
  for (const service of event.required_services) {
    const matchEvent: MatchEvent = {
      eventType: event.event_type,
      date: event.event_date,
      startTime: event.start_time,
      endTime: event.end_time,
      suburb: event.suburb,
      latitude: event.latitude,
      longitude: event.longitude,
      budgetCents: budgets.get(service) ?? null,
    };
    matches.set(service, matchCategory(candidates.filter((v) => v.service_type === service), service, matchEvent, ctx));
  }
  return { matches, budgets };
}
