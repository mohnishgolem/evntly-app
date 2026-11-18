import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { parseConfirmLink } from "@/lib/auth-links";

// /auth/confirm: sign-up and password-reset email links that an email
// scanner can open without using the one-time token. The action runs through
// the REAL supabase-js client; only the network is faked.

type Call = { method: string; url: string; body: unknown };
const calls: Call[] = [];
let verify: { status: number; body: unknown } = { status: 200, body: {} };

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (url.includes("/auth/v1/verify")) {
    return new Response(JSON.stringify(verify.body), { status: verify.status, headers: { "Content-Type": "application/json" } });
  }
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
});

const client = createClient("https://example.supabase.co", "anon-test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const recordFunnelEvent = vi.fn();
vi.mock("@/lib/funnel-events", () => ({ recordFunnelEvent }));
const recordVendorRegistration = vi.fn();
vi.mock("@/lib/meta-capi", () => ({ recordVendorRegistration }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  clientIp: vi.fn(async () => "1.2.3.4"),
  RATE_LIMIT_ERROR: "Too many attempts.",
}));

const { confirmEmailLink } = await import("@/lib/actions/auth");

const session = (role: string | null) => ({
  access_token: "a.b.c",
  refresh_token: "r",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "u1", email: "v@example.invalid", aud: "authenticated", user_metadata: role ? { role } : {} },
});

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
async function press(fields: Record<string, string>) {
  try {
    await confirmEmailLink(form(fields));
    return "no redirect";
  } catch (e) {
    return String((e as Error).message);
  }
}
const verifyCall = () => calls.find((c) => c.url.includes("/auth/v1/verify"));

beforeEach(() => {
  calls.length = 0;
  recordFunnelEvent.mockClear();
  recordVendorRegistration.mockClear();
  verify = { status: 200, body: session("vendor") };
});

describe("parseConfirmLink", () => {
  const hash = "pkce_0123456789abcdef";

  it("reads the token, type and the same-site next from redirect_to", () => {
    expect(
      parseConfirmLink({
        token_hash: hash,
        type: "signup",
        redirect_to: "https://evntlyapp.com/auth/callback?flow=signup&next=%2Ffounding-vendors%2Fclaim",
      }),
    ).toEqual({ tokenHash: hash, type: "signup", next: "/founding-vendors/claim" });
  });

  it("drops an off-site next", () => {
    expect(parseConfirmLink({ token_hash: hash, type: "recovery", next: "//evil.example" })?.next).toBeNull();
    expect(
      parseConfirmLink({ token_hash: hash, type: "signup", redirect_to: "https://x.example/cb?next=https://evil.example" })?.next,
    ).toBeNull();
  });

  it("refuses unknown types and malformed tokens", () => {
    expect(parseConfirmLink({ token_hash: hash, type: "magiclink" })).toBeNull();
    expect(parseConfirmLink({ token_hash: "bad token!", type: "signup" })).toBeNull();
    expect(parseConfirmLink({ type: "signup" })).toBeNull();
  });
});

describe("confirmEmailLink (the Continue button)", () => {
  it("uses the token only on press and sends a vendor to their founding claim", async () => {
    const res = await press({ token_hash: "hash_abcdefgh", type: "signup", next: "/founding-vendors/claim" });
    expect(res).toBe("REDIRECT:/founding-vendors/claim");
    const v = verifyCall();
    expect(v?.method).toBe("POST");
    expect(v?.body).toMatchObject({ token_hash: "hash_abcdefgh", type: "signup" });
    expect(recordFunnelEvent).toHaveBeenCalledWith("email_confirmed", { detail: "link" });
    expect(recordVendorRegistration).toHaveBeenCalledTimes(1);
  });

  it("sends a confirmed customer to next, without vendor tracking", async () => {
    verify = { status: 200, body: session("customer") };
    expect(await press({ token_hash: "hash_abcdefgh", type: "signup", next: "/plan" })).toBe("REDIRECT:/plan");
    expect(recordFunnelEvent).not.toHaveBeenCalled();
  });

  it("signs a password reset in on this device and opens the new-password form", async () => {
    verify = { status: 200, body: session(null) };
    expect(await press({ token_hash: "hash_abcdefgh", type: "recovery" })).toBe("REDIRECT:/reset-password");
    expect(verifyCall()?.body).toMatchObject({ token_hash: "hash_abcdefgh", type: "recovery" });
  });

  it("explains a used sign-up link and points to log in", async () => {
    verify = { status: 403, body: { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" } };
    expect(await press({ token_hash: "hash_abcdefgh", type: "signup", next: "/founding-vendors/claim" })).toBe(
      "REDIRECT:/login?notice=signup-link-used&next=%2Ffounding-vendors%2Fclaim",
    );
  });

  it("offers a new reset link when a reset link has expired", async () => {
    verify = { status: 403, body: { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" } };
    expect(await press({ token_hash: "hash_abcdefgh", type: "recovery" })).toBe("REDIRECT:/login?notice=link-expired");
  });

  it("rejects a tampered form without calling Supabase", async () => {
    expect(await press({ token_hash: "x", type: "signup" })).toBe("REDIRECT:/login?notice=signin-failed");
    expect(verifyCall()).toBeUndefined();
  });
});
