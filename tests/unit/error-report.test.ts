import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
const { errorFingerprint, scrubPath } = await import("@/lib/error-report");

describe("error report helpers", () => {
  it("strips query strings and calendar-feed tokens from paths", () => {
    expect(scrubPath("/reset-password?code=secret123")).toBe("/reset-password");
    expect(scrubPath("/calendar-feed/abcdef123.ics")).toBe("/calendar-feed/[token]");
    expect(scrubPath(null)).toBeNull();
  });

  it("groups the same error across different ids and numbers", () => {
    const a = errorFingerprint({
      source: "server",
      route: "render /vendor/[id]",
      message: "Listing 4e3d8cbe-f7f1-4053-aa6f-bc838c990cd8 not found after 3 tries",
    });
    const b = errorFingerprint({
      source: "server",
      route: "render /vendor/[id]",
      message: "Listing 151dc82e-11e7-44a2-a4dc-cea1c8bd6764 not found after 5 tries",
    });
    expect(a).toBe(b);
  });

  it("keeps different errors, routes and sources apart", () => {
    const base = { source: "server" as const, route: "render /x", message: "boom" };
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, message: "bang" }));
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, route: "render /y" }));
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, source: "client" }));
  });
});

// recordError through the REAL Supabase client with only the network faked:
// the database's claim_error_alert decides whether an alert email goes out.
describe("recordError alert emails", () => {
  type Call = { url: string; method: string; body: unknown };
  const calls: Call[] = [];
  let claimReply: { status: number; body: unknown } = { status: 200, body: true };

  const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = decodeURIComponent(String(input));
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.includes("/rpc/claim_error_alert")) {
      return new Response(JSON.stringify(claimReply.body), { status: claimReply.status, headers: { "Content-Type": "application/json" } });
    }
    const body = url.includes("/rest/v1/users") ? [{ email: "admin@example.invalid" }] : null;
    return new Response(body ? JSON.stringify(body) : null, { status: body ? 200 : 201, headers: { "Content-Type": "application/json" } });
  });

  const sendEmail = vi.fn();
  const report = { source: "server" as const, message: "boom", route: "render /x" };

  async function load() {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/email", () => ({ sendEmail }));
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient("https://example.supabase.co", "service-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fakeFetch as unknown as typeof fetch },
    });
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => client }));
    return (await import("@/lib/error-report")).recordError;
  }

  function reset(reply: typeof claimReply) {
    calls.length = 0;
    sendEmail.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    claimReply = reply;
  }

  it("emails the admins when the database grants the day's alert", async () => {
    reset({ status: 200, body: true });
    const recordError = await load();
    await recordError(report);

    const claim = calls.find((c) => c.url.includes("/rpc/claim_error_alert"));
    expect(claim?.method).toBe("POST");
    expect(claim?.body).toMatchObject({ p_daily_cap: 20, p_fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/) });
    // The event is stored before the claim.
    expect(calls.findIndex((c) => c.url.includes("/rest/v1/error_events"))).toBeLessThan(calls.indexOf(claim!));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("admin@example.invalid");
  });

  it("stores the event but sends nothing once the day's alert is taken", async () => {
    reset({ status: 200, body: false });
    const recordError = await load();
    await recordError(report);

    expect(calls.some((c) => c.url.includes("/rest/v1/error_events") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.includes("/rest/v1/users"))).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends nothing if the claim fails, rather than risk a flood", async () => {
    reset({ status: 404, body: { code: "PGRST202", message: "Could not find the function" } });
    const recordError = await load();
    await expect(recordError(report)).resolves.toBeUndefined();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[error-report] alert claim failed:", expect.any(String));
  });
});
