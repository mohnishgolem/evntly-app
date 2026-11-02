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
let failWrites = false;
let failLookup = false;

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  calls.push({ url, method, body });
  const error = (status: number) =>
    new Response(JSON.stringify({ code: "XX000", message: "boom", details: null, hint: null }), { status, headers: { "Content-Type": "application/json" } });
  if (url.includes("/rest/v1/beta_invitations") && method === "GET") {
    if (failLookup) return error(500);
    return new Response(invitation ? JSON.stringify(invitation) : "null", { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (failWrites && method === "PATCH") return error(500);
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

const logs: { level: string; line: string }[] = [];
for (const level of ["info", "warn", "error"] as const) {
  vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
    logs.push({ level, line: args.map(String).join(" ") });
  });
}
const lastLog = () => {
  const line = logs.at(-1)?.line ?? "";
  return JSON.parse(line.replace(/^\[resend-webhook\] /, "")) as Record<string, unknown>;
};

beforeEach(() => {
  calls.length = 0;
  logs.length = 0;
  failWrites = false;
  failLookup = false;
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
    ["email.sent", null, { delivery_status: "sent" }],
    ["email.delivered", "sent", { delivery_status: "delivered" }],
    ["email.delivery_delayed", "sent", { delivery_status: "delivery_delayed" }],
    ["email.bounced", "delivered", { delivery_status: "bounced" }],
    ["email.complained", "delivered", { delivery_status: "complained" }],
  ])("%s → records it (200)", async (type, current: string | null, expected) => {
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
  it("is 'Mohnish from Evntly' at the existing verified address, unless BETA_EMAIL_FROM overrides it", async () => {
    const { inviteSendingStatus, senderAddress } = await import("@/lib/founding/sending");
    expect(inviteSendingStatus().from).toBe("Mohnish from Evntly <hello@evntlyapp.com>");
    process.env.EMAIL_FROM = "Evntly <notifications@evntlyapp.com>";
    expect(inviteSendingStatus().from).toBe("Mohnish from Evntly <notifications@evntlyapp.com>");
    process.env.EMAIL_FROM = "notifications@evntlyapp.com";
    expect(inviteSendingStatus().from).toBe("Mohnish from Evntly <notifications@evntlyapp.com>");
    process.env.BETA_EMAIL_FROM = "Mohnish Golem <mohnish@evntlyapp.com>";
    expect(inviteSendingStatus().from).toBe("Mohnish Golem <mohnish@evntlyapp.com>");
    process.env.BETA_EMAIL_FROM = "   ";
    expect(inviteSendingStatus().from).toBe("Mohnish from Evntly <notifications@evntlyapp.com>");
    expect(senderAddress("Evntly <a@b.com>")).toBe("a@b.com");
    expect(senderAddress("garbage")).toBeNull();
  });
});

describe("monitoring log", () => {
  it("logs one line per accepted event: type, status, matched and outcome", async () => {
    invitation!.delivery_status = "sent";
    await POST(signed(event("email.delivered")));
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("info");
    expect(lastLog()).toEqual({ status: 200, outcome: "updated", type: "email.delivered", matched: true });
  });

  it("logs rejected signatures as warnings, without trusting the unsigned event type", async () => {
    const res = await POST(signed(event("email.delivered"), { secret: Buffer.from("wrong") }));
    expect(res.status).toBe(400);
    expect(logs[0].level).toBe("warn");
    expect(lastLog()).toEqual({ status: 400, outcome: "invalid_signature" });
  });

  it("logs unmatched and ignored events as 200", async () => {
    invitation = null;
    await POST(signed(event("email.delivered", "re_booking")));
    expect(lastLog()).toEqual({ status: 200, outcome: "unmatched", type: "email.delivered", matched: false });
    await POST(signed(event("contact.created")));
    expect(lastLog()).toEqual({ status: 200, outcome: "ignored", type: "contact.created" });
  });

  it("logs a missing secret as a 503 error (a misconfiguration worth an alert)", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    await POST(signed(event("email.delivered")));
    expect(logs[0].level).toBe("error");
    expect(lastLog()).toEqual({ status: 503, outcome: "not_configured" });
  });

  it("never logs addresses, ids, the secret, headers or the payload", async () => {
    invitation!.delivery_status = "sent";
    const pii = {
      type: "email.bounced",
      created_at: "2026-11-01T00:00:00Z",
      data: { email_id: "re_secretid123", to: ["jane.vendor@example.com"], from: "Mohnish <hello@evntlyapp.com>", subject: "You're Invited" },
    };
    await POST(signed(pii));
    await POST(signed(pii, { secret: Buffer.from("wrong") }));
    invitation = null;
    await POST(signed(pii));
    await POST(signed({ type: "jane.vendor@example.com", data: { email_id: "re_x" } }));
    const all = logs.map((l) => l.line).join("\n");
    for (const forbidden of ["jane.vendor", "@example.com", "hello@evntlyapp.com", "re_secretid123", "re_x", "msg_test_1", "You're Invited", SECRET, secretBytes.toString("base64"), "svix", "whsec_"]) {
      expect(all).not.toContain(forbidden);
    }
    expect(logs).toHaveLength(4);
  });
});

