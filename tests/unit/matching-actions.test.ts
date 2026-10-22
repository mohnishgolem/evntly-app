import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/geocode", () => ({ geocodeSuburb: vi.fn(async () => ({ label: "Parramatta", latitude: -33.82, longitude: 151.0 })) }));

const pricing = await import("@/lib/actions/vendor-pricing");
const events = await import("@/lib/actions/events");
const board = await import("@/lib/actions/event-board");

const user = { id: "u1", email: "u1@example.invalid" };
const area = { radiusKm: 40, freeTravelKm: 15, travelFeePerKm: 1.5, travelsRegional: false, minBookingHours: 3 };
const pkg = {
  name: "4 hour coverage",
  description: "",
  price: 850,
  includedHours: 4,
  extraHourPrice: 200,
  inclusions: ["Edited gallery"],
  deliveryDays: 14,
  depositPercent: 30,
  active: true,
};

describe("vendor pricing actions", () => {
  it("refuse logged-out callers and listings they don't own", async () => {
    current = fakeSupabase({ user: null });
    expect(await pricing.updateServiceArea("l1", area)).toEqual({ error: "Listing not found." });
    current = fakeSupabase({ user, results: { "rpc:my_service_providers": { data: null } } });
    expect(await pricing.updateServiceArea("someone-elses", area)).toEqual({ error: "Listing not found." });
    expect(await pricing.savePackage("someone-elses", pkg)).toEqual({ error: "Listing not found." });
    expect(await pricing.deletePackage("someone-elses", "p1")).toEqual({ error: "Listing not found." });
    expect(await pricing.confirmCalendarCurrent("someone-elses")).toEqual({ error: "Listing not found." });
    expect(current.writes).toHaveLength(0);
  });

  it("store travel fees and package prices in integer cents", async () => {
    current = fakeSupabase({ user, results: { "rpc:my_service_providers": { data: { id: "l1" } } } });
    expect(await pricing.updateServiceArea("l1", area)).toEqual({ success: true });
    expect(await pricing.savePackage("l1", { ...pkg, price: 849.99 })).toEqual({ success: true });
    expect(current.writes).toEqual([
      {
        table: "service_providers",
        op: "update",
        payload: { service_radius_km: 40, free_travel_km: 15, travel_fee_cents_per_km: 150, travels_regional: false, min_booking_hours: 3 },
      },
      expect.objectContaining({
        table: "vendor_packages",
        op: "insert",
        payload: expect.objectContaining({ provider_id: "l1", price_cents: 84_999, extra_hour_cents: 20_000, included_hours: 4 }),
      }),
    ]);
  });

  it("reject out-of-range or tampered input before touching the database", async () => {
    current = fakeSupabase({ user, results: { "rpc:my_service_providers": { data: { id: "l1" } } } });
    expect((await pricing.updateServiceArea("l1", { ...area, travelFeePerKm: 500 }))?.error).toBeTruthy();
    expect((await pricing.updateServiceArea("l1", { ...area, freeTravelKm: 100 }))?.error).toMatch(/radius/);
    expect((await pricing.savePackage("l1", { ...pkg, price: -5 }))?.error).toBeTruthy();
    expect((await pricing.savePackage("l1", { ...pkg, includedHours: null }))?.error).toMatch(/Extra hours/);
    expect((await pricing.savePackage("l1", { ...pkg, inclusions: ["x".repeat(121)] }))?.error).toBeTruthy();
    expect(current.writes).toHaveLength(0);
  });
});

describe("creating an event from /plan", () => {
  const draft = {
    eventType: "Birthday",
    eventDate: "2099-11-14",
    suburb: "Parramatta",
    guestCount: "Under 80",
    budgetTotal: 1000,
    requiredServices: ["photographer"],
    notes: "",
    startTime: "18:00",
    endTime: "22:00",
  };

  it("tells anonymous visitors to sign in (so /plan stashes the draft)", async () => {
    current = fakeSupabase({ user: null });
    expect(await events.claimEventPlan(draft)).toEqual({ error: "Not logged in" });
  });

  it("saves times with the event", async () => {
    current = fakeSupabase({ user, results: { events: { data: { id: "e1" } } } });
    expect(await events.claimEventPlan(draft)).toEqual({ success: true, eventId: "e1" });
    expect(current.writes[0].payload).toMatchObject({ start_time: "18:00", end_time: "22:00", required_services: ["photographer"] });
  });

  it("rejects half-set times, unknown categories and made-up event types", async () => {
    current = fakeSupabase({ user, results: { events: { data: { id: "e1" } } } });
    expect((await events.claimEventPlan({ ...draft, endTime: "" }))?.error).toMatch(/both/);
    expect((await events.claimEventPlan({ ...draft, startTime: "25:00" }))?.error).toBeTruthy();
    expect((await events.claimEventPlan({ ...draft, requiredServices: ["hitman"] }))?.error).toBe("Unknown vendor category.");
    expect((await events.claimEventPlan({ ...draft, eventType: "<script>" }))?.error).toBeTruthy();
    expect(current.writes).toHaveLength(0);
  });
});

describe("editing event times and category budgets", () => {
  const own = { id: "e1", event_date: "2099-06-01", suburb: "Bondi", required_services: ["dj", "photographer"], start_time: null, end_time: null };
  const details = {
    name: "",
    eventDate: "2099-06-01",
    suburb: "Bondi",
    guestCount: "Under 80" as const,
    budgetTotal: 3000,
    notes: "",
    startTime: "19:00",
    endTime: "01:00",
  };

  it("stores category budgets in cents", async () => {
    current = fakeSupabase({ user, results: { events: { data: own } } });
    expect(await board.updateEventDetails("e1", { ...details, categoryBudgets: { photographer: 1200.5 } })).toEqual({ success: true });
    expect(current.writes[0].payload).toMatchObject({ start_time: "19:00", end_time: "01:00", category_budgets: { photographer: 120_050 } });
  });

  it("rejects budgets for other categories or above the total", async () => {
    current = fakeSupabase({ user, results: { events: { data: own } } });
    expect(await board.updateEventDetails("e1", { ...details, categoryBudgets: { caterer: 100 } })).toEqual({ error: "Unknown vendor category." });
    expect((await board.updateEventDetails("e1", { ...details, categoryBudgets: { dj: 2000, photographer: 2000 } }))?.error).toMatch(/more than your total/);
    expect(current.writes).toHaveLength(0);
  });
});
