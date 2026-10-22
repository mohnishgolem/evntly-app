// Smart vendor matching: Stage A decides who can do the job, Stage B ranks
// them. Pure functions over rows the server has already read, so every rule
// is unit-tested and an admin can be shown exactly why a vendor was matched
// or left out (each exclusion carries a code and a sentence).
//
// Rules only use information that exists. Missing information never counts
// against a vendor in the score (it scores neutral); instead the vendor is
// listed separately as "availability pending" until it's filled in.

import { categoryLabel } from "@/lib/config";
import { distanceKm, dayOfWeek, DEFAULT_SERVICE_RADIUS_KM } from "@/lib/event-board";
import { coversDuration, estimatePrice, type MatchPackage, type PriceEstimate } from "@/lib/matching/pricing";

// ── Settings ────────────────────────────────────────────────────────────

export type MatchWeights = {
  suitability: number;
  budget: number;
  quality: number;
  location: number;
  reliability: number;
};

export const DEFAULT_WEIGHTS: MatchWeights = { suitability: 30, budget: 25, quality: 20, location: 15, reliability: 10 };
const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof MatchWeights)[];

/** Admin-set weights, scaled to sum to 100. Anything malformed → defaults. */
export function normaliseWeights(raw: unknown): MatchWeights {
  if (!raw || typeof raw !== "object") return DEFAULT_WEIGHTS;
  const r = raw as Record<string, unknown>;
  const vals = WEIGHT_KEYS.map((k) => r[k]);
  if (vals.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100)) return DEFAULT_WEIGHTS;
  const sum = (vals as number[]).reduce((a, b) => a + b, 0);
  if (sum <= 0) return DEFAULT_WEIGHTS;
  return Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, ((vals[i] as number) / sum) * 100])) as MatchWeights;
}

/** Below this many in-area results, the search widens (×1.5, then ×2). */
export const MIN_RESULTS = 3;
/** A calendar touched within this many days counts as current. */
export const CALENDAR_FRESH_DAYS = 45;
/** Reach of a vendor who says they travel to regional NSW. */
export const REGIONAL_NSW_KM = 350;
/** Reviews needed before the rating counts in the score. */
export const MIN_REVIEWS_FOR_RATING = 3;

// ── Inputs ──────────────────────────────────────────────────────────────

export type MatchVendor = {
  id: string;
  name: string;
  service_type: string;
  status: string | null;
  is_demo: boolean | null;
  available: boolean | null;
  unavailable_dates: string[] | null;
  weekly_unavailable_days: number[] | null;
  latitude: number | null;
  longitude: number | null;
  service_radius_km: number | null;
  travels_regional: boolean | null;
  free_travel_km: number | null;
  travel_fee_cents_per_km: number | null;
  min_booking_hours: number | string | null;
  hourly_rate: number | string | null;
  event_types: string[] | null;
  verified: boolean | null;
  rating: number | null;
  review_count: number | null;
  acceptance_rate: number | null;
  avg_response_hours: number | null;
  availability_confirmed_at: string | null;
};

export type MatchEvent = {
  eventType: string;
  /** "YYYY-MM-DD", Sydney. */
  date: string;
  /** "HH:MM" Sydney wall-clock, or null if not set. End ≤ start = past midnight. */
  startTime: string | null;
  endTime: string | null;
  suburb: string;
  latitude: number | null;
  longitude: number | null;
  /** Budget for this category, in cents (null = not set). */
  budgetCents: number | null;
};

/** A confirmed booking's Sydney wall-clock range ("YYYY-MM-DDTHH:MM[:SS]"). */
export type BusySlot = { provider_id: string; slot_start: string; slot_end: string };

export type MatchContext = {
  packages: Map<string, MatchPackage[]>;
  portfolioCounts: Map<string, number>;
  busy: BusySlot[];
  weights: MatchWeights;
  now: Date;
};

