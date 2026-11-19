import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// A customer who opened a vendor's shared profile, filled in "Request a
// quote" and was asked to create an account: the account is attributed to
// the share, and every way of verifying the email returns them to that
// vendor's quote flow (/vendor/<id>?book=1&src=…). REAL supabase-js client,
// only the network faked.

const VENDOR = "d5984a9a-70dc-4e42-a1ce-dcdd2022d1d7";
const NEXT = `/vendor/${VENDOR}?book=1&src=share_qr`;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const user = (role: string) => ({
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  email: "customer@example.invalid",
  user_metadata: { role },
  app_metadata: { provider: "email" },
  identities: [{}],
  created_at: new Date().toISOString(),
});
let role = "customer";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = () =>
  `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user(role).id, email: user(role).email, role: "authenticated", aal: "aal1", amr: [{ method: "password" }], exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const session = () => ({
  access_token: jwt(),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "refresh",
  user: user(role),
});
const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/auth/v1/signup")) return json(user(role));
  if (url.includes("/auth/v1/verify")) return json(session());
  if (url.includes("/auth/v1/token")) return json(session());
  return json({});
});
const client = createClient("https://example.supabase.co", "anon-test-key", {
  auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/legal", () => ({ recordSignupConsents: vi.fn() }));
vi.mock("@/lib/funnel-events", () => ({ recordFunnelEvent: vi.fn() }));
vi.mock("@/lib/meta-capi", () => ({ recordVendorRegistration: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), clientIp: vi.fn(async () => "1.2.3.4"), RATE_LIMIT_ERROR: "Too many attempts." }));
const shareAccounts: unknown[][] = [];
vi.mock("@/lib/share-funnel", () => ({ recordShareAccount: vi.fn(async (...a: unknown[]) => void shareAccounts.push(a)) }));

const { signup, verifySignupCode, login, confirmEmailLink } = await import("@/lib/actions/auth");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
async function redirectedTo(p: Promise<unknown>) {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { path?: string }).path ?? (e as Error).message;
  }
}

beforeEach(() => {
  role = "customer";
  shareAccounts.length = 0;
});

describe("sign-up from a shared profile", () => {
  it("attributes a new customer account to the share it came from", async () => {
    const res = await signup(
      null,
      form({ fullName: "Cara Customer", email: "customer@example.invalid", password: "a-long-password", role: "customer", agreedToTerms: "on", next: NEXT })
    );
    expect(res).toMatchObject({ needsEmailConfirmation: true, next: NEXT });
    expect(shareAccounts).toEqual([["11111111-1111-4111-8111-111111111111", NEXT, "email"]]);
  });

  it("never attributes vendor sign-ups", async () => {
    role = "vendor";
    await signup(
      null,
      form({ fullName: "Vee Vendor", email: "v@example.invalid", password: "a-long-password", role: "vendor", agreedToTerms: "on", agreedToVendorAgreement: "on", next: NEXT })
    );
    expect(shareAccounts).toEqual([]);
  });
});

describe("after verifying, the customer goes straight back to the vendor's quote flow", () => {
  it("by code (stays in Instagram's browser)", async () => {
    expect(await redirectedTo(verifySignupCode(null, form({ email: "customer@example.invalid", code: "123456", next: NEXT })))).toBe(NEXT);
  });

  it("by the email link (/auth/confirm)", async () => {
    // A placeholder that only has the shape of a one-time hash (repeated "a").
    const f = form({ token_hash: "pkce_" + "a".repeat(24), type: "signup", next: NEXT });
    expect(await redirectedTo(confirmEmailLink(f))).toBe(NEXT);
  });

  it("by logging in after the link confirmed the email in another browser", async () => {
    expect(await redirectedTo(login(null, form({ email: "customer@example.invalid", password: "a-long-password", next: NEXT })))).toBe(NEXT);
  });
});
