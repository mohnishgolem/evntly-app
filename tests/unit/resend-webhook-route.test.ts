import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// The Resend webhook route end to end: real Svix-style signatures over the
// raw body, and the REAL supabase-js client with only the network faked, so
// the test sees exactly which rows the route would change.
const secretBytes = Buffer.from("test-only-webhook-signing-key");
const SECRET = `whsec_${secretBytes.toString("base64")}`;

type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];
let invitation: Record<string, unknown> | null = null;

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  calls.push({ url, method, body });
  if (url.includes("/rest/v1/beta_invitations") && method === "GET") {
    return new Response(invitation ? JSON.stringify(invitation) : "null", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return new Response(null, { status: 204 });
});
const admin = createClient("https://example.supabase.co", "service-role-test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

const { POST } = await import("@/app/api/resend/webhook/route");

function signed(event: unknown, opts: { secret?: Buffer; ts?: number; tamper?: boolean; headers?: boolean } = {}) {
  const body = JSON.stringify(event);
  const id = "msg_test_1";
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", opts.secret ?? secretBytes).update(`${id}.${ts}.${body}`).digest("base64");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.headers !== false) Object.assign(headers, { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` });
  return new Request("https://evntlyapp.com/api/resend/webhook", {
    method: "POST",
    headers,
    body: opts.tamper ? body.replace("re_", "rx_") : body,
  }) as never;
}
const event = (type: string, emailId = "re_abc") => ({ type, created_at: "2026-11-01T00:00:00Z", data: { email_id: emailId } });
const patches = () => calls.filter((c) => c.method === "PATCH");

beforeEach(() => {
  calls.length = 0;
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  invitation = { id: "inv-1", waitlist_id: "wl-1", opened_at: null, clicked_at: null, delivery_status: "sent" };
});
afterEach(() => {
  delete process.env.RESEND_WEBHOOK_SECRET;
});

describe("signature", () => {
  it("is 503 (Resend retries) until the secret is configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    expect((await POST(signed(event("email.delivered")))).status).toBe(503);
  });

  it.each([
    ["no Svix headers", { headers: false }],
    ["a different secret", { secret: Buffer.from("someone-else") }],
    ["a body changed after signing", { tamper: true }],
    ["a timestamp older than 5 minutes", { ts: Math.floor(Date.now() / 1000) - 600 }],
  ])("returns 400 for %s and touches nothing", async (_label, opts) => {
    const res = await POST(signed(event("email.delivered"), opts));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("events", () => {
  it.each([
    ["email.sent", "sent", { delivery_status: "sent" }],
    ["email.delivered", "sent", { delivery_status: "delivered" }],
    ["email.delivery_delayed", "sent", { delivery_status: "delivery_delayed" }],
    ["email.bounced", "delivered", { delivery_status: "bounced" }],
    ["email.complained", "delivered", { delivery_status: "complained" }],
  ])("%s → records it (200)", async (type, current, expected) => {
    invitation!.delivery_status = current;
    const res = await POST(signed(event(type)));
    expect(res.status).toBe(200);
    expect(patches()[0].url).toContain("/rest/v1/beta_invitations");
    expect(patches()[0].body).toMatchObject(expected);
  });

  it("a bounce or complaint also stops future emails to that contact", async () => {
    await POST(signed(event("email.complained")));
    const unsub = patches().find((c) => c.url.includes("/rest/v1/vendor_waitlist"));
    expect(unsub?.url).toContain("id=eq.wl-1");
    expect(unsub?.body).toMatchObject({ invite_consent: false });
  });

  it("a late 'delivered' never overwrites a bounce", async () => {
    invitation!.delivery_status = "bounced";
    const res = await POST(signed(event("email.delivered")));
    expect(res.status).toBe(200);
    expect(patches()).toHaveLength(0);
  });

  it("email.opened and email.clicked are recorded once", async () => {
    await POST(signed(event("email.opened")));
    expect(Object.keys(patches()[0].body as object)).toContain("opened_at");
    calls.length = 0;
    invitation!.opened_at = "2026-11-01T00:00:00Z";
    await POST(signed(event("email.opened")));
    expect(patches()).toHaveLength(0);
    await POST(signed(event("email.clicked")));
    expect(Object.keys(patches()[0].body as object)).toContain("clicked_at");
  });

  it("ignores other event types with 200, without a database call", async () => {
    for (const type of ["contact.created", "domain.updated", "email.scheduled"]) {
      const res = await POST(signed(event(type)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ignored: true });
    }
    expect(calls).toHaveLength(0);
  });

  it("ignores emails that aren't invitations (e.g. booking notifications) with 200", async () => {
    invitation = null;
    const res = await POST(signed(event("email.delivered", "re_booking")));
    expect(res.status).toBe(200);
    expect(patches()).toHaveLength(0);
  });
});

describe("beta sender", () => {
  afterEach(() => {
    delete process.env.BETA_EMAIL_FROM;
    delete process.env.EMAIL_FROM;
  });
  it("uses BETA_EMAIL_FROM, then EMAIL_FROM, then Evntly <hello@evntlyapp.com>", async () => {
    const { inviteSendingStatus } = await import("@/lib/founding/sending");
    expect(inviteSendingStatus().from).toBe("Evntly <hello@evntlyapp.com>");
    process.env.EMAIL_FROM = "Evntly Notifications <notifications@evntlyapp.com>";
    expect(inviteSendingStatus().from).toBe("Evntly Notifications <notifications@evntlyapp.com>");
    process.env.BETA_EMAIL_FROM = "Mohnish from Evntly <hello@evntlyapp.com>";
    expect(inviteSendingStatus().from).toBe("Mohnish from Evntly <hello@evntlyapp.com>");
    process.env.BETA_EMAIL_FROM = "   ";
    expect(inviteSendingStatus().from).toBe("Evntly Notifications <notifications@evntlyapp.com>");
  });
});