// ── Time ────────────────────────────────────────────────────────────────

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Event length in hours; an end at or before the start runs past midnight. */
export function eventHours(startTime: string | null, endTime: string | null) {
  if (!startTime || !endTime) return null;
  let diff = minutes(endTime) - minutes(startTime);
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

/** Naive wall-clock "YYYY-MM-DDTHH:MM" → comparable number (ms, no zone). */
function wallClock(value: string) {
  const [d, t = "00:00"] = value.split(/[T ]/);
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi, s] = t.split(":").map(Number);
  return Date.UTC(y, mo - 1, da, h || 0, mi || 0, Math.floor(s || 0));
}

/** The event's [start, end) in wall-clock ms; no times = the whole day. */
export function eventSlot(event: Pick<MatchEvent, "date" | "startTime" | "endTime">): [number, number] {
  const dayStart = wallClock(event.date);
  if (!event.startTime || !event.endTime) return [dayStart, dayStart + 24 * 3600_000];
  const start = dayStart + minutes(event.startTime) * 60_000;
  return [start, start + (eventHours(event.startTime, event.endTime) ?? 24) * 3600_000];
}

export function isBusy(vendorId: string, event: MatchEvent, busy: BusySlot[]) {
  const [s, e] = eventSlot(event);
  return busy.some((b) => b.provider_id === vendorId && wallClock(b.slot_start) < e && s < wallClock(b.slot_end));
}

// ── Stage A: eligibility ────────────────────────────────────────────────

export type ExclusionCode =
  | "not_approved"
  | "sample_listing"
  | "wrong_category"
  | "paused"
  | "date_blocked"
  | "day_off"
  | "booked"
  | "outside_area"
  | "duration"
  | "over_budget";

export type PendingCode = "calendar_unconfirmed" | "vendor_unlocated" | "event_unlocated" | "no_price";

export type Reason<C> = { code: C; message: string };

/** 0 = within the vendor's radius, 1 = within ×1.5, 2 = within ×2. */
export type AreaTier = 0 | 1 | 2;

export type Evaluation = {
  vendorId: string;
  status: "eligible" | "unconfirmed" | "excluded";
  exclusions: Reason<ExclusionCode>[];
  pending: Reason<PendingCode>[];
  distanceKm: number | null;
  areaTier: AreaTier | null;
  price: PriceEstimate | null;
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
}

/** The radius a vendor covers, before any widening. */
export function serviceRadiusKm(v: Pick<MatchVendor, "service_radius_km" | "travels_regional">) {
  const base = v.service_radius_km || DEFAULT_SERVICE_RADIUS_KM;
  return v.travels_regional ? Math.max(base, REGIONAL_NSW_KM) : base;
}

export function evaluateVendor(v: MatchVendor, service: string, event: MatchEvent, ctx: MatchContext): Evaluation {
  const exclusions: Reason<ExclusionCode>[] = [];
  const pending: Reason<PendingCode>[] = [];

  if (v.status !== "approved") exclusions.push({ code: "not_approved", message: "Listing isn't approved" });
  if (v.is_demo) exclusions.push({ code: "sample_listing", message: "Sample listing, not a real business" });
  if (v.service_type !== service)
    exclusions.push({ code: "wrong_category", message: `Offers ${categoryLabel(v.service_type).toLowerCase()}, not ${categoryLabel(service).toLowerCase()}` });
  if (v.available === false) exclusions.push({ code: "paused", message: "Not taking bookings right now" });
  if ((v.unavailable_dates ?? []).includes(event.date)) exclusions.push({ code: "date_blocked", message: "Unavailable on your date" });
  if ((v.weekly_unavailable_days ?? []).includes(dayOfWeek(event.date)))
    exclusions.push({ code: "day_off", message: "Doesn't work that day of the week" });
  if (isBusy(v.id, event, ctx.busy)) exclusions.push({ code: "booked", message: "Already booked at that time" });

  // Location
  let distance: number | null = null;
  let areaTier: AreaTier | null = null;
  if (event.latitude == null || event.longitude == null) {
    pending.push({ code: "event_unlocated", message: "We couldn't place your suburb on the map" });
  } else if (v.latitude == null || v.longitude == null) {
    pending.push({ code: "vendor_unlocated", message: "Vendor hasn't set their base location" });
  } else {
    distance = distanceKm(event.latitude, event.longitude, v.latitude, v.longitude);
    const radius = serviceRadiusKm(v);
    if (distance <= radius) areaTier = 0;
    else if (distance <= radius * 1.5) areaTier = 1;
    else if (distance <= radius * 2) areaTier = 2;
    else exclusions.push({ code: "outside_area", message: `${Math.round(distance)} km away — outside their ${Math.round(radius)} km area` });
  }

  // Duration and price
  const hours = eventHours(event.startTime, event.endTime);
  const packages = ctx.packages.get(v.id) ?? [];
  if (!coversDuration(v, packages, hours))
    exclusions.push({ code: "duration", message: `No package covers ${hours} hours` });
  const price = estimatePrice(v, packages, hours, distance);
  if (!price) pending.push({ code: "no_price", message: "No prices listed yet" });
  else if (event.budgetCents != null && event.budgetCents > 0 && price.totalCents > event.budgetCents)
    exclusions.push({
      code: "over_budget",
      message: `Estimated ${money(price.totalCents)} — over your ${money(event.budgetCents)} budget`,
    });

  // Availability: the calendar only says when they're NOT free, so it only
  // counts as confirmation if the vendor has kept it current.
  const confirmed = v.availability_confirmed_at ? Date.parse(v.availability_confirmed_at) : NaN;
  if (!Number.isFinite(confirmed) || ctx.now.getTime() - confirmed > CALENDAR_FRESH_DAYS * 86_400_000) {
    pending.push({ code: "calendar_unconfirmed", message: "Availability pending — calendar not recently updated" });
  }

  const status = exclusions.length ? "excluded" : pending.length ? "unconfirmed" : "eligible";
  return { vendorId: v.id, status, exclusions, pending, distanceKm: distance, areaTier, price };
}

