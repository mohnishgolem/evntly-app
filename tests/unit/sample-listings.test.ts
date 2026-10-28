import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Discovery queries and the quote/message guards, through the REAL Supabase
// client with only the network faked (see rate-limit-real-client).
const calls: { url: string; method: string; body: unknown }[] = [];
let replies: Record<string, unknown> = {};

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = decodeURIComponent(String(input));
  calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
  const key = Object.keys(replies).find((k) => url.includes(k));
  const body = key ? replies[key] : [];
  // .maybeSingle() asks for one object; everything else gets an array.
  const single = String((init?.headers as Record<string, string> | undefined)?.Accept ?? "").includes("vnd.pgrst.object");
  return new Response(JSON.stringify(single && Array.isArray(body) ? (body[0] ?? null) : body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

const client = createClient("https://example.supabase.co", "anon-test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});
const user = { id: "u1", email: "u1@example.invalid", user_metadata: {} };
vi.spyOn(client.auth, "getUser").mockImplementation(async () => ({ data: { user }, error: null }) as never);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), RATE_LIMIT_ERROR: "Too many attempts." }));
vi.mock("@/lib/email", () => ({ notify: vi.fn(), formatEventDate: String, formatAmount: String }));
vi.mock("@/lib/supabase/admin", () => ({ quoteParticipantEmail: vi.fn(), messageRecipientEmail: vi.fn() }));

const { getFeaturedVendors, searchVendors, findSimilarVendors } = await import("@/lib/data/vendors");
const { getActiveBundles } = await import("@/lib/data/bundles");
const { requestQuote, cancelQuote } = await import("@/lib/actions/quotes");
const { notify } = await import("@/lib/email");
const { SAMPLE_LISTING_CONTACT_ERROR } = await import("@/lib/sample-listings");

const vendorReads = () => calls.filter((c) => c.url.includes("/rest/v1/service_providers"));
const draft = {
  eventDate: "2099-01-10",
  eventType: "Wedding",
  location: "Bondi",
  estimatedGuests: 80,
  budgetRange: "$1,000–2,000",
};

beforeEach(() => {
  calls.length = 0;
  replies = {};
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sample listings in discovery", () => {
  it("are listed by default (HIDE_SAMPLE_LISTINGS unset)", async () => {
    await getFeaturedVendors();
    await searchVendors({ category: "photographer" });
    await getActiveBundles();
    for (const c of vendorReads()) expect(c.url).not.toContain("is_demo=eq.false");
  });

  it("are filtered out of home, explore and bundles when hidden", async () => {
    vi.stubEnv("HIDE_SAMPLE_LISTINGS", "true");
    await getFeaturedVendors();
    await searchVendors({ category: "photographer" });
    replies["service_providers"] = [];
    await getActiveBundles();
    const reads = vendorReads();
    expect(reads).toHaveLength(3);
    for (const c of reads) expect(c.url).toContain("is_demo=eq.false");
  });

  it("are never suggested as similar vendors", async () => {
    await findSimilarVendors(client as never, "photographer");
    expect(vendorReads()[0].url).toContain("is_demo=eq.false");
  });
});

describe("contacting a sample listing", () => {
  it("refuses a quote request without inserting anything", async () => {
    replies["service_providers"] = [{ is_demo: true }];
    expect(await requestQuote("v-demo", draft)).toEqual({ error: SAMPLE_LISTING_CONTACT_ERROR });
    expect(calls.some((c) => c.url.includes("quote_requests"))).toBe(false);
  });

  // Keys are matched against the URL in insertion order, so the RPCs
  // (rpc/my_service_providers, rpc/my_quote_requests) come first.
  function realVendor({ own = [], open = [] }: { own?: unknown[]; open?: unknown[] } = {}) {
    replies["rpc/my_service_providers"] = own;
    replies["rpc/my_quote_requests"] = open;
    replies["rest/v1/service_providers"] = [{ is_demo: false }];
    replies["rest/v1/quote_requests"] = [{ id: "q1", service_type: "photographer" }];
  }
  const inserts = () => calls.filter((c) => c.url.includes("rest/v1/quote_requests") && c.method === "POST");

  it("still lets real vendors through to the insert", async () => {
    realVendor();
    const res = await requestQuote("v-real", draft);
    expect(res?.error).toBeUndefined();
    expect(inserts()).toHaveLength(1);
  });

  it("refuses a vendor booking their own listing", async () => {
    realVendor({ own: [{ id: "v-real" }] });
    const res = await requestQuote("v-real", draft);
    expect(res?.error).toMatch(/your own listing/);
    expect(inserts()).toHaveLength(0);
    const own = calls.find((c) => c.url.includes("rpc/my_service_providers"));
    expect(own?.url).toContain("id=eq.v-real");
  });

  it("refuses a second open request to the same vendor for the same date", async () => {
    realVendor({ open: [{ id: "q0" }] });
    const res = await requestQuote("v-real", draft);
    expect(res?.error).toMatch(/already sent this vendor a request/);
    expect(inserts()).toHaveLength(0);
    const check = calls.find((c) => c.url.includes("rpc/my_quote_requests"));
    expect(check?.url).toContain("vendor_id=eq.v-real");
    expect(check?.url).toContain("event_date=eq.2099-01-10");
    expect(check?.url).toContain("status=in.(pending,quoted)");
  });
});

describe("withdrawing a request", () => {
  it("only cancels an open request, and tells the vendor", async () => {
    replies["rest/v1/quote_requests"] = [{ event_type: "Wedding", event_date: "2099-01-10" }];
    vi.mocked(notify).mockClear();
    expect(await cancelQuote("q1")).toEqual({ success: true });
    const patch = calls.find((c) => c.url.includes("rest/v1/quote_requests") && c.method === "PATCH");
    expect(patch?.url).toContain("id=eq.q1");
    expect(patch?.url).toContain("status=in.(pending,quoted)");
    expect(patch?.body).toEqual({ status: "cancelled" });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("explains when the request is no longer open", async () => {
    replies["rest/v1/quote_requests"] = [];
    vi.mocked(notify).mockClear();
    const res = await cancelQuote("q1");
    expect(res?.error).toMatch(/can't be withdrawn/);
    expect(notify).not.toHaveBeenCalled();
  });
});
