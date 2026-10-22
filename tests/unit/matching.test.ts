import { describe, expect, it } from "vitest";
import {
  budgetFit,
  categoryBudgetCents,
  DEFAULT_WEIGHTS,
  evaluateVendor,
  eventHours,
  eventSlot,
  isBusy,
  matchCategory,
  normaliseWeights,
  qualityFit,
  reliabilityFit,
  type BusySlot,
  type MatchContext,
  type MatchEvent,
  type MatchVendor,
} from "@/lib/matching/engine";
import { estimatePrice, packagePriceCents, travelFeeCents, type MatchPackage } from "@/lib/matching/pricing";

// Suburb centroids, rounded to 2dp like the app stores them.
const PARRAMATTA = { latitude: -33.82, longitude: 151.0 };
const PENRITH = { latitude: -33.75, longitude: 150.69 };
const BONDI = { latitude: -33.89, longitude: 151.27 };
const NEWCASTLE = { latitude: -32.93, longitude: 151.78 };

const NOW = new Date("2026-10-22T00:00:00Z");
const FRESH = "2026-10-10T00:00:00Z";

const vendor = (id: string, over: Partial<MatchVendor> = {}): MatchVendor => ({
  id,
  name: id,
  service_type: "photographer",
  status: "approved",
  is_demo: false,
  available: true,
  unavailable_dates: [],
  weekly_unavailable_days: [],
  ...PARRAMATTA,
  service_radius_km: 30,
  travels_regional: false,
  free_travel_km: 0,
  travel_fee_cents_per_km: 0,
  min_booking_hours: null,
  hourly_rate: 200,
  event_types: ["Birthday", "Wedding"],
  verified: false,
  rating: 0,
  review_count: 0,
  acceptance_rate: null,
  avg_response_hours: null,
  availability_confirmed_at: FRESH,
  ...over,
});

const pkg = (id: string, over: Partial<MatchPackage> = {}): MatchPackage => ({
  id,
  name: `${id} package`,
  price_cents: 85_000,
  included_hours: 4,
  extra_hour_cents: null,
  inclusions: ["Edited gallery"],
  delivery_days: 14,
  deposit_percent: 30,
  active: true,
  ...over,
});

// The brief's example: a 4-hour birthday in Parramatta, $1,000 all-in.
const birthday: MatchEvent = {
  eventType: "Birthday",
  date: "2026-11-14", // a Saturday
  startTime: "18:00",
  endTime: "22:00",
  suburb: "Parramatta",
  ...PARRAMATTA,
  budgetCents: 100_000,
};

function ctx(over: Partial<MatchContext> = {}): MatchContext {
  return { packages: new Map(), portfolioCounts: new Map(), busy: [], weights: DEFAULT_WEIGHTS, now: NOW, ...over };
}

