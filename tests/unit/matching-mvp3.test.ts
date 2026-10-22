import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { fakeSupabase } from "./fake-supabase";
import type { CategoryMatches } from "@/lib/matching/engine";

const adminCalls: { method: string; url: string; body: unknown }[] = [];
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  adminCalls.push({ method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response("[]", { status: 201, headers: { "Content-Type": "application/json" } });
});

let current: ReturnType<typeof fakeSupabase>;
let adminSession: { admin: boolean; mfa: string } = { admin: false, mfa: "n/a" };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("@/lib/data/user", () => ({ getAdminSession: async () => ({ session: null, ...adminSession }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    createClient("https://example.supabase.co", "service-role-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fakeFetch as unknown as typeof fetch },
    }),
}));

const { matchRunRows } = await import("@/lib/matching/engine");
const { recordMatchRuns } = await import("@/lib/data/matching");
const { setMatchingSettings } = await import("@/lib/actions/admin-matching");

const ev = { id: "e1", suburb: "Parramatta", event_date: "2099-11-14" };
const scored = (vendorId: string, score: number, status: "eligible" | "unconfirmed") =>
  ({ vendorId, score, status, exclusions: [], pending: [], distanceKm: 1, areaTier: 0, price: null, parts: {}, reason: "" }) as never;
const matches = new Map<string, CategoryMatches>([
  [
    "photographer",
    {
      service: "photographer",
      eligible: [scored("a", 81, "eligible")],
      unconfirmed: [scored("b", 64, "unconfirmed")],
      excluded: [
        { vendorId: "c", status: "excluded", exclusions: [{ code: "over_budget", message: "" }, { code: "outside_area", message: "" }], pending: [], distanceKm: 90, areaTier: null, price: null },
        { vendorId: "d", status: "excluded", exclusions: [{ code: "sample_listing", message: "" }], pending: [], distanceKm: 3, areaTier: 0, price: null },
      ],
      widened: false,
    },
  ],
  ["dj", { service: "dj", eligible: [], unconfirmed: [], excluded: [], widened: false }],
]);

describe("matchRunRows", () => {
  it("summarises each category, counting every exclusion reason", () => {
    expect(matchRunRows(ev, matches, "2026-10-22")).toEqual([
      {
        event_id: "e1", service: "photographer", run_date: "2026-10-22", suburb: "Parramatta", event_date: "2099-11-14",
        eligible: 1, unconfirmed: 1, excluded: 2, widened: false, top_score: 81,
        exclusion_counts: { over_budget: 1, outside_area: 1, sample_listing: 1 },
      },
      {
        event_id: "e1", service: "dj", run_date: "2026-10-22", suburb: "Parramatta", event_date: "2099-11-14",
        eligible: 0, unconfirmed: 0, excluded: 0, widened: false, top_score: null, exclusion_counts: {},
      },
    ]);
  });
});

describe("recordMatchRuns (real service-role client)", () => {
  it("upserts one row per category per day", async () => {
    adminCalls.length = 0;
    await recordMatchRuns(ev, matches);
    expect(adminCalls).toHaveLength(1);
    expect(adminCalls[0].method).toBe("POST");
    expect(adminCalls[0].url).toBe("https://example.supabase.co/rest/v1/match_runs?on_conflict=event_id%2Cservice%2Crun_date&columns=%22event_id%22%2C%22service%22%2C%22run_date%22%2C%22suburb%22%2C%22event_date%22%2C%22eligible%22%2C%22unconfirmed%22%2C%22excluded%22%2C%22widened%22%2C%22top_score%22%2C%22exclusion_counts%22%2C%22updated_at%22");
    expect((adminCalls[0].body as unknown[]).length).toBe(2);
  });

  it("never throws if the write fails", async () => {
    fakeFetch.mockImplementationOnce(async () => {
      throw new Error("network down");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordMatchRuns(ev, matches)).resolves.toBeUndefined();
    err.mockRestore();
  });
});

describe("setMatchingSettings", () => {
  const weights = { suitability: 30, budget: 25, quality: 20, location: 15, reliability: 10 };

  it("refuses non-admins and admins without MFA", async () => {
    current = fakeSupabase({});
    adminSession = { admin: false, mfa: "n/a" };
    expect(await setMatchingSettings({ enabled: true, weights })).toEqual({ error: "Not authorized." });
    adminSession = { admin: true, mfa: "enrol" };
    expect(await setMatchingSettings({ enabled: true, weights })).toEqual({ error: "Not authorized." });
    expect(current.client.rpc).not.toHaveBeenCalled();
  });

  it("rejects out-of-range or all-zero weights before calling the database", async () => {
    current = fakeSupabase({});
    adminSession = { admin: true, mfa: "ok" };
    expect((await setMatchingSettings({ enabled: true, weights: { ...weights, budget: 500 } }))?.error).toBeTruthy();
    expect((await setMatchingSettings({ enabled: true, weights: { suitability: 0, budget: 0, quality: 0, location: 0, reliability: 0 } }))?.error).toMatch(/above zero/);
    expect(current.client.rpc).not.toHaveBeenCalled();
  });

  it("saves through the audited RPC for MFA-verified admins", async () => {
    current = fakeSupabase({ results: { "rpc:admin_set_matching_settings": { data: {} } } });
    adminSession = { admin: true, mfa: "ok" };
    expect(await setMatchingSettings({ enabled: false, weights })).toEqual({ success: true });
    expect(current.client.rpc).toHaveBeenCalledWith("admin_set_matching_settings", { p_enabled: false, p_weights: weights });
  });
});
