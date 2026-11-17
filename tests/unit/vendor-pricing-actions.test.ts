import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Vendor sign-up and listing edits save the vendor's pricing model through the
// REAL Supabase client; only the network is faked. Checks the exact columns
// written for each model (they must satisfy the DB check
// service_providers_price_matches_model) and that a quote-only vendor never
// needs an hourly rate.

type Call = { method: string; url: string; body: unknown };
const calls: Call[] = [];

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  if (url.includes("/auth/v1/user")) return json({ id: "user-1", email: "vendor@example.com", aud: "authenticated" });
  if (url.includes("rpc/my_service_providers")) return json(null);
  if (url.includes("rpc/record_legal_acceptance")) return json(null);
  if (url.includes("beta_applications")) return json(null);
  if (method === "POST" || method === "PATCH") return new Response(null, { status: 201 });
  return json([]);
});

const client = createClient("https://example.supabase.co", "anon-test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});

// No browser session in tests: stub only who is signed in. Every database
// call still goes through the real client to the fake network.
vi.spyOn(client.auth, "getUser").mockResolvedValue({
  data: { user: { id: "user-1", email: "vendor@example.com" } },
  error: null,
} as never);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("@/lib/email", () => ({ notify: vi.fn() }));
const recordFunnelEvent = vi.fn();
vi.mock("@/lib/funnel-events", () => ({ recordFunnelEvent }));
vi.mock("@/lib/founding/notify", () => ({ emailApplicationReceived: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { submitVendorListing, updateVendorListing } = await import("@/lib/actions/vendor-signup");

const base = {
  businessName: "MC Test",
  bio: "",
  serviceType: "mc",
  city: "Parramatta",
  latitude: -33.81,
  longitude: 151.0,
  locationsServiced: ["Parramatta"],
  eventTypes: ["Wedding"],
  abn: "51 824 753 556", // valid checksum (ATO example ABN)
};

const inserted = () => calls.find((c) => c.method === "POST" && c.url.includes("/rest/v1/service_providers"))?.body as
  | Record<string, unknown>
  | undefined;
const patched = () => calls.find((c) => c.method === "PATCH" && c.url.includes("/rest/v1/service_providers"))?.body as
  | Record<string, unknown>
  | undefined;

async function submit(draft: Record<string, unknown>) {
  try {
    return await submitVendorListing({ ...base, ...draft } as never, { acceptedVendorAgreement: true });
  } catch (e) {
    return { redirected: String((e as Error).message) };
  }
}

beforeEach(() => {
  calls.length = 0;
});

describe("vendor sign-up saves the chosen pricing model", () => {
  it.each([
    [{ pricingModel: "hourly", hourlyRate: 150 }, { pricing_model: "hourly", hourly_rate: 150, base_price: null }],
    [{ pricingModel: "fixed", basePrice: 800, hourlyRate: 0 }, { pricing_model: "fixed", hourly_rate: null, base_price: 800 }],
    [{ pricingModel: "from", basePrice: 500 }, { pricing_model: "from", hourly_rate: null, base_price: 500 }],
    [{ pricingModel: "quote" }, { pricing_model: "quote", hourly_rate: null, base_price: null }],
  ])("%o", async (draft, expected) => {
    const res = await submit(draft);
    expect(res).toEqual({ redirected: "REDIRECT:/vendor-dashboard" });
    expect(inserted()).toMatchObject({ ...expected, name: "MC Test", status: "pending_review" });
  });

  it("refuses a missing amount before recording anything", async () => {
    expect(await submit({ pricingModel: "fixed", basePrice: 0 })).toEqual({ error: "Enter a price, or choose Custom quote." });
    expect(calls.some((c) => c.url.includes("record_legal_acceptance"))).toBe(false);
    expect(inserted()).toBeUndefined();
  });

  it("records listing_submitted for the founding funnel only when the listing is saved", async () => {
    recordFunnelEvent.mockClear();
    await submit({ pricingModel: "quote" });
    expect(recordFunnelEvent).toHaveBeenCalledWith("listing_submitted");
    recordFunnelEvent.mockClear();
    await submit({ pricingModel: "fixed", basePrice: 0 });
    expect(recordFunnelEvent).not.toHaveBeenCalled();
  });

  it("still accepts the old hourly-only draft shape", async () => {
    await submit({ hourlyRate: 120 });
    expect(inserted()).toMatchObject({ pricing_model: "hourly", hourly_rate: 120, base_price: null });
  });
});

describe("editing a listing", () => {
  it("switches an hourly listing to custom quote and clears the rate", async () => {
    const res = await updateVendorListing("listing-1", { ...base, pricingModel: "quote", hourlyRate: 150 } as never).catch(
      (e: Error) => ({ redirected: e.message })
    );
    expect(res).not.toHaveProperty("error");
    expect(patched()).toMatchObject({ pricing_model: "quote", hourly_rate: null, base_price: null });
    expect(calls.find((c) => c.method === "PATCH")!.url).toContain("id=eq.listing-1");
  });
});