// ── Stage B: scoring ────────────────────────────────────────────────────

export type ScoreParts = MatchWeights; // each part 0..1

export type ScoredMatch = Evaluation & {
  score: number;
  parts: ScoreParts;
  reason: string;
};

const clamp = (n: number) => Math.min(1, Math.max(0, n));

function typeFit(v: MatchVendor, eventType: string) {
  const types = (v.event_types ?? []).map((t) => t.toLowerCase());
  if (types.length === 0) return 0.5;
  return types.includes(eventType.toLowerCase()) ? 1 : 0.2;
}

/** Best around 70–90% of budget: cheap is good, but not a race to the bottom. */
export function budgetFit(totalCents: number | null, budgetCents: number | null) {
  if (totalCents == null || budgetCents == null || budgetCents <= 0) return 0.5;
  const r = totalCents / budgetCents;
  if (r > 1) return 0;
  if (r > 0.9) return 1 - ((r - 0.9) / 0.1) * 0.25;
  if (r >= 0.7) return 1;
  if (r >= 0.4) return 0.7 + ((r - 0.4) / 0.3) * 0.3;
  return 0.7;
}

export function qualityFit(v: MatchVendor, portfolioCount: number) {
  const portfolio = Math.min(portfolioCount, 6) / 6;
  const rated = (v.review_count ?? 0) >= MIN_REVIEWS_FOR_RATING && v.rating != null;
  // New vendors score neutral on rating rather than zero.
  const rating = rated ? clamp((Number(v.rating) - 3) / 2) : 0.5;
  return 0.4 * portfolio + 0.2 * (v.verified ? 1 : 0) + 0.4 * rating;
}

export function locationFit(e: Pick<Evaluation, "distanceKm" | "areaTier" | "price">, radiusKm: number) {
  if (e.distanceKm == null) return 0.5;
  const closeness = 1 - Math.min(e.distanceKm / radiusKm, 2) / 2;
  const travel = e.price && e.price.travelCents > 0 ? 0.15 : 0;
  const widened = e.areaTier === 1 ? 0.2 : e.areaTier === 2 ? 0.35 : 0;
  return clamp(closeness - travel - widened);
}

export function reliabilityFit(v: Pick<MatchVendor, "avg_response_hours" | "acceptance_rate">) {
  const h = v.avg_response_hours;
  const response = h == null ? 0.5 : h <= 2 ? 1 : h <= 12 ? 0.85 : h <= 24 ? 0.7 : h <= 72 ? 0.4 : 0.2;
  const a = v.acceptance_rate;
  const acceptance = a == null ? 0.5 : clamp(a > 1 ? a / 100 : a);
  return (response + acceptance) / 2;
}

