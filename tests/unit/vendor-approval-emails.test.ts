import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { fakeSupabase } from "./fake-supabase";

// Approval emails look up addresses with the REAL service-role supabase-js
// client (network faked), not a mocked one.
const calls: string[] = [];
let vendorRow: Record<string, unknown> | null = null;
const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  calls.push(url);
  let body: unknown = null;
  if (url.includes("/service_providers?")) body = vendorRow;
  else if (url.includes("/users?")) body = [{ email: "admin@realdomain.com.au" }, { email: "ops@realdomain.com.au" }];
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
});

const notified: { to: string; subject: string; category: string; cta: { path: string } }[] = [];
let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    createClient("https://example.supabase.co", "service-role-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fakeFetch as unknown as typeof fetch },
    }),
}));
vi.mock("@/lib/email", () => ({ notify: vi.fn((n: (typeof notified)[number]) => void notified.push(n)) }));
vi.mock("@/lib/data/user", () => ({ getAdminSession: async () => ({ session: {}, admin: true, mfa: "ok" }) }));
vi.mock("@/lib/geocode", () => ({ geocodeSuburb: async () => null, isInAustralia: () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { setVendorStatus } = await import("@/lib/actions/admin");
const { submitVendorListing } = await import("@/lib/actions/vendor-signup");

beforeEach(() => {
  calls.length = 0;
  notified.length = 0;
  current = fakeSupabase({ user: { id: "u1", email: "vendor@realdomain.com.au" }, aal: "aal2" });
});

describe("vendor approval emails", () => {
  it("tells the vendor their listing is live when an admin approves it", async () => {
    vendorRow = { name: "Lens & Light", owner_email: "vendor@realdomain.com.au", is_demo: false };
    expect(await setVendorStatus("v1", "approved")).toEqual({ success: true });
    expect(calls.some((u) => u.includes("/rest/v1/service_providers?select=name%2Cowner_email%2Cis_demo&id=eq.v1"))).toBe(true);
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ to: "vendor@realdomain.com.au", category: "bookings", cta: { path: "/vendor-dashboard" } });
  });

  it("doesn't email for sample listings or other status changes", async () => {
    vendorRow = { name: "Sample", owner_email: "demo@evntly.test", is_demo: true };
    await setVendorStatus("v1", "approved");
    await setVendorStatus("v1", "suspended");
    expect(notified).toHaveLength(0);
  });

  it("tells every admin when a new listing is submitted", async () => {
    await submitVendorListing({
      businessName: "Lens & Light", bio: "", serviceType: "photographer", hourlyRate: 150, city: "Parramatta",
      locationsServiced: [], eventTypes: ["wedding"],
    });
    expect(notified.map((n) => n.to)).toEqual(["admin@realdomain.com.au", "ops@realdomain.com.au"]);
    expect(notified.every((n) => n.cta.path === "/admin/approvals")).toBe(true);
  });
});
