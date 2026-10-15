import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Uses the REAL supabase-js client (only the network is faked). The first
// version of checkRateLimit called a detached `admin.rpc`, which lost `this`
// and threw before any request — mocks of rpc() couldn't catch that, and it
// took down login/messaging in production.
const calls: { url: string; body: unknown }[] = [];
let reply: () => Response = () => new Response("true", { status: 200, headers: { "Content-Type": "application/json" } });

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
  return reply();
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    createClient("https://example.supabase.co", "service-role-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fakeFetch as unknown as typeof fetch },
    }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { checkRateLimit, bucketKey } = await import("@/lib/rate-limit");

describe("checkRateLimit with the real Supabase client", () => {
  it("actually calls the check_rate_limit RPC", async () => {
    calls.length = 0;
    expect(await checkRateLimit("loginIp", "203.0.113.9")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://example.supabase.co/rest/v1/rpc/check_rate_limit");
    expect(calls[0].body).toMatchObject({ p_key: bucketKey("loginIp", "203.0.113.9"), p_max: 20 });
  });

  it("blocks when the RPC says the bucket is full", async () => {
    reply = () => new Response("false", { status: 200, headers: { "Content-Type": "application/json" } });
    expect(await checkRateLimit("messageUser", "user-1")).toBe(false);
  });

  it("fails open (never throws) if the network call blows up", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = () => {
      throw new Error("network down");
    };
    await expect(checkRateLimit("loginEmail", "a@example.com")).resolves.toBe(true);
    err.mockRestore();
    warn.mockRestore();
  });
});
