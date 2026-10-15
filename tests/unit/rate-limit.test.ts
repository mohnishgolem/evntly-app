import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let adminAvailable = true;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (adminAvailable ? { rpc } : null),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { bucketKey, checkRateLimit, clientIpFrom, RATE_LIMITS } = await import("@/lib/rate-limit");

describe("rate limiting", () => {
  beforeEach(() => {
    rpc.mockReset();
    adminAvailable = true;
  });

  it("never stores raw IPs or emails in bucket keys", () => {
    const key = bucketKey("loginEmail", "Victim@Example.com");
    expect(key).toMatch(/^loginEmail:[0-9a-f]{32}$/);
    expect(key).not.toContain("example");
    // case/whitespace-insensitive, so "VICTIM@" can't dodge the limit
    expect(bucketKey("loginEmail", " victim@example.com ")).toBe(key);
  });

  it("takes the client IP from the first x-forwarded-for entry", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });

  it("blocks when the DB says the bucket is full", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await checkRateLimit("loginIp", "203.0.113.9")).toBe(false);
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: bucketKey("loginIp", "203.0.113.9"),
      p_max: RATE_LIMITS.loginIp.max,
      p_window_seconds: RATE_LIMITS.loginIp.windowSeconds,
    });
  });

  it("allows when under the limit", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await checkRateLimit("messageUser", "user-1")).toBe(true);
  });

  it("fails open (and does not crash) if the RPC is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "function not found" } });
    expect(await checkRateLimit("loginIp", "x")).toBe(true);
    adminAvailable = false;
    expect(await checkRateLimit("loginIp", "x")).toBe(true);
    warn.mockRestore();
  });
});
