import { describe, expect, it } from "vitest";
import {
  dayOfWeek,
  isAvailableOn,
  matchesEvent,
  nextStep,
  planningProgress,
  priceTier,
  servesLocation,
  vendorStanding,
  withinBudget,
  paymentSummary,
  type BoardBooking,
  type BoardMilestone,
  type BoardQuote,
  type MatchableEvent,
  type MatchableVendor,
} from "@/lib/event-board";

const vendor = (over: Partial<MatchableVendor> = {}): MatchableVendor => ({
  id: "v1",
  service_type: "photographer",
  status: "approved",
  available: true,
  unavailable_dates: [],
  weekly_unavailable_days: [],
  latitude: -33.87,
  longitude: 151.21,
  service_radius_km: null,
  hourly_rate: 150,
  ...over,
});

const event = (over: Partial<MatchableEvent> = {}): MatchableEvent => ({
  event_date: "2026-12-05", // a Saturday
  budget_total: 6000,
  required_services: ["photographer", "dj"],
  latitude: -33.89,
  longitude: 151.27,
  ...over,
});

const none = new Set<string>();

describe("availability", () => {
  it("reads the weekday of a calendar date without timezone drift", () => {
    expect(dayOfWeek("2026-12-05")).toBe(6);
    expect(dayOfWeek("2026-12-06")).toBe(0);
  });

  it("excludes blocked dates, weekly days off, paused listings and booked vendors", () => {
    expect(isAvailableOn(vendor(), "2026-12-05", none)).toBe(true);
    expect(isAvailableOn(vendor({ unavailable_dates: ["2026-12-05"] }), "2026-12-05", none)).toBe(false);
    expect(isAvailableOn(vendor({ weekly_unavailable_days: [6] }), "2026-12-05", none)).toBe(false);
    expect(isAvailableOn(vendor({ available: false }), "2026-12-05", none)).toBe(false);
    expect(isAvailableOn(vendor({ status: "pending" }), "2026-12-05", none)).toBe(false);
    expect(isAvailableOn(vendor(), "2026-12-05", new Set(["v1"]))).toBe(false);
  });
});

describe("location", () => {
  it("keeps vendors within their service radius", () => {
    expect(servesLocation(vendor(), event())).toBe(true);
    // Newcastle is ~120 km from Sydney CBD.
    expect(servesLocation(vendor(), event({ latitude: -32.93, longitude: 151.78 }))).toBe(false);
    expect(servesLocation(vendor({ service_radius_km: 200 }), event({ latitude: -32.93, longitude: 151.78 }))).toBe(true);
  });

  it("doesn't exclude anyone when either location is unknown", () => {
    expect(servesLocation(vendor({ latitude: null, longitude: null }), event())).toBe(true);
    expect(servesLocation(vendor(), event({ latitude: null, longitude: null }))).toBe(true);
  });
});

describe("budget", () => {
  it("compares a typical booking with the category's share of the budget", () => {
    // $6000 over two categories = $3000 each; 4h × $150 = $600.
    expect(withinBudget(vendor(), event())).toBe(true);
    expect(withinBudget(vendor({ hourly_rate: 900 }), event())).toBe(false);
  });

  it("skips the check when there's no budget or no rate", () => {
    expect(withinBudget(vendor({ hourly_rate: 9000 }), event({ budget_total: 0 }))).toBe(true);
    expect(withinBudget(vendor({ hourly_rate: 0 }), event())).toBe(true);
  });

  it("combines all rules", () => {
    expect(matchesEvent(vendor(), event(), none)).toBe(true);
    expect(matchesEvent(vendor({ weekly_unavailable_days: [6] }), event(), none)).toBe(false);
  });

  it("buckets hourly rates into price tiers", () => {
    expect([50, 100, 200, 400].map(priceTier)).toEqual(["$", "$$", "$$$", "$$$$"]);
  });
});

