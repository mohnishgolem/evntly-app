import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null, quoteParticipantEmail: vi.fn(async () => null) }));
vi.mock("@/lib/email", () => ({ notify: vi.fn(), formatEventDate: (d: string) => d, formatAmount: (n: number) => `$${n}` }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), RATE_LIMIT_ERROR: "Too many attempts." }));

const invites = await import("@/lib/actions/event-vendors");
const quotes = await import("@/lib/actions/quotes");

const user = { id: "u1", email: "u1@example.invalid" };
const event = {
  id: "e1",
  organiser_user_id: "u1",
  event_type: "Birthday",
  event_date: "2099-11-14",
  start_time: "18:00:00",
  end_time: "22:00:00",
  suburb: "Parramatta",
  latitude: -33.82,
  longitude: 151.0,
  guest_count: "Under 80",
  budget_total: 1000,
  required_services: ["photographer"],
  category_budgets: {},
  notes: null,
};
const vendor = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Vendor ${id}`,
  service_type: "photographer",
  status: "approved",
  is_demo: false,
  available: true,
  unavailable_dates: [],
  weekly_unavailable_days: [],
  latitude: -33.82,
  longitude: 151.0,
  service_radius_km: 30,
  travels_regional: false,
  free_travel_km: 0,
  travel_fee_cents_per_km: 0,
  min_booking_hours: null,
  hourly_rate: 200,
  event_types: ["Birthday"],
  verified: false,
  rating: 0,
  review_count: 0,
  acceptance_rate: null,
  avg_response_hours: null,
  availability_confirmed_at: new Date().toISOString(),
  ...over,
});

describe("requestQuotesForEvent", () => {
  it("rejects more than five vendors or none, before any database call", async () => {
    current = fakeSupabase({ user });
    expect((await invites.requestQuotesForEvent("e1", ["a", "b", "c", "d", "e", "f"])).error).toMatch(/up to 5/);
    expect((await invites.requestQuotesForEvent("e1", [])).error).toMatch(/at least one/);
    expect(current.client.from).not.toHaveBeenCalled();
  });

  it("refuses other people's events", async () => {
    current = fakeSupabase({ user, results: { events: { data: null } } });
    expect(await invites.requestQuotesForEvent("not-mine", ["v1"])).toEqual({ error: "Not your event." });
    expect(current.writes).toHaveLength(0);
  });

  it("skips vendors already asked, and sample listings, without inserting", async () => {
    current = fakeSupabase({
      user,
      results: {
        events: { data: event },
        service_providers: { data: [vendor("v1"), vendor("demo", { is_demo: true })] },
        quote_requests: { data: [{ vendor_id: "v1", service_type: "photographer", status: "pending", expires_at: "2099-01-01T00:00:00Z" }] },
        "rpc:matching_settings": { data: { enabled: true, weights: null } },
        vendor_packages: { data: [] },
        portfolio_items: { data: [] },
        "rpc:vendor_busy_slots": { data: [] },
      },
    });
    const res = await invites.requestQuotesForEvent("e1", ["v1", "demo"]);
    expect(res.error).toBeTruthy();
    expect(res.skipped).toEqual([
      { name: "Vendor v1", reason: "Already asked for a quote" },
      { name: "Vendor demo", reason: "Sample listing, not a real business" },
    ]);
    expect(current.writes).toHaveLength(0);
  });

  it("respects open requests already counting toward the cap of five", async () => {
    const open = ["a", "b", "c", "d", "e"].map((id) => ({ vendor_id: id, service_type: "photographer", status: "quoted", expires_at: "2099-01-01T00:00:00Z" }));
    current = fakeSupabase({
      user,
      results: {
        events: { data: event },
        service_providers: { data: [vendor("v9")] },
        quote_requests: { data: open },
        "rpc:matching_settings": { data: { enabled: true, weights: null } },
      },
    });
    const res = await invites.requestQuotesForEvent("e1", ["v9"]);
    expect(res.skipped?.[0].reason).toMatch(/already have 5 open requests/);
    expect(current.writes).toHaveLength(0);
  });
});

describe("respondToQuote (structured quotes)", () => {
  const reply = {
    amount: 900,
    coverageHours: 4,
    travelFee: 50,
    inclusions: ["Edited gallery"],
    deliveryDays: 14,
    deposit: 270,
    cancellationTerms: "Refundable 30 days out",
    description: "",
  };

  it("rejects a deposit or travel fee larger than the total", async () => {
    current = fakeSupabase({ user });
    expect((await quotes.respondToQuote("q1", "quote", { ...reply, deposit: 1000 }, ""))?.error).toMatch(/deposit/);
    expect((await quotes.respondToQuote("q1", "quote", { ...reply, travelFee: 901 }, ""))?.error).toMatch(/Travel/);
    expect((await quotes.respondToQuote("q1", "quote", { ...reply, amount: 0 }, ""))?.error).toBeTruthy();
    expect(current.writes).toHaveLength(0);
  });

  it("stores travel and deposit in cents", async () => {
    current = fakeSupabase({ user, results: { quote_requests: { data: { vendor_name: "V", event_type: "Birthday", event_date: "2099-11-14", event_id: "e1", quoted_amount: 900 } } } });
    expect(await quotes.respondToQuote("q1", "quote", reply, "See you there")).toEqual({ success: true });
    expect(current.writes[0].payload).toMatchObject({
      status: "quoted",
      quoted_amount: 900,
      travel_fee_cents: 5000,
      deposit_cents: 27000,
      coverage_hours: 4,
      inclusions: ["Edited gallery"],
      vendor_note: "See you there",
    });
  });

  it("declines without touching quote fields", async () => {
    current = fakeSupabase({ user, results: { quote_requests: { data: { vendor_name: "V", event_type: "Birthday", event_date: "2099-11-14", event_id: "e1", quoted_amount: null } } } });
    expect(await quotes.respondToQuote("q1", "decline", null, "Booked out")).toEqual({ success: true });
    expect(current.writes[0].payload).toEqual({ status: "declined", vendor_note: "Booked out" });
  });
});
