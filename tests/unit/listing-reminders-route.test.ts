import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// The hourly reminder job, through the REAL service-role supabase-js client
// with the network faked.

type Call = { method: string; url: string; body: unknown };
const calls: Call[] = [];
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
let drafts: unknown[] = [];
let approved: unknown[] = [];
let settings: { key: string; value: string }[] = [];
let sentRows: { provider_id: string; kind: string }[] = [];
let alreadyLogged = false;

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  // The approved-incomplete switch and skip list (key=in.(...)); otherwise the cron secret.
  if (url.includes("/app_settings") && url.includes("key=in.")) return json(settings);
  if (url.includes("/app_settings")) return json({ value: "s3cret" });
  if (url.includes("/service_providers") && url.includes("status=eq.approved")) return json(approved);
  if (url.includes("/service_providers")) return json(drafts);
  if (url.includes("/portfolio_items")) return json([{ provider_id: "sp-a" }]);
  if (url.includes("/vendor_packages")) return json([]);
  if (url.includes("/listing_completion_reminders") && method === "GET") return json(sentRows);
  if (url.includes("/listing_completion_reminders") && method === "POST")
    return json(alreadyLogged ? [] : [{ provider_id: "sp-a" }]);
  if (url.includes("/users")) return json([{ id: "u-a", email: "vendor-a@realdomain.com.au" }]);
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
const request = (secret?: string) =>
  new Request("https://example.test/api/cron/listing-reminders", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  }) as never;

beforeEach(() => {
  calls.length = 0;
  notified.length = 0;
  alreadyLogged = false;
  drafts = [{ id: "sp-a", name: "Lens & Light", owner_user_id: "u-a", created_at: hoursAgo(30) }];
  approved = [];
  settings = [];
  sentRows = [];
});

// Live listings approved before the gate: one email each, only when Sai
// switches it on in app_settings, never to ids on the skip list.
describe("approved-but-incomplete reminder", () => {
  beforeEach(() => {
    drafts = [];
    approved = [{ id: "sp-a", name: "DJ Example", owner_user_id: "u-a" }];
  });

  it("is off by default: doesn't even look up approved listings", async () => {
    expect(await (await POST(request("s3cret"))).json()).toEqual({ sent: 0 });
    expect(calls.some((c) => c.url.includes("status=eq.approved"))).toBe(false);
    expect(notified).toHaveLength(0);
  });

  it("stays off for any value other than 'on'", async () => {
    settings = [{ key: "approved_incomplete_reminders", value: "off" }];
    await POST(request("s3cret"));
    expect(notified).toHaveLength(0);
  });

  it("when on, logs once then emails a live listing missing photos or a package", async () => {
    settings = [{ key: "approved_incomplete_reminders", value: "on" }];
    expect(await (await POST(request("s3cret"))).json()).toEqual({ sent: 1 });
    const q = calls.find((c) => c.url.includes("status=eq.approved"))!.url;
    expect(q).toContain("is_demo=eq.false");
    const log = calls.find((c) => c.method === "POST" && c.url.includes("/listing_completion_reminders"));
    expect(log?.body).toEqual({ provider_id: "sp-a", kind: "approved_incomplete" });
    expect(notified[0]).toMatchObject({
      to: "vendor-a@realdomain.com.au",
      category: "reminders",
      cta: { path: "/vendor-dashboard/finish" },
    });
    expect(notified[0].subject).toContain("DJ Example is live on Evntly");
  });

  it("never sends twice, and skips ids on the skip list", async () => {
    settings = [{ key: "approved_incomplete_reminders", value: "on" }];
    sentRows = [{ provider_id: "sp-a", kind: "approved_incomplete" }];
    await POST(request("s3cret"));
    expect(notified).toHaveLength(0);

    sentRows = [];
    settings = [
      { key: "approved_incomplete_reminders", value: "on" },
      { key: "approved_incomplete_reminders_skip", value: "sp-x, sp-a" },
    ];
    await POST(request("s3cret"));
    expect(notified).toHaveLength(0);
  });
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
    expect(await res.json()).toEqual({ sent: 1 });
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
    expect(await (await POST(request("s3cret"))).json()).toEqual({ sent: 0 });
    expect(notified).toHaveLength(0);
  });

  it("sends nothing for a draft saved less than a day ago", async () => {
    drafts = [{ id: "sp-a", name: "Lens & Light", owner_user_id: "u-a", created_at: hoursAgo(5) }];
    expect(await (await POST(request("s3cret"))).json()).toEqual({ sent: 0 });
    expect(notified).toHaveLength(0);
  });
});
