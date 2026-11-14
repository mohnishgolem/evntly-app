import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Sign-up confirmation and expired-link handling. Sign-up goes through the
// REAL Supabase client with only the network faked, so the test sees the
// redirect_to Supabase Auth actually receives.
const calls: string[] = [];
// Set to make Supabase Auth answer the next sign-up with an error.
let signupFailure: { status: number; body: unknown } | null = null;
// Supabase returns identities for a new account and none for an email that's
// already registered (so it doesn't reveal the account exists).
let newUserIdentities: unknown[] = [];
const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
  calls.push(String(input));
  if (signupFailure && String(input).includes("/auth/v1/signup")) {
    return new Response(JSON.stringify(signupFailure.body), {
      status: signupFailure.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  // Email confirmation on: a user comes back without a session.
  return new Response(JSON.stringify({ id: "u1", email: "new@example.invalid", identities: newUserIdentities }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

let exchangeError: { message: string } | null = null;
const client = createClient("https://example.supabase.co", "anon-test-key", {
  auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});
vi.spyOn(client.auth, "exchangeCodeForSession").mockImplementation(async () => ({ error: exchangeError }) as never);
vi.spyOn(client.auth.mfa, "getAuthenticatorAssuranceLevel").mockImplementation(
  async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" } }) as never
);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://evil.example" }) }));
const funnel: { event: string; detail?: string | null }[] = [];
vi.mock("@/lib/funnel-events", () => ({
  recordFunnelEvent: vi.fn(async (event: string, opts: { detail?: string | null } = {}) => {
    funnel.push({ event, detail: opts.detail });
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  clientIp: vi.fn(async () => "1.2.3.4"),
  RATE_LIMIT_ERROR: "Too many attempts.",
}));

const { signup } = await import("@/lib/actions/auth");
const { GET } = await import("@/app/auth/callback/route");
const { SITE_URL } = await import("@/lib/config");
const { authNotice } = await import("@/lib/auth-notices");

function form(role: "customer" | "vendor") {
  const f = new FormData();
  f.set("fullName", "New Person");
  f.set("email", "new@example.invalid");
  f.set("password", "a-long-password");
  f.set("role", role);
  f.set("agreedToTerms", "on");
  if (role === "vendor") f.set("agreedToVendorAgreement", "on");
  return f;
}

const redirectTo = () => new URL(new URL(calls.find((u) => u.includes("/auth/v1/signup"))!).searchParams.get("redirect_to")!);

beforeEach(() => {
  calls.length = 0;
  exchangeError = null;
  signupFailure = null;
  funnel.length = 0;
  newUserIdentities = [];
});

describe("sign-up errors", () => {
  it("shows a breached/weak password on the password field, in plain words", async () => {
    // What Supabase returns with leaked-password protection on (seen in prod
    // auth logs from a Meta-ads visitor on 10 Nov 2026).
    signupFailure = {
      status: 422,
      body: {
        code: 422,
        error_code: "weak_password",
        msg: "Password is known to be weak and easy to guess, please choose a different one.",
        weak_password: { reasons: ["pwned"] },
      },
    };
    const res = await signup(null, form("vendor"));
    expect(res?.error).toBeUndefined();
    expect(res?.fieldErrors?.password?.[0]).toMatch(/data breach/);
    // Counted for the founding funnel, as a code only.
    expect(funnel).toEqual([{ event: "signup_error", detail: "weak_password" }]);
  });

  it("counts a new vendor account, but not a repeat sign-up or a customer", async () => {
    newUserIdentities = [{ id: "i1", provider: "email" }];
    await signup(null, form("vendor"));
    expect(funnel).toEqual([{ event: "account_created", detail: "email" }]);

    funnel.length = 0;
    await signup(null, form("customer"));
    expect(funnel).toEqual([]);

    newUserIdentities = []; // email already registered
    await signup(null, form("vendor"));
    expect(funnel).toEqual([]);
  });

  it("still passes other Supabase errors through", async () => {
    signupFailure = { status: 400, body: { code: 400, error_code: "email_address_invalid", msg: "Email address is invalid" } };
    const res = await signup(null, form("customer"));
    expect(res?.error).toBe("Email address is invalid");
  });
});

describe("sign-up confirmation link", () => {
  it("sends customers through the callback to the home page", async () => {
    expect(await signup(null, form("customer"))).toEqual({ needsEmailConfirmation: true, email: "new@example.invalid", next: "/" });
    const to = redirectTo();
    // An untrusted Origin header never ends up in the email.
    expect(to.origin).toBe(SITE_URL);
    expect(to.pathname).toBe("/auth/callback");
    expect(to.searchParams.get("flow")).toBe("signup");
    expect(to.searchParams.get("next")).toBe("/");
  });

  it("sends vendors on to the listing setup", async () => {
    await signup(null, form("vendor"));
    expect(redirectTo().searchParams.get("next")).toBe("/vendor-signup");
  });

  it("brings customers back to where they started (vendor page or plan)", async () => {
    const f = form("customer");
    f.set("next", "/vendor/abc?x=1");
    await signup(null, f);
    expect(redirectTo().searchParams.get("next")).toBe("/vendor/abc?x=1");
  });

  it("ignores next for vendors and off-site next values", async () => {
    const v = form("vendor");
    v.set("next", "/dashboard");
    await signup(null, v);
    expect(redirectTo().searchParams.get("next")).toBe("/vendor-signup");

    calls.length = 0;
    const c = form("customer");
    c.set("next", "//evil.example");
    await signup(null, c);
    expect(redirectTo().searchParams.get("next")).toBe("/");
  });
});

describe("founding vendor sign-ups", () => {
  it("return vendors to their claim page (keeping the invite) instead of /vendor-signup", async () => {
    const v = form("vendor");
    v.set("next", "/founding-vendors/claim?invite=abc&src=instagram_bio");
    await signup(null, v);
    expect(redirectTo().searchParams.get("next")).toBe("/founding-vendors/claim?invite=abc&src=instagram_bio");
  });

  it("send vendor OAuth sign-ups from the claim page back there", async () => {
    const location = async (query: string) =>
      (await GET(new Request(`https://evntly.example/auth/callback?${query}`))).headers.get("location");
    expect(await location(`code=abc&role=vendor&next=${encodeURIComponent("/founding-vendors/claim?src=instagram_dm")}`)).toBe(
      "https://evntly.example/founding-vendors/claim?src=instagram_dm"
    );
    expect(await location("code=abc&role=vendor&next=/dashboard")).toBe("https://evntly.example/vendor-signup");
    expect(await location("code=abc&role=vendor")).toBe("https://evntly.example/vendor-signup");
  });
});

describe("auth callback without a session", () => {
  const location = async (query: string) =>
    (await GET(new Request(`https://evntly.example/auth/callback?${query}`))).headers.get("location");

  it("signs a confirmed sign-up straight in", async () => {
    expect(await location("code=abc&flow=signup&next=/")).toBe("https://evntly.example/");
  });

  it("tells people opening the confirmation in another browser that they're confirmed", async () => {
    exchangeError = { message: "code verifier missing" };
    expect(await location("code=abc&flow=signup&next=/dashboard")).toBe(
      "https://evntly.example/login?notice=email-confirmed&next=%2Fdashboard"
    );
  });

  it("keeps a booking intent through a confirmation opened in another browser", async () => {
    exchangeError = { message: "code verifier missing" };
    const to = new URL((await location(`code=abc&flow=signup&next=${encodeURIComponent("/vendor/v1?book=1")}`))!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("next")).toBe("/vendor/v1?book=1");
  });

  it("never carries an off-site next to the login page", async () => {
    exchangeError = { message: "code verifier missing" };
    const to = new URL((await location("code=abc&flow=signup&next=//evil.com"))!);
    expect(to.origin).toBe("https://evntly.example");
    expect(to.searchParams.get("next")).toBe("/dashboard");
  });

  it("offers a new reset link when a reset link is reused or expired", async () => {
    expect(await location("error=access_denied&error_code=otp_expired&next=/reset-password")).toBe(
      "https://evntly.example/login?notice=link-expired"
    );
  });

  it("falls back to a generic message", async () => {
    exchangeError = { message: "bad code" };
    expect(await location("code=abc")).toBe("https://evntly.example/login?notice=signin-failed");
  });
});

describe("login notices", () => {
  it("only shows known messages", () => {
    expect(authNotice("email-confirmed")?.text).toMatch(/confirmed/);
    expect(authNotice("<script>")).toBeNull();
    expect(authNotice("toString")).toBeNull();
    expect(authNotice(undefined)).toBeNull();
  });
});
