import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Consent recording goes through the REAL supabase-js clients with only the
// network faked: these wrappers decide whether a legal acceptance is stored.
type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];
const respond = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  calls.push({ url, method, body });
  if (url.includes("/auth/v1/signup")) return respond({ id: "11111111-1111-4111-8111-111111111111", email: "new@example.invalid" });
  if (url.includes("/auth/v1/user")) return respond({ id: "22222222-2222-4222-8222-222222222222", email: "vendor@example.invalid" });
  if (url.includes("/rpc/my_service_providers")) return respond([]);
  if (url.includes("/rpc/")) return respond(null, 204);
  if (url.includes("/rest/v1/service_providers") && method === "POST") return respond(null, 201);
  return respond([]);
});

const realClient = (key: string) =>
  createClient("https://example.supabase.co", key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch as unknown as typeof fetch },
  });
const userClient = realClient("anon-test-key");
// The user client needs a session for auth.getUser() to call /auth/v1/user.
vi.spyOn(userClient.auth, "getUser").mockImplementation(async () => {
  await fakeFetch("https://example.supabase.co/auth/v1/user");
  return { data: { user: { id: "22222222-2222-4222-8222-222222222222", email: "vendor@example.invalid" } }, error: null } as never;
});
const adminClient = realClient("service-role-test-key");

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => userClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  clientIp: vi.fn(async () => "1.2.3.4"),
  RATE_LIMIT_ERROR: "Too many attempts.",
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/data/user", () => ({ getCurrentUser: async () => null }));

const { signup } = await import("@/lib/actions/auth");
const { acceptLegalDocuments } = await import("@/lib/actions/legal");
const { submitVendorListing } = await import("@/lib/actions/vendor-signup");

function form(role: "customer" | "vendor", extra: Record<string, string> = {}) {
  const f = new FormData();
  f.set("fullName", "New Person");
  f.set("email", "new@example.invalid");
  f.set("password", "a-long-password");
  f.set("role", role);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}
const rpc = (name: string) => calls.filter((c) => c.url.includes(`/rest/v1/rpc/${name}`));

beforeEach(() => {
  calls.length = 0;
});

describe("signup consent", () => {
  it("refuses to create an account without the Terms box", async () => {
    const res = await signup(null, form("customer"));
    expect(res?.fieldErrors?.agreedToTerms?.[0]).toMatch(/Terms/);
    expect(calls.some((c) => c.url.includes("/auth/v1/signup"))).toBe(false);
  });

  it("requires the Vendor Service Agreement for vendor accounts", async () => {
    const res = await signup(null, form("vendor", { agreedToTerms: "on" }));
    expect(res?.fieldErrors?.agreedToVendorAgreement?.[0]).toMatch(/Vendor Service Agreement/);
    expect(calls.some((c) => c.url.includes("/auth/v1/signup"))).toBe(false);
  });

  it("records customer consent through the service role, with marketing off unless ticked", async () => {
    await signup(null, form("customer", { agreedToTerms: "on" }));
    const signupCall = calls.find((c) => c.url.includes("/auth/v1/signup"))!;
    // Acceptance is never sent in client-controllable auth metadata.
    expect(JSON.stringify(signupCall.body)).not.toContain("terms_version");
    expect(rpc("record_signup_consents")).toHaveLength(1);
    expect(rpc("record_signup_consents")[0].body).toEqual({
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_role: "customer",
      p_marketing: false,
    });
  });

  it("records the optional marketing opt-in and vendor role", async () => {
    await signup(null, form("vendor", { agreedToTerms: "on", agreedToVendorAgreement: "on", marketingOptIn: "on" }));
    expect(rpc("record_signup_consents")[0].body).toMatchObject({ p_role: "vendor", p_marketing: true });
  });
});

describe("accepting documents later", () => {
  it("rejects unknown documents and contexts users may not claim", async () => {
    expect(await acceptLegalDocuments({ documents: ["marketing_emails" as never], context: "terms_update" })).toHaveProperty("error");
    expect(await acceptLegalDocuments({ documents: ["customer_terms"], context: "signup" as never })).toHaveProperty("error");
    expect(rpc("record_legal_acceptance")).toHaveLength(0);
  });

  it("records the documents, and marketing only when the person was asked", async () => {
    expect(await acceptLegalDocuments({ documents: ["customer_terms", "privacy_policy", "customer_terms"], context: "terms_update" })).toEqual({ ok: true });
    expect(rpc("record_legal_acceptance")[0].body).toEqual({ p_documents: ["customer_terms", "privacy_policy"], p_context: "terms_update" });
    expect(rpc("set_marketing_consent")).toHaveLength(0);

    await acceptLegalDocuments({ documents: ["customer_terms"], context: "signup_google", marketing: false });
    expect(rpc("set_marketing_consent")[0].body).toEqual({ p_granted: false, p_context: "signup_google" });
  });
});

describe("vendor onboarding", () => {
  const draft = {
    businessName: "Test Photo Co",
    bio: "",
    serviceType: "photographer",
    hourlyRate: 150,
    city: "Parramatta",
    latitude: -33.81,
    longitude: 151.0,
    locationsServiced: ["Parramatta"],
    eventTypes: ["Wedding"],
    abn: "51 824 753 556",
  };

  it("requires a valid ABN and the agreement before anything is written", async () => {
    expect((await submitVendorListing({ ...draft, abn: "12 345 678 901" }, { acceptedVendorAgreement: true }))?.error).toMatch(/ABN/);
    expect((await submitVendorListing(draft, { acceptedVendorAgreement: false }))?.error).toMatch(/Vendor Service Agreement/);
    expect((await submitVendorListing(draft))?.error).toMatch(/Vendor Service Agreement/);
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/service_providers"))).toBe(false);
  });

  it("records the agreement and fee schedule before creating the listing", async () => {
    await submitVendorListing(draft, { acceptedVendorAgreement: true });
    const acceptIdx = calls.findIndex((c) => c.url.includes("/rpc/record_legal_acceptance"));
    const insertIdx = calls.findIndex((c) => c.method === "POST" && c.url.includes("/rest/v1/service_providers"));
    expect(acceptIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(acceptIdx);
    expect(calls[acceptIdx].body).toEqual({ p_documents: ["vendor_agreement", "vendor_fee_schedule"], p_context: "vendor_onboarding" });
    expect(calls[insertIdx].body).toMatchObject({ abn: "51824753556", status: "pending_review" });
  });
});
