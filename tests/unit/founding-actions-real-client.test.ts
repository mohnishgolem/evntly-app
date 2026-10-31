import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

// Founding-vendor actions through the REAL supabase-js and Resend clients,
// with only the network faked, so the tests see exactly what goes out.
type Call = { url: string; method: string; body: unknown; headers: Headers };
const calls: Call[] = [];
const respond = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let resendStatus = 200;
let prepareError: string | null = null;
const handler = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  let body: unknown = null;
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }
  calls.push({ url, method, body, headers: new Headers(init?.headers) });
  if (url.startsWith("https://api.resend.com/emails")) {
    return resendStatus === 200 ? respond({ id: `re_${calls.length}` }) : respond({ name: "rate_limit_exceeded", message: "Too many requests" }, resendStatus);
  }
  if (url.includes("/rpc/claim_founding_vendor_place")) return respond([{ application_id: "app-1", status: "started", invite: "attached", created: true }]);
  if (url.includes("/rpc/admin_prepare_beta_invitation")) {
    if (prepareError) return respond({ code: "P0001", message: prepareError }, 400);
    return respond([{ invitation_id: "inv-1", email: "jane@photo.com.au", first_name: "Jane", unsubscribe_token: "c".repeat(64), expires_at: "2026-11-15T00:00:00Z", send_number: 1 }]);
  }
  if (url.includes("/rpc/")) return respond(null, 204);
  if (url.includes("/rest/v1/beta_program")) return respond({ batch_size_limit: 10 });
  if (url.includes("/rest/v1/vendor_waitlist") && method === "GET") return respond(null);
  if (url.includes("/rest/v1/beta_applications") && method === "GET") return respond(null);
  return respond(null, 201);
};
const fakeFetch = vi.fn(handler);

const realClient = (key: string) =>
  createClient("https://example.supabase.co", key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch as unknown as typeof fetch },
  });
const userClient = realClient("anon-test-key");
let signedIn: { id: string; email: string } | null = { id: "22222222-2222-4222-8222-222222222222", email: "jane@photo.com.au" };
vi.spyOn(userClient.auth, "getUser").mockImplementation(async () => ({ data: { user: signedIn }, error: null }) as never);
const adminClient = realClient("service-role-test-key");

let adminSession: { admin: boolean; mfa: string } = { admin: true, mfa: "ok" };
let cookieSource: string | undefined;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => userClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: (name: string) => (name === "evntly_fv_src" && cookieSource ? { value: cookieSource } : undefined) }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  clientIp: vi.fn(async () => "1.2.3.4"),
  RATE_LIMIT_ERROR: "Too many attempts.",
}));
const notify = vi.fn();
vi.mock("@/lib/email", () => ({ notify: (...a: unknown[]) => notify(...a), sendEmail: vi.fn() }));
vi.mock("@/lib/data/user", () => ({
  getAdminSession: async () => ({
    ...adminSession,
    session: { user: { id: "admin-1", email: "mohnish@evntlyapp.com", user_metadata: { full_name: "Mohnish Golem" } } },
  }),
}));

const { claimFoundingPlace, joinVendorWaitlist, unsubscribeFromInvites } = await import("@/lib/actions/founding");
const { sendInvitations, sendTestInvitation, decideApplication } = await import("@/lib/actions/admin-founding");

const rpc = (name: string) => calls.filter((c) => c.url.includes(`/rest/v1/rpc/${name}`));
const resendCalls = () => calls.filter((c) => c.url.startsWith("https://api.resend.com/emails"));
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const TOKEN = "A".repeat(43);

