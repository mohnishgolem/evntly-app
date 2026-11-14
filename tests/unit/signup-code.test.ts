import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Sign-up confirmation by code (Meta Ads V2): a vendor who signed up inside
// Instagram's browser types the 6-digit code from the email and stays signed
// in there. Uses the REAL Supabase client with only the network faked, so the
// tests see exactly what Supabase Auth receives.
type Call = { url: string; body: Record<string, unknown> | null };
const calls: Call[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let verifyReply: { status: number; body: unknown } = { status: 200, body: {} };
let resendReply: { status: number; body: unknown } = { status: 200, body: {} };
const session = (role: string) => ({
  access_token: "header.payload.sig",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "refresh",
  user: { id: "u1", aud: "authenticated", email: "vendor@example.invalid", user_metadata: { role }, app_metadata: {}, created_at: "2026-11-14T00:00:00Z" },
});

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  let body: Record<string, unknown> | null = null;
  try {
    body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  } catch {
    body = null;
  }
  calls.push({ url, body });
  if (url.includes("/auth/v1/verify")) return json(verifyReply.body, verifyReply.status);
  if (url.includes("/auth/v1/resend")) return json(resendReply.body, resendReply.status);
  if (url.includes("/auth/v1/signup")) return json({ id: "u1", email: "vendor@example.invalid", identities: [{}] });
  return json({});
});

const client = createClient("https://example.supabase.co", "anon-test-key", {
  auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});

const redirect = vi.fn((path: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { path });
});
let rateLimitOk = true;
const funnel: { event: string; detail?: string | null }[] = [];
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://evil.example" }) }));
vi.mock("@/lib/actions/legal", () => ({ recordSignupConsents: vi.fn() }));
vi.mock("@/lib/funnel-events", () => ({
  recordFunnelEvent: vi.fn(async (event: string, opts: { detail?: string | null } = {}) => {
    funnel.push({ event, detail: opts.detail });
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => rateLimitOk),
  clientIp: vi.fn(async () => "1.2.3.4"),
  RATE_LIMIT_ERROR: "Too many attempts.",
}));

const { signup, verifySignupCode, resendSignupCode } = await import("@/lib/actions/auth");
const { SITE_URL } = await import("@/lib/config");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const CLAIM_NEXT = "/founding-vendors/claim?src=meta_ads";

async function redirectedTo(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { path?: string }).path ?? null;
  }
}

beforeEach(() => {
  calls.length = 0;
  funnel.length = 0;
  redirect.mockClear();
  rateLimitOk = true;
  verifyReply = { status: 200, body: session("vendor") };
  resendReply = { status: 200, body: {} };
});

describe("sign-up hands the code form what it needs", () => {
  it("returns the email and where to go next when confirmation is required", async () => {
    const res = await signup(
      null,
      form({
        fullName: "Vee Vendor",
        email: "vendor@example.invalid",
        password: "a-long-password",
        role: "vendor",
        agreedToTerms: "on",
        agreedToVendorAgreement: "on",
        next: CLAIM_NEXT,
      })
    );
    expect(res).toMatchObject({ needsEmailConfirmation: true, email: "vendor@example.invalid", next: CLAIM_NEXT });
  });
});

