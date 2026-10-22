import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { fakeSupabase } from "./fake-supabase";

// Dispute notifications look up the parties with the REAL service-role
// supabase-js client (network faked) — the kind of wrapper that broke
// production once when it was only tested with mocks.
const calls: string[] = [];
const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  calls.push(url);
  let body: unknown = null;
  if (url.includes("/booking_disputes?")) {
    body = { id: "d1", booking_id: "b1", reason: "no_show", status: "open", outcome: null, resolution_note: null,
             opened_by_role: "customer", customer_user_id: "0b6f1a52-3c4d-4e5f-8a9b-1c2d3e4f5a6b", vendor_user_id: "7e8f9a0b-1c2d-4e3f-9a5b-6c7d8e9f0a1b" };
  } else if (url.includes("/auth/v1/admin/users/7e8f9a0b-1c2d-4e3f-9a5b-6c7d8e9f0a1b")) body = { id: "7e8f9a0b-1c2d-4e3f-9a5b-6c7d8e9f0a1b", email: "vendor@realdomain.com.au" };
  else if (url.includes("/auth/v1/admin/users/0b6f1a52-3c4d-4e5f-8a9b-1c2d3e4f5a6b")) body = { id: "0b6f1a52-3c4d-4e5f-8a9b-1c2d3e4f5a6b", email: "customer@realdomain.com.au" };
  else if (url.includes("/users?")) body = [{ email: "admin@realdomain.com.au" }];
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
});

const notified: { to: string; subject: string; category: string }[] = [];
let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    createClient("https://example.supabase.co", "service-role-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fakeFetch as unknown as typeof fetch },
    }),
}));
vi.mock("@/lib/email", () => ({ notify: vi.fn((n: { to: string; subject: string; category: string }) => void notified.push(n)) }));
vi.mock("@/lib/data/user", () => ({ getAdminSession: async () => ({ admin: false, mfa: "n/a" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { openDispute } = await import("@/lib/actions/disputes");

describe("opening a dispute notifies the other party and admins", () => {
  it("emails the vendor (counterparty) and each admin, never the customer who raised it", async () => {
    current = fakeSupabase({ user: { id: "0b6f1a52-3c4d-4e5f-8a9b-1c2d3e4f5a6b", email: "customer@realdomain.com.au" }, results: { "rpc:open_booking_dispute": { data: "d1" } } });
    const res = await openDispute({ bookingId: "b1", reason: "no_show", description: "The vendor never arrived at the venue.", desiredOutcome: "" });
    expect(res).toEqual({ success: true, disputeId: "d1" });
    expect(calls.some((u) => u.includes("/rest/v1/booking_disputes?select="))).toBe(true);
    expect(calls.some((u) => u.endsWith("/auth/v1/admin/users/7e8f9a0b-1c2d-4e3f-9a5b-6c7d8e9f0a1b"))).toBe(true);
    expect(notified.map((n) => n.to).sort()).toEqual(["admin@realdomain.com.au", "vendor@realdomain.com.au"]);
    expect(notified.every((n) => n.category === "bookings")).toBe(true);
  });
});