describe("Parramatta birthday, photographer, $1,000 all-in", () => {
  const vendors = [
    vendor("good", { verified: true }),
    vendor("over-budget"),
    vendor("far-away", { ...NEWCASTLE, service_radius_km: 40 }),
    vendor("booked"),
    vendor("pending-approval", { status: "pending_review" }),
    vendor("sample", { is_demo: true }),
    vendor("travel-tips-over", { ...PENRITH, service_radius_km: 50, free_travel_km: 10, travel_fee_cents_per_km: 300 }),
    vendor("stale-calendar", { availability_confirmed_at: "2026-05-01T00:00:00Z" }),
    vendor("dj", { service_type: "dj" }),
    vendor("blocked-date", { unavailable_dates: ["2026-11-14"] }),
    vendor("saturdays-off", { weekly_unavailable_days: [6] }),
    vendor("paused", { available: false }),
    vendor("too-short", { hourly_rate: 0 }),
    vendor("min-hours", { hourly_rate: 150, min_booking_hours: 6, event_types: [] }),
  ];
  const packages = new Map<string, MatchPackage[]>([
    ["good", [pkg("good")]],
    ["over-budget", [pkg("ob", { price_cents: 120_000 })]],
    ["travel-tips-over", [pkg("tt", { price_cents: 95_000 })]],
    ["stale-calendar", [pkg("sc")]],
    ["too-short", [pkg("ts", { included_hours: 2 })]],
  ]);
  const busy: BusySlot[] = [{ provider_id: "booked", slot_start: "2026-11-14T17:00", slot_end: "2026-11-14T21:00" }];
  const result = matchCategory(vendors, "photographer", birthday, ctx({ packages, busy }));
  const excluded = new Map(result.excluded.map((e) => [e.vendorId, e.exclusions.map((x) => x.code)]));

  it("confirms only vendors who pass every check", () => {
    expect(result.eligible.map((m) => m.vendorId).sort()).toEqual(["good", "min-hours"]);
  });

  it("excludes each unsuitable vendor for the right reason", () => {
    expect(excluded.get("over-budget")).toEqual(["over_budget"]);
    expect(excluded.get("far-away")).toEqual(["outside_area"]);
    expect(excluded.get("booked")).toEqual(["booked"]);
    expect(excluded.get("pending-approval")).toEqual(["not_approved"]);
    expect(excluded.get("sample")).toEqual(["sample_listing"]);
    expect(excluded.get("travel-tips-over")).toEqual(["over_budget"]);
    expect(excluded.get("dj")).toEqual(["wrong_category"]);
    expect(excluded.get("blocked-date")).toEqual(["date_blocked"]);
    expect(excluded.get("saturdays-off")).toEqual(["day_off"]);
    expect(excluded.get("paused")).toEqual(["paused"]);
    expect(excluded.get("too-short")).toEqual(["duration"]);
  });

  it("never lists an excluded vendor as a match", () => {
    const shown = new Set([...result.eligible, ...result.unconfirmed].map((m) => m.vendorId));
    for (const id of excluded.keys()) expect(shown.has(id)).toBe(false);
  });

  it("lists vendors with a stale calendar separately as availability pending", () => {
    expect(result.unconfirmed.map((m) => m.vendorId)).toEqual(["stale-calendar"]);
    expect(result.unconfirmed[0].pending.map((p) => p.code)).toEqual(["calendar_unconfirmed"]);
  });

  it("counts travel in the budget check", () => {
    const e = result.excluded.find((x) => x.vendorId === "travel-tips-over")!;
    // ~30 km from Penrith to Parramatta, 10 km free → (km − 10) × 2 × $3.
    const km = Math.round(e.distanceKm!);
    expect(km).toBeGreaterThanOrEqual(28);
    expect(km).toBeLessThanOrEqual(32);
    expect(e.price!.travelCents).toBe((km - 10) * 2 * 300);
    expect(e.price!.totalCents).toBe(95_000 + (km - 10) * 600);
    expect(e.exclusions[0].message).toBe(`Estimated $${((95_000 + (km - 10) * 600) / 100).toLocaleString("en-AU")} — over your $1,000 budget`);
  });

  it("prices the minimum-hours vendor at their minimum", () => {
    const m = result.eligible.find((x) => x.vendorId === "min-hours")!;
    expect(m.price!.billedHours).toBe(6);
    expect(m.price!.totalCents).toBe(90_000);
    expect(m.price!.notes).toContain("Minimum 6 hours");
  });

  it("explains the top match in plain words", () => {
    const top = result.eligible[0];
    expect(top.vendorId).toBe("good");
    expect(top.reason).toBe(
      "Recommended because this photographer specialises in birthday events, covers Parramatta and offers a 4-hour package within your budget."
    );
    expect(top.score).toBeGreaterThan(result.eligible[1].score);
  });
});

