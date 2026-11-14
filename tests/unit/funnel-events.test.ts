import { beforeEach, describe, expect, it, vi } from "vitest";

// Founding funnel events: what the browser may report through /api/track,
// and what reaches the funnel_events table (source from the cookie, no
// personal data).
const inserts: Record<string, unknown>[] = [];
let sourceCookie: string | undefined = "meta_ads";
let campaignCookie: string | undefined;

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
  cookies: async () => ({
    get: (name: string) => {
      const value = name === "evntly_fv_src" ? sourceCookie : name === "evntly_fv_cmp" ? campaignCookie : undefined;
      return value ? { value } : undefined;
    },
  }),
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
  campaignCookie = undefined;
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

  it("records the post's campaign tag from the cookie", async () => {
    sourceCookie = "instagram_bio";
    campaignCookie = "reel-a-1117";
    await post({ event: "claim_click", visitorId: "visitor-abc-123" });
    expect(inserts[0]).toMatchObject({ source: "instagram_bio", campaign: "reel-a-1117" });
  });

  it("drops a campaign cookie that isn't a clean tag", async () => {
    campaignCookie = "Reel A <script>";
    await post({ event: "claim_click", visitorId: "visitor-abc-123" });
    expect(inserts[0]).not.toHaveProperty("campaign");
  });

  it("leaves the campaign key out without a tag, so events survive a missing column", async () => {
    await post({ event: "claim_click", visitorId: "visitor-abc-123" });
    expect(inserts[0]).not.toHaveProperty("campaign");
  });

  it("still records page views as before", async () => {
    await post({ kind: "founding", visitorId: "visitor-abc-123" });
    expect(inserts).toEqual([{ table: "page_views", kind: "founding", visitor_id: "visitor-abc-123", vendor_id: null, user_id: null }]);
  });
});

describe("recordFunnelEvent", () => {
  it("keeps only code-like details, never free text", async () => {
    await recordFunnelEvent("signup_error", { detail: "weak_password" });
    await recordFunnelEvent("signup_error", { detail: "someone@example.com" });
    expect(inserts.map((r) => r.detail)).toEqual(["weak_password", null]);
  });
});