describe("verifySignupCode", () => {
  it("rejects a malformed code without calling Supabase", async () => {
    const res = await verifySignupCode(null, form({ email: "vendor@example.invalid", code: "12ab" }));
    expect(res?.fieldErrors?.code?.[0]).toMatch(/numbers only/);
    expect(res?.needsEmailConfirmation).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("is rate limited before Supabase is asked", async () => {
    rateLimitOk = false;
    const res = await verifySignupCode(null, form({ email: "vendor@example.invalid", code: "123456" }));
    expect(res?.error).toMatch(/Too many/);
    expect(calls).toHaveLength(0);
  });

  it("verifies the code for that email only, and keeps the form on a wrong code", async () => {
    verifyReply = { status: 403, body: { code: 403, error_code: "otp_invalid", msg: "Token has expired or is invalid" } };
    const res = await verifySignupCode(null, form({ email: "vendor@example.invalid", code: "123 456", next: CLAIM_NEXT }));
    const call = calls.find((c) => c.url.includes("/auth/v1/verify"));
    expect(call?.body).toMatchObject({ email: "vendor@example.invalid", token: "123456", type: "email" });
    expect(res?.fieldErrors?.code?.[0]).toMatch(/didn't work/);
    expect(res).toMatchObject({ needsEmailConfirmation: true, email: "vendor@example.invalid", next: CLAIM_NEXT });
    expect(redirect).not.toHaveBeenCalled();
    expect(funnel).toHaveLength(0);
  });

  it("covers expiry in the same message (Supabase can't tell them apart)", async () => {
    verifyReply = { status: 403, body: { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" } };
    const res = await verifySignupCode(null, form({ email: "vendor@example.invalid", code: "123456" }));
    expect(res?.fieldErrors?.code?.[0]).toMatch(/expired/);
    expect(res?.fieldErrors?.code?.[0]).toMatch(/send a new code/);
  });

  it("signs a vendor in and returns them to their founding claim page", async () => {
    const to = await redirectedTo(verifySignupCode(null, form({ email: "vendor@example.invalid", code: "123456", next: CLAIM_NEXT })));
    expect(to).toBe(CLAIM_NEXT);
    expect(funnel).toEqual([{ event: "email_confirmed", detail: "code" }]);
  });

  it("never redirects off-site, and sends other vendors to listing set-up", async () => {
    expect(await redirectedTo(verifySignupCode(null, form({ email: "vendor@example.invalid", code: "123456", next: "//evil.example/x" })))).toBe(
      "/vendor-signup"
    );
    verifyReply = { status: 200, body: session("customer") };
    const to = await redirectedTo(verifySignupCode(null, form({ email: "vendor@example.invalid", code: "123456", next: "https://evil.example" })));
    expect(to?.startsWith("/")).toBe(true);
    expect(to).not.toContain("evil");
    // Customers aren't part of the vendor funnel.
    expect(funnel.filter((f) => f.event === "email_confirmed")).toHaveLength(1);
  });
});

describe("resendSignupCode", () => {
  it("asks Supabase to resend the sign-up email with a trusted link", async () => {
    const res = await resendSignupCode(null, form({ email: "vendor@example.invalid", next: CLAIM_NEXT }));
    expect(res?.resent).toBe(true);
    const call = calls.find((c) => c.url.includes("/auth/v1/resend"));
    expect(call?.body).toMatchObject({ type: "signup", email: "vendor@example.invalid" });
    // The request's Origin was evil.example; the link must still point at us.
    const redirectTo = new URL(new URL(call!.url).searchParams.get("redirect_to")!);
    expect(redirectTo.origin).toBe(new URL(SITE_URL).origin);
    expect(redirectTo.searchParams.get("next")).toBe(CLAIM_NEXT);
  });

  it("doesn't reveal whether an address has an account", async () => {
    resendReply = { status: 400, body: { code: 400, error_code: "validation_failed", msg: "User not found" } };
    const res = await resendSignupCode(null, form({ email: "nobody@example.invalid" }));
    expect(res?.resent).toBe(true);
    expect(res?.error).toBeUndefined();
  });

  it("reports Supabase's own rate limit, and ours", async () => {
    resendReply = { status: 429, body: { code: 429, error_code: "over_email_send_rate_limit", msg: "slow down" } };
    expect((await resendSignupCode(null, form({ email: "vendor@example.invalid" })))?.error).toMatch(/couldn't send/);
    rateLimitOk = false;
    calls.length = 0;
    expect((await resendSignupCode(null, form({ email: "vendor@example.invalid" })))?.error).toMatch(/Too many/);
    expect(calls).toHaveLength(0);
  });
});