describe("time", () => {
  it("handles events past midnight", () => {
    expect(eventHours("22:00", "02:00")).toBe(4);
    expect(eventHours("18:00", "22:30")).toBe(4.5);
    expect(eventHours(null, null)).toBeNull();
  });

  it("treats an event with no times as the whole day", () => {
    const [s, e] = eventSlot({ date: "2026-11-14", startTime: null, endTime: null });
    expect(e - s).toBe(24 * 3600_000);
  });

  it("detects overlaps with half-open ranges", () => {
    const ev = { ...birthday, startTime: "14:00", endTime: "18:00" };
    const slot = (a: string, b: string): BusySlot[] => [{ provider_id: "v", slot_start: a, slot_end: b }];
    expect(isBusy("v", ev, slot("2026-11-14T10:00", "2026-11-14T14:00"))).toBe(false); // back-to-back
    expect(isBusy("v", ev, slot("2026-11-14T17:59", "2026-11-14T19:00"))).toBe(true);
    expect(isBusy("v", ev, slot("2026-11-13T00:00", "2026-11-14T00:00"))).toBe(false); // whole previous day
    expect(isBusy("other", ev, slot("2026-11-14T15:00", "2026-11-14T16:00"))).toBe(false);
  });

  it("catches an overnight booking spilling into the next day", () => {
    const ev = { ...birthday, date: "2026-11-15", startTime: "01:00", endTime: "03:00" };
    expect(isBusy("v", ev, [{ provider_id: "v", slot_start: "2026-11-14T22:00:00", slot_end: "2026-11-15T02:00:00" }])).toBe(true);
  });
});

describe("pricing", () => {
  const v = { hourly_rate: 150, min_booking_hours: null, free_travel_km: 15, travel_fee_cents_per_km: 100 };

  it("charges travel each way beyond the free radius", () => {
    expect(travelFeeCents(v, 10)).toBe(0);
    expect(travelFeeCents(v, 25.4)).toBe(10 * 2 * 100);
    expect(travelFeeCents({ ...v, travel_fee_cents_per_km: 0 }, 300)).toBe(0);
    expect(travelFeeCents(v, null)).toBe(0);
  });

  it("adds extra hours (rounded up to the half hour) to a package", () => {
    const p = pkg("p", { included_hours: 4, extra_hour_cents: 20_000 });
    expect(packagePriceCents(p, 4, null)!.cents).toBe(85_000);
    expect(packagePriceCents(p, 5.2, null)!.cents).toBe(85_000 + 30_000); // billed 5.5h
    expect(packagePriceCents(pkg("short", { included_hours: 3 }), 4, null)).toBeNull();
    expect(packagePriceCents(pkg("flat", { included_hours: null }), 9, null)!.cents).toBe(85_000);
  });

  it("picks the cheapest package that covers the event", () => {
    const packages = [
      pkg("big", { price_cents: 150_000, included_hours: 8 }),
      pkg("small", { price_cents: 60_000, included_hours: 3, extra_hour_cents: 15_000 }),
      pkg("off", { price_cents: 1_000, active: false }),
    ];
    const est = estimatePrice(v, packages, 4, 10)!;
    expect(est.packageId).toBe("small");
    expect(est.totalCents).toBe(75_000);
  });

  it("falls back to the hourly rate, and says when hours were assumed", () => {
    const est = estimatePrice(v, [], null, 0)!;
    expect(est.basis).toBe("hourly");
    expect(est.totalCents).toBe(4 * 15_000);
    expect(est.assumedHours).toBe(true);
    expect(estimatePrice({ ...v, hourly_rate: 0 }, [], 4, 0)).toBeNull();
  });
});

