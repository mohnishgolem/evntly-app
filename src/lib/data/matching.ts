import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_WEIGHTS,
  normaliseWeights,
  type BusySlot,
  type MatchContext,
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
