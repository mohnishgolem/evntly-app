import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

let current: ReturnType<typeof fakeSupabase>;
const notify = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => current.client }));
vi.mock("@/lib/email", () => ({
  notify: (n: unknown) => notify(n),
  formatEventDate: (d: string) => d,
  formatAmount: (a: number) => `$${a}`,
}));

const { POST } = await import("@/app/api/cron/quote-followups/route");

function request(secret?: string) {
  return new Request("https://evntly.test/api/cron/quote-followups", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  }) as unknown as Parameters<typeof POST>[0];
}

const quote = {
  id: "q1",
  status: "pending",
  vendor_id: "v1",
  vendor_name: "DJ Test",
  vendor_user_id: "uv",
  client_user_id: "uc",
  service_type: "dj",
  event_type: "Wedding",
  event_date: "2026-12-01",
  location: "Bondi",
  quoted_amount: null,
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
};

describe("quote follow-ups cron route", () => {
  beforeEach(() => notify.mockClear());

  it("rejects requests without the shared secret", async () => {
    current = fakeSupabase({ results: { app_settings: { data: { value: "s3cret" } } } });
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(current.writes).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("rejects everything when no secret is configured", async () => {
    current = fakeSupabase({ results: { app_settings: { data: null } } });
    expect((await POST(request(""))).status).toBe(401);
  });

  it("emails due quotes and stamps them so they send once", async () => {
    current = fakeSupabase({
      results: {
        app_settings: { data: { value: "s3cret" } },
        quote_requests: { data: [quote] },
        users: { data: [{ id: "uv", email: "vendor@example.com" }, { id: "uc", email: "client@example.com" }] },
        service_providers: { data: [] },
      },
    });
    const res = await POST(request("s3cret"));
    expect(res.status).toBe(200);
    expect(notify).toHaveBeenCalled();
    expect(notify.mock.calls[0][0]).toMatchObject({ to: "vendor@example.com" });
    const stamped = current.writes.filter((w) => w.table === "quote_requests" && w.op === "update");
    expect(stamped.map((w) => Object.keys(w.payload as object)[0]).sort()).toEqual([
      "client_reminder_sent_at",
      "expiry_notice_sent_at",
      "vendor_reminder_sent_at",
    ]);
  });
});