describe("scoring", () => {
  it("peaks at 70–90% of budget and is zero over budget", () => {
    expect(budgetFit(80_000, 100_000)).toBe(1);
    expect(budgetFit(30_000, 100_000)).toBe(0.7);
    expect(budgetFit(100_000, 100_000)).toBeCloseTo(0.75);
    expect(budgetFit(110_000, 100_000)).toBe(0);
    expect(budgetFit(null, 100_000)).toBe(0.5);
  });

  it("doesn't penalise new vendors for having no reviews", () => {
    const fresh = qualityFit(vendor("new", { review_count: 0, rating: 0 }), 0);
    const poorlyRated = qualityFit(vendor("meh", { review_count: 12, rating: 3 }), 0);
    const oneReview = qualityFit(vendor("one", { review_count: 1, rating: 1 }), 0);
    expect(fresh).toBeGreaterThan(poorlyRated);
    expect(oneReview).toBe(fresh); // a single review doesn't move the score yet
  });

  it("scores unknown reliability as neutral", () => {
    expect(reliabilityFit({ avg_response_hours: null, acceptance_rate: null })).toBe(0.5);
    expect(reliabilityFit({ avg_response_hours: 1, acceptance_rate: 100 })).toBe(1);
  });

  it("keeps scores within 0–100 and responds to admin weights", () => {
    const v = vendor("v", { event_types: ["Birthday"] });
    const e = evaluateVendor(v, "photographer", birthday, ctx());
    const base = matchCategory([v], "photographer", birthday, ctx()).eligible[0].score;
    const budgetOnly = matchCategory([v], "photographer", birthday, ctx({ weights: normaliseWeights({ suitability: 0, budget: 100, quality: 0, location: 0, reliability: 0 }) })).eligible[0];
    expect(e.status).toBe("eligible");
    expect(base).toBeGreaterThanOrEqual(0);
    expect(base).toBeLessThanOrEqual(100);
    expect(budgetOnly.score).toBe(Math.round(budgetOnly.parts.budget * 100));
  });

  it("rejects malformed weights", () => {
    expect(normaliseWeights({ suitability: "x" })).toEqual(DEFAULT_WEIGHTS);
    expect(normaliseWeights({ suitability: 1, budget: 1, quality: 1, location: 1, reliability: 1 }).budget).toBe(20);
    expect(normaliseWeights({ suitability: -5, budget: 1, quality: 1, location: 1, reliability: 1 })).toEqual(DEFAULT_WEIGHTS);
  });
});

describe("location and widening", () => {
  it("widens to ×1.5 then ×2 only when fewer than 3 vendors are in range", () => {
    // Bondi is ~26 km from Parramatta.
    const near = vendor("near");
    const edge = vendor("edge", { ...BONDI, service_radius_km: 15 }); // 26/15 ≈ 1.75× → tier 2
    const result = matchCategory([near, edge], "photographer", birthday, ctx());
    expect(result.widened).toBe(true);
    expect(result.eligible.map((m) => m.vendorId)).toEqual(["near", "edge"]);
    expect(result.eligible[1].reason).toContain("can travel to Parramatta");

    const plenty = [vendor("a"), vendor("b"), vendor("c"), edge];
    const narrow = matchCategory(plenty, "photographer", birthday, ctx());
    expect(narrow.widened).toBe(false);
    expect(narrow.eligible.map((m) => m.vendorId)).not.toContain("edge");
    expect(narrow.excluded.find((e) => e.vendorId === "edge")!.exclusions[0].code).toBe("outside_area");
  });

  it("lets regional travellers reach far events", () => {
    const newcastleEvent = { ...birthday, suburb: "Newcastle", ...NEWCASTLE };
    const regional = vendor("regional", { travels_regional: true });
    const local = vendor("local");
    const r = matchCategory([regional, local], "photographer", newcastleEvent, ctx());
    expect(r.eligible.map((m) => m.vendorId)).toEqual(["regional"]);
  });

  it("holds vendors as pending when either side has no location", () => {
    const e1 = evaluateVendor(vendor("v", { latitude: null, longitude: null }), "photographer", birthday, ctx());
    const e2 = evaluateVendor(vendor("v"), "photographer", { ...birthday, latitude: null, longitude: null }, ctx());
    expect(e1.status).toBe("unconfirmed");
    expect(e1.pending.map((p) => p.code)).toContain("vendor_unlocated");
    expect(e2.pending.map((p) => p.code)).toContain("event_unlocated");
  });
});

describe("category budgets", () => {
  it("uses the whole budget for a single category", () => {
    expect(categoryBudgetCents("photographer", 1000, ["photographer"], {})).toBe(100_000);
  });

  it("splits what's left after explicit category budgets", () => {
    const services = ["photographer", "dj", "caterer"];
    const set = { caterer: 300_000 };
    expect(categoryBudgetCents("caterer", 5000, services, set)).toBe(300_000);
    expect(categoryBudgetCents("dj", 5000, services, set)).toBe(100_000);
    expect(categoryBudgetCents("photographer", null, services, {})).toBeNull();
  });

  it("ignores junk in category_budgets", () => {
    expect(categoryBudgetCents("dj", 1000, ["dj"], { dj: "lots" as unknown as number })).toBe(100_000);
    expect(categoryBudgetCents("dj", 1000, ["dj"], { dj: -5 })).toBe(100_000);
  });
});