beforeEach(() => {
  calls.length = 0;
  notify.mockClear();
  signedIn = { id: "22222222-2222-4222-8222-222222222222", email: "jane@photo.com.au" };
  adminSession = { admin: true, mfa: "ok" };
  cookieSource = undefined;
  resendStatus = 200;
  prepareError = null;
  vi.stubGlobal("fetch", fakeFetch);
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "Evntly <hello@evntlyapp.com>";
  delete process.env.BETA_INVITES_LIVE;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("claimFoundingPlace", () => {
  it("needs a signed-in account", async () => {
    signedIn = null;
    expect((await claimFoundingPlace(null, form({})))?.error).toMatch(/Log in/);
    expect(rpc("claim_founding_vendor_place")).toHaveLength(0);
  });

  it("sends only the SHA-256 of the invite token, never the token", async () => {
    const res = await claimFoundingPlace(null, form({ invite: TOKEN, source: "waitlist_email" }));
    expect(res?.success).toBe(true);
    const [call] = rpc("claim_founding_vendor_place");
    expect(call.body).toEqual({ p_invite_token_hash: createHash("sha256").update(TOKEN).digest("hex"), p_source: "waitlist_email" });
    expect(JSON.stringify(calls)).not.toContain(TOKEN);
  });

  it("drops malformed tokens and unknown sources, falling back to the cookie", async () => {
    cookieSource = "instagram_dm";
    await claimFoundingPlace(null, form({ invite: "preview", source: "evil" }));
    expect(rpc("claim_founding_vendor_place")[0].body).toEqual({ p_source: "instagram_dm" });
  });
});

describe("joinVendorWaitlist", () => {
  it("requires the consent box", async () => {
    const res = await joinVendorWaitlist(null, form({ email: "a@b.com.au", firstName: "A" }));
    expect(res?.error).toMatch(/Tick the box/);
    expect(calls.filter((c) => c.url.includes("vendor_waitlist"))).toHaveLength(0);
  });

  it("silently accepts honeypot submissions without storing them", async () => {
    const res = await joinVendorWaitlist(null, form({ email: "a@b.com.au", firstName: "A", consent: "on", website: "spam" }));
    expect(res?.success).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("stores consent with a timestamp and where it came from", async () => {
    const res = await joinVendorWaitlist(null, form({ email: "New@Vendor.com.au", firstName: "Nia", category: "dj", consent: "on" }));
    expect(res?.success).toBe(true);
    const insert = calls.find((c) => c.url.includes("/rest/v1/vendor_waitlist") && c.method === "POST");
    expect(insert?.headers.get("apikey")).toBe("service-role-test-key");
    expect(insert?.body).toMatchObject({ email: "New@Vendor.com.au", invite_consent: true, source: "founding_page", category: "dj" });
    expect((insert?.body as { consent_at: string }).consent_at).toBeTruthy();
  });
});

describe("unsubscribe", () => {
  it("rejects malformed tokens without calling the database", async () => {
    expect((await unsubscribeFromInvites(null, form({ t: "nope" })))?.error).toBeTruthy();
    expect(rpc("beta_unsubscribe")).toHaveLength(0);
  });
  it("calls beta_unsubscribe with the token", async () => {
    const t = "d".repeat(64);
    expect((await unsubscribeFromInvites(null, form({ t })))?.success).toBe(true);
    expect(rpc("beta_unsubscribe")[0].body).toEqual({ p_token: t });
  });
});

describe("sendInvitations", () => {
  it("refuses non-admins and admins without MFA", async () => {
    adminSession = { admin: true, mfa: "needs-verify" };
    expect((await sendInvitations(["11111111-1111-4111-8111-111111111111"]))?.error).toMatch(/Not authorized/);
    adminSession = { admin: false, mfa: "n/a" };
    expect((await sendInvitations(["11111111-1111-4111-8111-111111111111"]))?.error).toMatch(/Not authorized/);
    expect(calls).toHaveLength(0);
  });

  it("sends nothing unless BETA_INVITES_LIVE=true", async () => {
    const res = await sendInvitations(["11111111-1111-4111-8111-111111111111"]);
    expect(res?.error).toMatch(/Live sending is switched off/);
    expect(calls).toHaveLength(0);
  });

  it("prepares, sends with an idempotency key + unsubscribe headers, then records", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    const res = await sendInvitations(["11111111-1111-4111-8111-111111111111"]);
    expect(res?.message).toBe("Sent 1 of 1 invitation.");
    const prep = rpc("admin_prepare_beta_invitation")[0];
    expect((prep.body as { p_token_hash: string }).p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    const [send] = resendCalls();
    expect(send.headers.get("Idempotency-Key")).toBe("beta-invite-inv-1-1");
    const payload = send.body as { to: string; subject: string; headers: Record<string, string>; html: string };
    expect(payload.to).toBe("jane@photo.com.au");
    expect(payload.subject).toBe("You're Invited — Claim Your Free Evntly Vendor Account");
    expect(payload.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    // The emailed link carries the raw token whose hash was stored.
    const token = payload.html.match(/invite=([A-Za-z0-9_-]{43})/)![1];
    expect(createHash("sha256").update(token).digest("hex")).toBe((prep.body as { p_token_hash: string }).p_token_hash);
    expect(rpc("admin_record_beta_invitation")[0].body).toMatchObject({ p_invitation_id: "inv-1", p_ok: true });
  });

  it("records a failure and stops the batch when Resend rate-limits", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    resendStatus = 429;
    const res = await sendInvitations(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
    expect(res?.message).toBe("Sent 0 of 2 invitations.");
    expect(resendCalls()).toHaveLength(1);
    expect(rpc("admin_record_beta_invitation")[0].body).toMatchObject({ p_ok: false });
  });

  it("skips contacts the database refuses (consent, unsubscribed, duplicates)", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    prepareError = "This contact unsubscribed.";
    const res = await sendInvitations(["11111111-1111-4111-8111-111111111111"]);
    expect(res?.details?.[0]).toMatch(/unsubscribed/);
    expect(resendCalls()).toHaveLength(0);
  });

  it("refuses batches bigger than the configured limit", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    const ids = Array.from({ length: 11 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`);
    expect((await sendInvitations(ids))?.error).toMatch(/limited to 10/);
    expect(resendCalls()).toHaveLength(0);
  });
});

describe("sendTestInvitation", () => {
  it("sends only to the signed-in admin, even with live sending off, with a dead preview link", async () => {
    const res = await sendTestInvitation();
    expect(res?.success).toBe(true);
    const [send] = resendCalls();
    const payload = send.body as { to: string; subject: string; html: string };
    expect(payload.to).toBe("mohnish@evntlyapp.com");
    expect(payload.subject).toMatch(/^\[TEST\]/);
    expect(payload.html).toContain("invite=preview");
    expect(rpc("admin_prepare_beta_invitation")).toHaveLength(0);
  });
});

describe("decideApplication", () => {
  it("goes through the capacity-checked RPC", async () => {
    await decideApplication("app-1", "needs_changes", "Add three photos");
    expect(rpc("admin_decide_founding_application")[0].body).toEqual({
      p_application_id: "app-1",
      p_decision: "needs_changes",
      p_note: "Add three photos",
    });
  });
});
