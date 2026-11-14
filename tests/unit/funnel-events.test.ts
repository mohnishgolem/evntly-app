import { beforeEach, describe, expect, it, vi } from "vitest";

// Founding funnel events: what the browser may report through /api/track,
// and what reaches the funnel_events table (source from the cookie, no
// personal data).
const inserts: Record<string, unknown>[] = [];
let sourceCookie: string | undefined = "meta_ads";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, ...row });
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "evntly_fv_src" && sourceCookie ? { value: sourceCookie } : undefined) }),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), clientIpFrom: () => "1.2.3.4" }));

const { POST } = await import("@/app/api/track/route");
const { recordFunnelEvent } = await import("@/lib/funnel-events");
const { NextRequest } = await import("next/server");

const post = (body: unknown) =>
  POST(new NextRequest("https://evntlyapp.com/api/track", { method: "POST", body: JSON.stringify(body), headers: { origin: "https://evntlyapp.com" } }));

beforeEach(() => {
  inserts.length = 0;
  sourceCookie = "meta_ads";
});

describe("/api/track funnel events", () => {
  it("records a claim click with the source from the cookie", async () => {
    expect((await post({ event: "claim_click", visitorId: "visitor-abc-123" })).status).toBe(204);
    expect(inserts).toEqual([{ table: "funnel_events", event: "claim_click", source: "meta_ads", detail: null, visitor_id: "visitor-abc-123" }]);
  });

  it("records a sign-up attempt without a source when there's no founding cookie", async () => {
    sourceCookie = undefined;
    await post({ event: "signup_attempt", visitorId: "visitor-abc-123" });
    expect(inserts).toEqual([{ table: "funnel_events", event: "signup_attempt", source: null, detail: null, visitor_id: "visitor-abc-123" }]);
  });

  it("ignores server-only events, unknown events and bad visitor ids", async () => {
    await post({ event: "account_created", visitorId: "visitor-abc-123" });
    await post({ event: "signup_error", visitorId: "visitor-abc-123", detail: "x" });
    await post({ event: "purchase", visitorId: "visitor-abc-123" });
    await post({ event: "claim_click", visitorId: "x" });
    await post({ event: "claim_click", visitorId: "someone@example.com" });
    expect(inserts).toEqual([]);
  });

  it("ignores a cookie that isn't a known founding source", async () => {
    sourceCookie = "evil<script>";
    await post({ event: "claim_click", visitorId: "visitor-abc-123" });
    expect(inserts[0]).toMatchObject({ source: null });
  });

  it("records founding page views with the founding source", async () => {
    sourceCookie = "meta_ads";
    await post({ kind: "founding", visitorId: "visitor-abc-123" });
    await post({ kind: "founding_claim", visitorId: "visitor-abc-123" });
    expect(inserts).toEqual([
      { table: "page_views", kind: "founding", visitor_id: "visitor-abc-123", vendor_id: null, user_id: null, source: "meta_ads" },
      { table: "page_views", kind: "founding_claim", visitor_id: "visitor-abc-123", vendor_id: null, user_id: null, source: "meta_ads" },
    ]);
  });

  it("credits the landing view to the page's own link tags, not a stale cookie", async () => {
    // The tracker can fire before <SourceCookie> saves the new source, so the
    // cookie still holds an earlier visit's source.
    sourceCookie = "waitlist_email";
    await post({ kind: "founding", visitorId: "visitor-abc-123", params: { utm_source: "meta", utm_medium: "paid_social" } });
    expect(inserts[0]).toMatchObject({ kind: "founding", source: "meta_ads" });
  });

  it("credits the landing view from its tags when there's no cookie yet", async () => {
    sourceCookie = undefined;
    await post({ kind: "founding", visitorId: "visitor-abc-123", params: { utm_source: "instagram", utm_medium: "story" } });
    await post({ kind: "founding_claim", visitorId: "visitor-abc-123", params: { src: "instagram_dm" } });
    expect(inserts.map((r) => r.source)).toEqual(["instagram_story", "instagram_dm"]);
  });

  it("falls back to the cookie on untagged founding pages", async () => {
    sourceCookie = "meta_ads";
    await post({ kind: "founding", visitorId: "visitor-abc-123" });
    await post({ kind: "founding", visitorId: "visitor-abc-123", params: { ref: "not a code!" } });
    expect(inserts.map((r) => r.source)).toEqual(["meta_ads", "meta_ads"]);
  });

  it("ignores tampered tags and never tags non-founding pages", async () => {
    sourceCookie = undefined;
    await post({ kind: "founding", visitorId: "visitor-abc-123", params: { utm_source: "meta", evil: "x" } });
    await post({ kind: "founding", visitorId: "visitor-abc-123", params: { utm_source: "x".repeat(41) } });
    await post({ kind: "founding", visitorId: "visitor-abc-123", params: ["meta"] });
    await post({ kind: "explore", visitorId: "visitor-abc-123", params: { utm_source: "meta", utm_medium: "paid" } });
    expect(inserts.map((r) => r.source)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("leaves the source off other page views", async () => {
    sourceCookie = "meta_ads";
    await post({ kind: "explore", visitorId: "visitor-abc-123" });
    expect(inserts).toEqual([{ table: "page_views", kind: "explore", visitor_id: "visitor-abc-123", vendor_id: null, user_id: null }]);
  });

  it("accepts the sign-up form view from the browser, but not email confirmation", async () => {
    await post({ event: "signup_view", visitorId: "visitor-abc-123" });
    await post({ event: "email_confirmed", visitorId: "visitor-abc-123" });
    expect(inserts).toEqual([{ table: "funnel_events", event: "signup_view", source: "meta_ads", detail: null, visitor_id: "visitor-abc-123" }]);
  });
});

describe("recordFunnelEvent", () => {
  it("keeps only code-like details, never free text", async () => {
    await recordFunnelEvent("signup_error", { detail: "weak_password" });
    await recordFunnelEvent("signup_error", { detail: "someone@example.com" });
    expect(inserts.map((r) => r.detail)).toEqual(["weak_password", null]);
  });
});