function joinList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Recommended because this photographer specialises in birthday events, covers Parramatta and …" */
export function matchReason(v: MatchVendor, event: MatchEvent, e: Evaluation, portfolioCount: number) {
  const phrases: string[] = [];
  if (typeFit(v, event.eventType) === 1) phrases.push(`specialises in ${event.eventType.toLowerCase()} events`);
  if (e.areaTier === 0) phrases.push(`covers ${event.suburb}`);
  else if (e.areaTier != null) phrases.push(`can travel to ${event.suburb}`);
  if (e.price && event.budgetCents != null && e.price.totalCents <= event.budgetCents) {
    phrases.push(
      e.price.basis === "package" && e.price.billedHours
        ? `offers a ${e.price.billedHours}-hour package within your budget`
        : e.price.basis === "package"
          ? "offers a package within your budget"
          : "fits your budget"
    );
  }
  if ((v.review_count ?? 0) >= MIN_REVIEWS_FOR_RATING && (v.rating ?? 0) >= 4.5) phrases.push("is highly rated");
  if (v.verified) phrases.push("is verified");
  if (portfolioCount >= 3) phrases.push("has a strong portfolio");
  if (v.avg_response_hours != null && v.avg_response_hours <= 12) phrases.push("replies quickly");
  const top = phrases.slice(0, 3);
  if (top.length === 0) return `Matches your date and ${categoryLabel(v.service_type).toLowerCase()} needs.`;
  return `Recommended because this ${categoryLabel(v.service_type).toLowerCase()} ${joinList(top)}.`;
}

export function scoreVendor(v: MatchVendor, event: MatchEvent, e: Evaluation, ctx: MatchContext): ScoredMatch {
  const portfolio = ctx.portfolioCounts.get(v.id) ?? 0;
  const durationFit = !e.price ? 0.5 : e.price.basis === "hourly" ? 0.6 : e.price.notes.some((n) => /extra hour/.test(n)) ? 0.8 : 1;
  const parts: ScoreParts = {
    suitability: 0.7 * typeFit(v, event.eventType) + 0.3 * durationFit,
    budget: budgetFit(e.price?.totalCents ?? null, event.budgetCents),
    quality: qualityFit(v, portfolio),
    location: locationFit(e, serviceRadiusKm(v)),
    reliability: reliabilityFit(v),
  };
  const w = ctx.weights;
  const score = Math.round(WEIGHT_KEYS.reduce((sum, k) => sum + w[k] * parts[k], 0));
  return { ...e, score, parts, reason: matchReason(v, event, e, portfolio) };
}

// ── Putting it together ─────────────────────────────────────────────────

export type CategoryMatches = {
  service: string;
  /** Passed every check, with current availability. Best first. */
  eligible: ScoredMatch[];
  /** Passed every hard check but something's unknown (availability, price, location). */
  unconfirmed: ScoredMatch[];
  excluded: Evaluation[];
  /** True if results from outside vendors' usual areas were included. */
  widened: boolean;
};

const byScore = (a: ScoredMatch, b: ScoredMatch) => b.score - a.score || a.vendorId.localeCompare(b.vendorId);

export function matchCategory(vendors: MatchVendor[], service: string, event: MatchEvent, ctx: MatchContext): CategoryMatches {
  const byId = new Map(vendors.map((v) => [v.id, v]));
  const evaluated = vendors.map((v) => evaluateVendor(v, service, event, ctx));
  const passing = evaluated.filter((e) => e.status !== "excluded");

  // Widen only as far as needed to reach MIN_RESULTS.
  let maxTier: AreaTier = 0;
  const within = (t: AreaTier) => passing.filter((e) => e.areaTier == null || e.areaTier <= t).length;
  if (within(0) < MIN_RESULTS) maxTier = within(1) >= MIN_RESULTS ? 1 : 2;

  const shown = passing.filter((e) => e.areaTier == null || e.areaTier <= maxTier);
  const outOfRange: Evaluation[] = passing
    .filter((e) => !shown.includes(e))
    .map((e) => ({
      ...e,
      status: "excluded" as const,
      exclusions: [{ code: "outside_area" as const, message: "Outside their usual area (enough closer vendors)" }],
    }));
  const scored = shown.map((e) => scoreVendor(byId.get(e.vendorId)!, event, e, ctx));

  return {
    service,
    eligible: scored.filter((s) => s.status === "eligible").sort(byScore),
    unconfirmed: scored.filter((s) => s.status === "unconfirmed").sort(byScore),
    excluded: [...evaluated.filter((e) => e.status === "excluded"), ...outOfRange],
    widened: shown.some((e) => (e.areaTier ?? 0) > 0),
  };
}

