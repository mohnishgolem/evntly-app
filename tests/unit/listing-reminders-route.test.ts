import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// The hourly reminder job, through the REAL service-role supabase-js client
// with the network faked.

type Call = { method: string; url: string; body: unknown };
const calls: Call[] = [];
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
let drafts: unknown[] = [];
let alreadyLogged = false;
// Onboarding reminders (item 2): approved listings, Founding claims without a
// listing, and whether the new log table exists yet.
let approved: unknown[] = [];
let claims: unknown[] = [];
let onboardingTable: "ok" | "missing" = "ok";

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  if (url.includes("/app_settings")) return json({ value: "s3cret" });
  if (url.includes("/service_providers") && url.includes("status=eq.approved")) return json(approved);
  if (url.includes("/service_providers")) return json(drafts);
  if (url.includes("/beta_applications")) return json(url.includes("status=eq.started") ? claims : []);
  if (url.includes("/vendor_onboarding_reminders")) {
    if (onboardingTable === "missing")
      return new Response(JSON.stringify({ code: "42P01", message: 'relation "vendor_onboarding_reminders" does not exist' }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    return json(method === "POST" ? [{ user_id: "logged" }] : []);
  }
  if (url.includes("/portfolio_items")) return json([{ provider_id: "sp-a" }]);
  if (url.includes("/vendor_packages")) return json([]);
  if (url.includes("/listing_completion_reminders") && method === "GET") return json([]);
  if (url.includes("/listing_completion_reminders") && method === "POST")
    return json(alreadyLogged ? [] : [{ provider_id: "sp-a" }]);
  if (url.includes("/users"))
    return json([
      { id: "u-a", email: "vendor-a@realdomain.com.au", role: "vendor" },
      { id: "u-b", email: "vendor-b@realdomain.com.au", role: "vendor" },
    ]);
  return json([]);
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    createClient("https://example.supabase.co", "service-role-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fakeFetch as unknown as typeof fetch },
    }),
}));
const notified: { to: string; category: string; subject: string; cta: { path: string } }[] = [];
vi.mock("@/lib/email", () => ({ notify: vi.fn((n: (typeof notified)[number]) => void notified.push(n)) }));

const { POST } = await import("@/app/api/cron/listing-reminders/route");
const { ONBOARDING_REMINDERS_FROM } = await import("@/lib/onboarding-reminders");
const request = (secret?: string) =>
  new Request("https://example.test/api/cron/listing-reminders", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  }) as never;

beforeEach(() => {
  calls.length = 0;
  notified.length = 0;
  alreadyLogged = false;
  approved = [];
  claims = [];
  onboardingTable = "ok";
  drafts = [{ id: "sp-a", name: "Lens & Light", owner_user_id: "u-a", created_at: hoursAgo(30) }];
});

describe("listing reminder job", () => {
  it("refuses calls without the shared secret", async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(notified).toHaveLength(0);
  });

  it("only asks for unsubmitted drafts", async () => {
    await POST(request("s3cret"));
    const q = calls.find((c) => c.url.includes("/service_providers"))!.url;
    expect(q).toContain("status=eq.draft");
    expect(q).toContain("is_demo=eq.false");
  });

  it("logs, then sends the 24 h reminder under the vendor's Reminders setting", async () => {
    const res = await POST(request("s3cret"));
    expect(await res.json()).toEqual({ sent: 1, noListing: 0, liveIncomplete: 0 });
    const log = calls.find((c) => c.method === "POST" && c.url.includes("/listing_completion_reminders"));
    expect(log?.body).toEqual({ provider_id: "sp-a", kind: "24h" });
    // ON CONFLICT DO NOTHING, returning the row only when this run logged it.
    expect(log?.url).toContain("on_conflict=provider_id%2Ckind");
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({
      to: "vendor-a@realdomain.com.au",
      category: "reminders",
      cta: { path: "/vendor-dashboard/finish" },
    });
  });

  it("doesn't send when another run already logged that reminder", async () => {
    alreadyLogged = true;
    expect(await (await POST(request("s3cret"))).json()).toEqual({ sent: 0, noListing: 0, liveIncomplete: 0 });
    expect(notified).toHaveLength(0);
  });

  it("sends nothing for a draft saved less than a day ago", async () => {
    drafts = [{ id: "sp-a", name: "Lens & Light", owner_user_id: "u-a", created_at: hoursAgo(5) }];
    expect(await (await POST(request("s3cret"))).json()).toEqual({ sent: 0, noListing: 0, liveIncomplete: 0 });
    expect(notified).toHaveLength(0);
  });
});

describe("onboarding reminders (no listing, live but incomplete)", () => {
  // After the cut-off, so these vendors are in scope.
  const now = ONBOARDING_REMINDERS_FROM + 10 * 24 * 3600_000;
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    drafts = [];
  });
  afterEach(() => vi.useRealTimers());

  it("reminds a vendor who claimed a place 25 hours ago and has no listing", async () => {
    claims = [{ user_id: "u-b", campaign: null, created_at: ago(25) }];
    expect(await (await POST(request("s3cret"))).json()).toEqual({ sent: 0, noListing: 1, liveIncomplete: 0 });
    const log = calls.find((c) => c.method === "POST" && c.url.includes("/vendor_onboarding_reminders"));
    expect(log?.body).toEqual({ user_id: "u-b", kind: "no_listing_24h" });
    expect(log?.url).toContain("on_conflict=user_id%2Ckind");
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ to: "vendor-b@realdomain.com.au", category: "reminders", cta: { path: "/vendor-signup" } });
  });

  it("reminds a live listing still missing a package two days after approval", async () => {
    approved = [{ id: "sp-b", name: "Sweet Things", owner_user_id: "u-b", is_demo: false, created_at: ago(60) }];
    expect(await (await POST(request("s3cret"))).json()).toEqual({ sent: 0, noListing: 0, liveIncomplete: 1 });
    expect(notified[0]).toMatchObject({ to: "vendor-b@realdomain.com.au", category: "reminders", cta: { path: "/vendor-dashboard/finish" } });
    const q = calls.find((c) => c.url.includes("status=eq.approved"))!.url;
    expect(q).toContain("is_demo=eq.false");
  });

  it("sends nothing until the migration is applied, and the draft reminders still run", async () => {
    onboardingTable = "missing";
    claims = [{ user_id: "u-b", campaign: null, created_at: ago(25) }];
    drafts = [{ id: "sp-a", name: "Lens & Light", owner_user_id: "u-a", created_at: ago(30) }];
    const res = await POST(request("s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1, noListing: 0, liveIncomplete: 0 });
    expect(notified.map((n) => n.to)).toEqual(["vendor-a@realdomain.com.au"]);
  });
});
