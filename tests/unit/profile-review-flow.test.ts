import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { isReviewReturn, reviewReturnPath, reviewerDisplayName, reviewRequestMessage } from "@/lib/profile-reviews";

// The whole guest review journey from a shared profile, through the real code
// with REAL supabase-js clients; only the network is faked (no database, no
// real vendor). 1) a guest on a QR-shared profile drafts a review, 2) signs
// up, 3) verifies by code, 4) lands back on the vendor with the same draft,
// 5) posts it. Checks the attribution at every step.

const V = "0f0f0f0f-0000-4000-8000-00000000000a"; // a made-up vendor
const DRAFT = "11111111-2222-4333-8444-555555555555";
const USER = "99999999-0000-4000-8000-000000000001";
const NEXT = reviewReturnPath(V, DRAFT, "share_qr");

type Call = { method: string; path: string; body: unknown };
const calls: Call[] = [];
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = () => `${b64({ alg: "HS256" })}.${b64({ sub: USER, role: "authenticated", aal: "aal1", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const user = { id: USER, aud: "authenticated", email: "guest@example.invalid", user_metadata: { full_name: "Mia van Dyk", role: "customer" }, app_metadata: {}, identities: [{}], created_at: new Date().toISOString() };
const session = () => ({ access_token: jwt(), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r", user });
let draftRow: Record<string, unknown> | null = null;

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" && init.body ? JSON.parse(init.body) : null;
  calls.push({ method, path: url.pathname + url.search, body });
  const one = (new Headers(init?.headers).get("accept") ?? "").includes("vnd.pgrst.object");
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(one && Array.isArray(data) ? (data[0] ?? null) : data), { status, headers: { "Content-Type": "application/json" } });
  const p = url.pathname;
  if (p === "/auth/v1/signup") return reply(user);
  if (p === "/auth/v1/verify") return reply(session());
  if (p === "/auth/v1/user") return reply(user);
  if (p === "/rest/v1/service_providers") return reply([{ id: V, name: "Test Photo Co", status: "approved", is_demo: false, owner_email: "owner@example.invalid" }]);
  if (p === "/rest/v1/rpc/my_service_providers") return reply([]);
  if (p === "/rest/v1/bookings") return reply([]);
  if (p === "/rest/v1/users") return reply([]);
  if (p === "/rest/v1/review_drafts" && method === "POST") {
    draftRow = { id: DRAFT, ...body, created_at: new Date().toISOString(), used_at: null };
    return reply([draftRow], 201);
  }
  if (p === "/rest/v1/review_drafts" && method === "GET") {
    const forVendor = url.searchParams.get("provider_id");
    return reply(draftRow && (!forVendor || forVendor === `eq.${draftRow.provider_id}`) ? [draftRow] : []);
  }
  if (p === "/rest/v1/review_drafts" && method === "PATCH") {
    Object.assign(draftRow ?? {}, body);
    return reply([], 204);
  }
  if (p === "/rest/v1/review_drafts" && method === "DELETE") return reply([], 204);
  if (p === "/rest/v1/reviews" && method === "GET") return reply([]);
  if (p === "/rest/v1/reviews" && method === "POST") return reply([], 201);
  if (p === "/rest/v1/share_funnel_events") return reply([], 201);
  return reply([]);
});
const realClient = (key: string) =>
  createClient("https://example.supabase.co", key, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
    global: { fetch: fakeFetch as unknown as typeof fetch },
  });

// One "request" at a time: the server client, and this browser's cookies.
let serverClient = realClient("anon-test-key");
let cookieJar: Record<string, string> = {};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => serverClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => realClient("service-role-test-key") }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n in cookieJar ? { name: n, value: cookieJar[n] } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), clientIp: vi.fn(async () => "203.0.113.5"), RATE_LIMIT_ERROR: "Too many attempts." }));
vi.mock("@/lib/email", () => ({ notify: vi.fn(), sendEmail: vi.fn() }));
vi.mock("@/lib/actions/legal", () => ({ recordSignupConsents: vi.fn() }));
vi.mock("@/lib/funnel-events", () => ({ recordFunnelEvent: vi.fn() }));
vi.mock("@/lib/meta-capi", () => ({ recordVendorRegistration: vi.fn() }));
vi.mock("@/lib/data/user", () => ({ getAdminSession: vi.fn(async () => ({ admin: false, mfa: "n/a" })) }));

const { saveReviewDraft, submitReview } = await import("@/lib/actions/reviews");
const { signup, verifySignupCode } = await import("@/lib/actions/auth");
const { loadReviewDraft } = await import("@/lib/data/reviews");

const form = (f: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(f)) d.set(k, v);
  return d;
};
const redirectedTo = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { path?: string }).path ?? (e as Error).message;
  }
};
const posted = (path: string) => calls.filter((c) => c.method === "POST" && c.path.startsWith(path)).map((c) => c.body);

beforeEach(() => {
  calls.length = 0;
  draftRow = null;
  cookieJar = {};
  serverClient = realClient("anon-test-key");
});

describe("helpers", () => {
  it("builds the return path and recognises it on sign-up and log-in", () => {
    expect(NEXT).toBe(`/vendor/${V}?review=${DRAFT}&src=share_qr`);
    expect(isReviewReturn(NEXT)).toBe(true);
    expect(isReviewReturn(`/vendor/${V}?review=new`)).toBe(true);
    expect(isReviewReturn(`/vendor/${V}?book=1`)).toBe(false);
    expect(isReviewReturn("https://evil.example/vendor/x?review=1")).toBe(false);
    expect(reviewerDisplayName("mia van dyk")).toBe("Mia D.");
    expect(reviewRequestMessage("Test Photo Co", V)).toContain(`/vendor/${V}?src=share_link`);
  });
});

describe("guest review from a shared QR profile", () => {
  it("drafts → signs up → verifies → returns to the same draft → posts, attributed to the QR card", async () => {
    // 1. On the vendor's profile from the QR card (the proxy set the cookie).
    cookieJar = { evntly_share_src: "share_qr" };
    const saved = await saveReviewDraft(V, { rating: 5, comment: "Fantastic photos of our wedding, so easy to work with.", eventType: "Wedding" });
    expect(saved).toEqual({ draftId: DRAFT });
    expect(posted("/rest/v1/review_drafts")[0]).toMatchObject({ provider_id: V, rating: 5, event_type: "Wedding", share_source: "share_qr" });

    // 2. Sign-up page with next = the vendor profile + draft + share tag.
    const res = await signup(null, form({ fullName: "Mia van Dyk", email: "guest@example.invalid", password: "a-long-password", role: "customer", agreedToTerms: "on", next: NEXT }));
    expect(res).toMatchObject({ needsEmailConfirmation: true, next: NEXT });
    // The new account is credited to the QR card (a verified sign-up once the email is confirmed).
    expect(posted("/rest/v1/share_funnel_events")[0]).toEqual({ event: "account_created", source: "share_qr", vendor_id: V, user_id: USER, detail: "email" });

    // 3. Verify by code, in another browser for good measure: no share cookie there.
    cookieJar = {};
    expect(await redirectedTo(verifySignupCode(null, form({ email: "guest@example.invalid", code: "123456", next: NEXT })))).toBe(NEXT);

    // 4. The profile reopens the same draft.
    expect(await loadReviewDraft(DRAFT, V)).toEqual({ rating: 5, comment: "Fantastic photos of our wedding, so easy to work with.", eventType: "Wedding" });
    expect(await loadReviewDraft(DRAFT, "0f0f0f0f-0000-4000-8000-00000000000b")).toBeNull(); // only on its own vendor

    // 5. Signed in now; post it. The share channel comes from the draft.
    serverClient = realClient("anon-test-key");
    await serverClient.auth.setSession({ access_token: jwt(), refresh_token: "r" });
    expect(await submitReview(V, { rating: 5, comment: "Fantastic photos of our wedding, so easy to work with.", eventType: "Wedding", confirmed: true }, DRAFT)).toEqual({ success: true });
    expect(posted("/rest/v1/reviews")[0]).toEqual({
      provider_id: V,
      booking_id: null,
      reviewer_email: "guest@example.invalid",
      reviewer_user_id: USER,
      reviewer_name: "Mia D.",
      rating: 5,
      comment: "Fantastic photos of our wedding, so easy to work with.",
      event_type: "Wedding",
      source: "past_client",
      share_source: "share_qr",
    });
    // The draft is used up, so it doesn't reopen.
    expect(draftRow?.used_at).toBeTruthy();
    expect(await loadReviewDraft(DRAFT, V)).toBeNull();
  });

  it("an untagged visit posts without a share channel", async () => {
    serverClient = realClient("anon-test-key");
    await serverClient.auth.setSession({ access_token: jwt(), refresh_token: "r" });
    expect(await submitReview(V, { rating: 4, comment: "Lovely to work with and very reliable on the day.", eventType: null, confirmed: true })).toEqual({ success: true });
    expect(posted("/rest/v1/reviews")[0]).not.toHaveProperty("share_source");
  });
});