const quote = (over: Partial<BoardQuote> = {}): BoardQuote => ({
  id: "q1",
  vendor_id: "v1",
  service_type: "photographer",
  status: "pending",
  expires_at: null,
  quoted_amount: null,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const booking = (over: Partial<BoardBooking> = {}): BoardBooking => ({
  id: "b1",
  provider_id: "v1",
  service_type: "photographer",
  status: "pending",
  total_price: 900,
  ...over,
});

describe("vendor standing", () => {
  const empty = { bookings: [], quotes: [], shortlisted: new Set<string>() };

  it("moves from suggested to confirmed as the customer acts", () => {
    expect(vendorStanding("v1", empty).status).toBe("suggested");
    expect(vendorStanding("v1", { ...empty, shortlisted: new Set(["v1"]) }).status).toBe("shortlisted");
    expect(vendorStanding("v1", { ...empty, quotes: [quote()] }).status).toBe("requested");
    expect(vendorStanding("v1", { ...empty, quotes: [quote({ status: "quoted", quoted_amount: 900 })] }).status).toBe("quoted");
    expect(vendorStanding("v1", { ...empty, bookings: [booking()] }).status).toBe("booked");
    expect(vendorStanding("v1", { ...empty, bookings: [booking({ status: "confirmed" })] }).status).toBe("confirmed");
  });

  it("falls back when a booking is cancelled or a quote expires", () => {
    const shortlisted = new Set(["v1"]);
    expect(vendorStanding("v1", { bookings: [booking({ status: "cancelled" })], quotes: [], shortlisted }).status).toBe(
      "shortlisted"
    );
    const expired = quote({ expires_at: "2026-01-01T00:00:00Z" });
    expect(vendorStanding("v1", { bookings: [], quotes: [expired], shortlisted }).status).toBe("shortlisted");
  });

  it("shows declined only when nothing newer exists", () => {
    const declined = quote({ status: "declined" });
    expect(vendorStanding("v1", { ...empty, quotes: [declined] }).status).toBe("declined");
    expect(vendorStanding("v1", { ...empty, quotes: [declined, quote({ id: "q2", created_at: "2026-10-02T00:00:00Z" })] }).status).toBe(
      "requested"
    );
  });
});

describe("progress and next step", () => {
  it("counts categories with a confirmed vendor", () => {
    expect(planningProgress(["photographer", "dj"], [booking({ status: "confirmed" })])).toEqual({
      done: 1,
      total: 2,
      percent: 50,
    });
    expect(planningProgress([], []).percent).toBe(0);
  });

  const base = {
    requiredServices: ["photographer", "dj"],
    availableByService: new Map([
      ["photographer", 3],
      ["dj", 1],
    ]),
    bookings: [] as BoardBooking[],
    quotes: [] as BoardQuote[],
    shortlistByService: new Map<string, number>(),
    eventPast: false,
  };

  it("starts with finding the first category's vendors", () => {
    expect(nextStep(base)).toEqual({ kind: "find", service: "photographer", available: 3 });
  });

  it("puts a quote waiting for the customer first", () => {
    const quotes = [quote({ service_type: "dj", status: "quoted", quoted_amount: 500 })];
    expect(nextStep({ ...base, quotes })).toEqual({ kind: "review-quote", service: "dj", count: 1 });
  });

  it("asks for quotes from a shortlist, then moves on while waiting", () => {
    expect(nextStep({ ...base, shortlistByService: new Map([["photographer", 2]]) })).toEqual({
      kind: "request-quotes",
      service: "photographer",
      shortlisted: 2,
    });
    expect(nextStep({ ...base, quotes: [quote()] })).toEqual({ kind: "find", service: "dj", available: 1 });
  });

  it("finishes with the event day once every category is booked", () => {
    const bookings = [booking(), booking({ id: "b2", provider_id: "v2", service_type: "dj" })];
    expect(nextStep({ ...base, bookings })).toEqual({ kind: "event-day" });
    expect(nextStep({ ...base, requiredServices: [] })).toEqual({ kind: "add-categories" });
  });
});

describe("payment summary", () => {
  const plan = { id: "p1", booking_id: "b1", status: "agreed", total_cents: 100000 };
  const ms = (over: Partial<BoardMilestone>): BoardMilestone => ({
    plan_id: "p1",
    kind: "milestone",
    amount_cents: 50000,
    funding_status: "unfunded",
    payout_status: "pending",
    work_status: "pending",
    ...over,
  });

  it("asks the customer to act on a proposed plan or an unpaid deposit", () => {
    expect(paymentSummary(undefined, []).label).toBe("Pay the vendor directly");
    expect(paymentSummary({ ...plan, status: "proposed" }, [])).toMatchObject({ actionDue: true });
    expect(paymentSummary(plan, [ms({ kind: "deposit" })])).toMatchObject({ label: "Deposit due", actionDue: true });
  });

  it("never reports money as released until the payout is confirmed paid", () => {
    const approvedFunded = ms({ work_status: "approved", funding_status: "funded", payout_status: "processing" });
    const s = paymentSummary(plan, [approvedFunded, ms({})]);
    expect(s.releasedCents).toBe(0);
    expect(s.paidCents).toBe(50000);
    expect(s.label).toBe("Paid to Evntly, held");
  });

  it("reports paid in full only when every live milestone has paid out", () => {
    const paid = ms({ funding_status: "funded", payout_status: "paid", work_status: "approved" });
    expect(paymentSummary(plan, [paid, paid]).label).toBe("Paid in full");
    expect(paymentSummary(plan, [paid, ms({ work_status: "cancelled" })]).label).toBe("Paid in full");
  });
});
