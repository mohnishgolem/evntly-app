import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// The matching loaders wrap supabase-js calls, so they're tested through the
// REAL client with only the network faked (see rate-limit-real-client).
const calls: { url: string; body: unknown }[] = [];
const replies: Record<string, unknown> = {};

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
  const key = Object.keys(replies).find((k) => url.includes(k));
  return new Response(JSON.stringify(key ? replies[key] : []), { status: 200, headers: { "Content-Type": "application/json" } });
});

const client = createClient("https://example.supabase.co", "anon-test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});

const { loadMatchingSettings, loadMatchContext } = await import("@/lib/data/matching");
const { DEFAULT_WEIGHTS } = await import("@/lib/matching/engine");

describe("matching loaders with the real Supabase client", () => {
  it("reads the admin weights through the matching_settings RPC", async () => {
    calls.length = 0;
    replies["rpc/matching_settings"] = { enabled: false, weights: { suitability: 1, budget: 1, quality: 1, location: 1, reliability: 1 } };
    const s = await loadMatchingSettings(client);
    expect(calls[0].url).toBe("https://example.supabase.co/rest/v1/rpc/matching_settings");
    expect(s.enabled).toBe(false);
    expect(s.weights.budget).toBe(20);
  });

  it("falls back to defaults when the RPC fails", async () => {
    replies["rpc/matching_settings"] = null;
    expect(await loadMatchingSettings(client)).toEqual({ enabled: true, weights: DEFAULT_WEIGHTS });
  });

  it("asks for busy slots around the event (day before to day after) and groups packages", async () => {
    calls.length = 0;
    replies["vendor_packages"] = [
      { id: "p1", provider_id: "v1", name: "A", price_cents: 1000, included_hours: "4.0", extra_hour_cents: null, inclusions: [], delivery_days: null, deposit_percent: null, active: true },
    ];
    replies["portfolio_items"] = [{ provider_id: "v1" }, { provider_id: "v1" }];
    replies["rpc/vendor_busy_slots"] = [{ provider_id: "v1", slot_start: "2026-11-14T18:00:00", slot_end: "2026-11-14T22:00:00" }];
    const ctx = await loadMatchContext(client, ["v1"], "2026-11-14", DEFAULT_WEIGHTS);
    const busyCall = calls.find((c) => c.url.includes("vendor_busy_slots"))!;
    expect(busyCall.body).toEqual({ p_from: "2026-11-13T00:00:00", p_to: "2026-11-16T00:00:00" });
    expect(calls.find((c) => c.url.includes("vendor_packages"))!.url).toContain("active=eq.true");
    expect(ctx.packages.get("v1")![0].included_hours).toBe(4);
    expect(ctx.portfolioCounts.get("v1")).toBe(2);
    expect(ctx.busy).toHaveLength(1);
  });

  it("makes no requests when there are no candidates", async () => {
    calls.length = 0;
    await loadMatchContext(client, [], "2026-11-14", DEFAULT_WEIGHTS);
    expect(calls).toHaveLength(0);
  });
});
