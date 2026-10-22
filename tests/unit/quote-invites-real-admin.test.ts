import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { fakeSupabase } from "./fake-supabase";

// The match score is written with the REAL service-role supabase-js client
// (only the network is faked) — mocks of that call are what let a detached
// method reach production once before.
const adminCalls: { method: string; url: string; body: unknown }[] = [];
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  adminCalls.push({ method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
});

let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    createClient("https://example.supabase.co", "service-role-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fakeFetch as unknown as typeof fetch },
    }),
  quoteParticipantEmail: vi.fn(async () => null),
}));
vi.mock("@/lib/email", () => ({ notify: vi.fn(), formatEventDate: (d: string) => d, formatAmount: (n: number) => `$${n}` }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), RATE_LIMIT_ERROR: "Too many attempts." }));

const { requestQuotesForEvent } = await import("@/lib/actions/event-vendors");

describe("inviting a matched vendor", () => {
  it("sends the request as the customer, then records the server's score with the service role", async () => {
    current = fakeSupabase({
      user: { id: "u1", email: "u1@example.invalid" },
      results: {
        events: {
          data: {
            id: "e1", organiser_user_id: "u1", event_type: "Birthday", event_date: "2099-11-14", start_time: "18:00:00", end_time: "22:00:00",
            suburb: "Parramatta", latitude: -33.82, longitude: 151.0, guest_count: "Under 80", budget_total: 1000,
            required_services: ["photographer"], category_budgets: {}, notes: null,
          },
        },
        service_providers: {
          data: [{
            id: "v1", name: "Good Photo", service_type: "photographer", status: "approved", is_demo: false, available: true,
            unavailable_dates: [], weekly_unavailable_days: [], latitude: -33.82, longitude: 151.0, service_radius_km: 30,
            travels_regional: false, free_travel_km: 0, travel_fee_cents_per_km: 0, min_booking_hours: null, hourly_rate: 200,
            event_types: ["Birthday"], verified: true, rating: 0, review_count: 0, acceptance_rate: null, avg_response_hours: null,
            availability_confirmed_at: new Date().toISOString(),
          }],
        },
        quote_requests: { data: [] },
        "quote_requests:insert": { data: { id: "q1", service_type: "photographer" } },
        "rpc:matching_settings": { data: { enabled: true, weights: null } },
        vendor_packages: { data: [] },
        portfolio_items: { data: [] },
        "rpc:vendor_busy_slots": { data: [] },
      },
    });
    const res = await requestQuotesForEvent("e1", ["v1"]);
    expect(res).toEqual({ success: true, sent: 1, skipped: [] });

    const insert = current.writes.find((w) => w.op === "insert")!;
    expect(insert.payload).toMatchObject({ vendor_id: "v1", event_id: "e1", origin: "smart_match", estimated_hours: 4 });
    expect(insert.payload).not.toHaveProperty("match_score"); // never from the customer's client

    expect(adminCalls).toHaveLength(1);
    expect(adminCalls[0].method).toBe("PATCH");
    expect(adminCalls[0].url).toBe("https://example.supabase.co/rest/v1/quote_requests?id=eq.q1");
    const body = adminCalls[0].body as { match_score: number; match_reason: string };
    expect(body.match_score).toBeGreaterThan(50);
    expect(body.match_reason).toMatch(/^Recommended because this photographer specialises in birthday events, covers Parramatta/);
  });
});