/**
 * The budget for one category, in cents: an explicit per-category budget if
 * the customer set one; otherwise what's left of the total, shared equally
 * by the categories without their own budget.
 */
export function categoryBudgetCents(
  service: string,
  budgetTotal: number | string | null,
  requiredServices: string[],
  categoryBudgets: Record<string, unknown> | null
) {
  const explicit = new Map<string, number>();
  for (const [k, v] of Object.entries(categoryBudgets ?? {})) {
    if (requiredServices.includes(k) && typeof v === "number" && Number.isInteger(v) && v > 0) explicit.set(k, v);
  }
  if (explicit.has(service)) return explicit.get(service)!;
  const totalCents = Math.round(Number(budgetTotal ?? 0) * 100);
  if (!totalCents) return null;
  const rest = requiredServices.filter((s) => !explicit.has(s));
  if (!rest.includes(service)) return null;
  const left = totalCents - [...explicit.values()].reduce((a, b) => a + b, 0);
  return left > 0 ? Math.floor(left / rest.length) : null;
}

/**
 * The customer-facing reason rephrased for the vendor:
 * "Recommended because this photographer covers Parramatta and fits your budget."
 * → "Why you matched: covers Parramatta and fits your budget."
 */
export function reasonForVendor(reason: string | null) {
  if (!reason) return null;
  const m = reason.match(/^Recommended because this .+? (specialises|covers|can travel|offers|fits|is |has |replies)(.*)$/);
  return m ? `Why you matched: ${m[1]}${m[2]}` : reason;
}

/** Plain labels for exclusion codes (admin reports and explanations). */
export const EXCLUSION_LABELS: Record<ExclusionCode, string> = {
  not_approved: "Not approved",
  sample_listing: "Sample listing",
  wrong_category: "Different category",
  paused: "Paused",
  date_blocked: "Date blocked",
  day_off: "Day off",
  booked: "Already booked",
  outside_area: "Outside area",
  duration: "Can't cover the hours",
  over_budget: "Over budget",
};

export type MatchRunRow = {
  event_id: string;
  service: string;
  run_date: string;
  suburb: string;
  event_date: string;
  eligible: number;
  unconfirmed: number;
  excluded: number;
  widened: boolean;
  top_score: number | null;
  exclusion_counts: Record<string, number>;
};

/**
 * One history row per category for match_runs: counts, best score, and how
 * many vendors each rule excluded (a vendor failing two rules counts under
 * both, so the breakdown shows every reason, not just the first).
 */
export function matchRunRows(
  event: { id: string; suburb: string; event_date: string },
  matches: Map<string, CategoryMatches>,
  runDate: string
): MatchRunRow[] {
  return [...matches.values()].map((m) => {
    const counts: Record<string, number> = {};
    for (const e of m.excluded) for (const x of e.exclusions) counts[x.code] = (counts[x.code] ?? 0) + 1;
    const scores = [...m.eligible, ...m.unconfirmed].map((s) => s.score);
    return {
      event_id: event.id,
      service: m.service,
      run_date: runDate,
      suburb: event.suburb,
      event_date: event.event_date,
      eligible: m.eligible.length,
      unconfirmed: m.unconfirmed.length,
      excluded: m.excluded.length,
      widened: m.widened,
      top_score: scores.length ? Math.max(...scores) : null,
      exclusion_counts: counts,
    };
  });
}