describe("duplicate deliveries", () => {
  it("a retried delivery of the same event is a no-op the second time", async () => {
    invitation!.delivery_status = "sent";
    const first = await POST(signed(event("email.delivered")));
    expect(first.status).toBe(200);
    expect(patches()).toHaveLength(1);
    // The database now holds what the first delivery wrote.
    invitation!.delivery_status = "delivered";
    calls.length = 0;
    const retry = await POST(signed(event("email.delivered")));
    expect(retry.status).toBe(200);
    expect(patches()).toHaveLength(0);
    expect(lastLog()).toMatchObject({ outcome: "duplicate", matched: true });
  });

  it("a repeated bounce doesn't rewrite the invitation or re-run the unsubscribe", async () => {
    invitation!.delivery_status = "bounced";
    const res = await POST(signed(event("email.bounced")));
    expect(res.status).toBe(200);
    expect(patches()).toHaveLength(0);
    expect(lastLog()).toMatchObject({ outcome: "duplicate" });
  });

  it("repeated opens and clicks keep the first timestamp", async () => {
    invitation!.opened_at = "2026-11-01T00:00:00Z";
    invitation!.clicked_at = "2026-11-01T00:00:00Z";
    await POST(signed(event("email.opened")));
    await POST(signed(event("email.clicked")));
    expect(patches()).toHaveLength(0);
    expect(logs.map((l) => JSON.parse(l.line.replace(/^\[resend-webhook\] /, "")).outcome)).toEqual(["duplicate", "duplicate"]);
  });

  it("a late, earlier-stage event is kept out and logged as kept", async () => {
    invitation!.delivery_status = "complained";
    await POST(signed(event("email.delivered")));
    expect(patches()).toHaveLength(0);
    expect(lastLog()).toMatchObject({ outcome: "kept", type: "email.delivered" });
  });
});

describe("database errors", () => {
  it("returns 500 (so Resend retries) when the update fails", async () => {
    failWrites = true;
    invitation!.delivery_status = "sent";
    const res = await POST(signed(event("email.delivered")));
    expect(res.status).toBe(500);
    expect(logs[0].level).toBe("error");
    expect(lastLog()).toEqual({ status: 500, outcome: "db_error", type: "email.delivered", matched: true });
  });

  it("returns 500 when the unsubscribe after a bounce fails", async () => {
    failWrites = true;
    const res = await POST(signed(event("email.bounced")));
    expect(res.status).toBe(500);
  });

  it("returns 500 when the invitation lookup fails, instead of treating it as unmatched", async () => {
    failLookup = true;
    const res = await POST(signed(event("email.delivered")));
    expect(res.status).toBe(500);
    expect(lastLog()).toEqual({ status: 500, outcome: "db_error", type: "email.delivered" });
  });
});
