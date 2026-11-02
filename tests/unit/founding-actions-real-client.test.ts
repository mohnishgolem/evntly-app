import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

// Founding-vendor actions through the REAL supabase-js and Resend clients,
// with only the network faked, so the tests see exactly what goes out.
type Call = { url: string; method: string; body: unknown; headers: Headers };
const calls: Call[] = [];
const respond = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let resendStatus = 200;
let cancelStatus = 200;
let prepareCount = 0;
let tableRows: Record<string, unknown[]> = {};
let prepareError: string | null = null;
const handler = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  let body: unknown = null;
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }
  calls.push({ url, method, body, headers: new Headers(init?.headers) });
  if (/https:\/\/api\.resend\.com\/emails\/[^/]+\/cancel/.test(url)) {
    return cancelStatus === 200 ? respond({ object: "email", id: url.split("/")[4] }) : respond({ name: "validation_error", message: "already sent" }, cancelStatus);
  }
  if (url.startsWith("https://api.resend.com/emails")) {
    return resendStatus === 200 ? respond({ id: `re_${calls.length}` }) : respond({ name: "rate_limit_exceeded", message: "Too many requests" }, resendStatus);
  }
  if (url.includes("/rpc/claim_founding_vendor_place")) return respond([{ application_id: "app-1", status: "started", invite: "attached", created: true }]);
  if (url.includes("/rpc/admin_prepare_beta_invitation")) {
    if (prepareError) return respond({ code: "P0001", message: prepareError }, 400);
    prepareCount++;
    return respond([{ invitation_id: prepareCount > 1 ? `inv-${prepareCount}` : "inv-1", email: "jane@photo.com.au", first_name: "Jane", unsubscribe_token: "c".repeat(64), expires_at: "2026-11-15T00:00:00Z", send_number: 1 }]);
  }
  if (url.includes("/rpc/admin_prepare_beta_reminder")) {
    if (prepareError) return respond({ code: "P0001", message: prepareError }, 400);
    return respond([{ invitation_id: "inv-9", email: "kai@dj.com.au", first_name: "Kai", unsubscribe_token: "e".repeat(64), expires_at: "2026-11-20T00:00:00Z", send_number: 2 }]);
  }
  if (url.includes("/rpc/")) return respond(null, 204);
  if (url.includes("/rest/v1/beta_program")) return respond({ batch_size_limit: 10 });
  const table = url.match(/\/rest\/v1\/([a-z_]+)/)?.[1];
  if (method === "GET" && table && table in tableRows) return respond(tableRows[table]);
  if (url.includes("/rest/v1/vendor_waitlist") && method === "GET") return respond(null);
  if (url.includes("/rest/v1/beta_applications") && method === "GET") return respond(null);
  return respond(null, 201);
};
const fakeFetch = vi.fn(handler);

const realClient = (key: string) =>
  createClient("https://example.supabase.co", key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch as unknown as typeof fetch },
  });
const userClient = realClient("anon-test-key");
let signedIn: { id: string; email: string } | null = { id: "22222222-2222-4222-8222-222222222222", email: "jane@photo.com.au" };
vi.spyOn(userClient.auth, "getUser").mockImplementation(async () => ({ data: { user: signedIn }, error: null }) as never);
const adminClient = realClient("service-role-test-key");

let adminSession: { admin: boolean; mfa: string } = { admin: true, mfa: "ok" };
let cookieSource: string | undefined;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => userClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: (name: string) => (name === "evntly_fv_src" && cookieSource ? { value: cookieSource } : undefined) }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  clientIp: vi.fn(async () => "1.2.3.4"),
  RATE_LIMIT_ERROR: "Too many attempts.",
}));
const notify = vi.fn();
vi.mock("@/lib/email", () => ({ notify: (...a: unknown[]) => notify(...a), sendEmail: vi.fn() }));
vi.mock("@/lib/data/user", () => ({
  getAdminSession: async () => ({
    ...adminSession,
    session: { user: { id: "admin-1", email: "mohnish@evntlyapp.com", user_metadata: { full_name: "Mohnish Golem" } } },
  }),
}));

const { claimFoundingPlace, joinVendorWaitlist, unsubscribeFromInvites } = await import("@/lib/actions/founding");
const { sendInvitations, sendReminders, sendDueReminders, sendTestInvitation, decideApplication, importWaitlist, scheduleInvitationCampaign, cancelScheduledSends } = await import(
  "@/lib/actions/admin-founding"
);

const rpc = (name: string) => calls.filter((c) => c.url.includes(`/rest/v1/rpc/${name}`));
const resendCalls = () => calls.filter((c) => c.url.startsWith("https://api.resend.com/emails"));
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const TOKEN = "A".repeat(43);

beforeEach(() => {
  calls.length = 0;
  notify.mockClear();
  signedIn = { id: "22222222-2222-4222-8222-222222222222", email: "jane@photo.com.au" };
  adminSession = { admin: true, mfa: "ok" };
  cookieSource = undefined;
  resendStatus = 200;
  prepareError = null;
  tableRows = {};
  cancelStatus = 200;
  prepareCount = 0;
  vi.stubGlobal("fetch", fakeFetch);
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "Evntly <hello@evntlyapp.com>";
  delete process.env.BETA_INVITES_LIVE;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("claimFoundingPlace", () => {
  it("needs a signed-in account", async () => {
    signedIn = null;
    expect((await claimFoundingPlace(null, form({})))?.error).toMatch(/Log in/);
    expect(rpc("claim_founding_vendor_place")).toHaveLength(0);
  });

  it("sends only the SHA-256 of the invite token, never the token", async () => {
    const res = await claimFoundingPlace(null, form({ invite: TOKEN, source: "waitlist_email" }));
    expect(res?.success).toBe(true);
    const [call] = rpc("claim_founding_vendor_place");
    expect(call.body).toEqual({ p_invite_token_hash: createHash("sha256").update(TOKEN).digest("hex"), p_source: "waitlist_email" });
    expect(JSON.stringify(calls)).not.toContain(TOKEN);
  });

  it("drops malformed tokens and unknown sources, falling back to the cookie", async () => {
    cookieSource = "instagram_dm";
    await claimFoundingPlace(null, form({ invite: "preview", source: "evil" }));
    expect(rpc("claim_founding_vendor_place")[0].body).toEqual({ p_source: "instagram_dm" });
  });
});

describe("joinVendorWaitlist", () => {
  it("requires the consent box", async () => {
    const res = await joinVendorWaitlist(null, form({ email: "a@b.com.au", firstName: "A" }));
    expect(res?.error).toMatch(/Tick the box/);
    expect(calls.filter((c) => c.url.includes("vendor_waitlist"))).toHaveLength(0);
  });

  it("silently accepts honeypot submissions without storing them", async () => {
    const res = await joinVendorWaitlist(null, form({ email: "a@b.com.au", firstName: "A", consent: "on", website: "spam" }));
    expect(res?.success).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("stores consent with a timestamp and where it came from", async () => {
    const res = await joinVendorWaitlist(null, form({ email: "New@Vendor.com.au", firstName: "Nia", category: "dj", consent: "on" }));
    expect(res?.success).toBe(true);
    const insert = calls.find((c) => c.url.includes("/rest/v1/vendor_waitlist") && c.method === "POST");
    expect(insert?.headers.get("apikey")).toBe("service-role-test-key");
    expect(insert?.body).toMatchObject({ email: "New@Vendor.com.au", invite_consent: true, source: "founding_page", category: "dj" });
    expect((insert?.body as { consent_at: string }).consent_at).toBeTruthy();
  });
});

describe("unsubscribe", () => {
  it("rejects malformed tokens without calling the database", async () => {
    expect((await unsubscribeFromInvites(null, form({ t: "nope" })))?.error).toBeTruthy();
    expect(rpc("beta_unsubscribe")).toHaveLength(0);
  });
  it("calls beta_unsubscribe with the token", async () => {
    const t = "d".repeat(64);
    expect((await unsubscribeFromInvites(null, form({ t })))?.success).toBe(true);
    expect(rpc("beta_unsubscribe")[0].body).toEqual({ p_token: t });
  });
});

describe("sendInvitations", () => {
  it("refuses non-admins and admins without MFA", async () => {
    adminSession = { admin: true, mfa: "needs-verify" };
    expect((await sendInvitations(["11111111-1111-4111-8111-111111111111"]))?.error).toMatch(/Not authorized/);
    adminSession = { admin: false, mfa: "n/a" };
    expect((await sendInvitations(["11111111-1111-4111-8111-111111111111"]))?.error).toMatch(/Not authorized/);
    expect(calls).toHaveLength(0);
  });

  it("sends nothing unless BETA_INVITES_LIVE=true", async () => {
    const res = await sendInvitations(["11111111-1111-4111-8111-111111111111"]);
    expect(res?.error).toMatch(/Live sending is switched off/);
    expect(calls).toHaveLength(0);
  });

  it("prepares, sends with an idempotency key + unsubscribe headers, then records", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    const res = await sendInvitations(["11111111-1111-4111-8111-111111111111"]);
    expect(res?.message).toBe("Sent 1 of 1 invitation.");
    const prep = rpc("admin_prepare_beta_invitation")[0];
    expect((prep.body as { p_token_hash: string }).p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    const [send] = resendCalls();
    expect(send.headers.get("Idempotency-Key")).toBe("beta-invite-inv-1-1");
    const payload = send.body as { to: string; subject: string; headers: Record<string, string>; html: string };
    expect(payload.to).toBe("jane@photo.com.au");
    expect(payload.subject).toBe("You're Invited to Join Evntly – Early Vendor Access");
    expect(payload.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    // The emailed link carries the raw token whose hash was stored.
    const token = payload.html.match(/invite=([A-Za-z0-9_-]{43})/)![1];
    expect(createHash("sha256").update(token).digest("hex")).toBe((prep.body as { p_token_hash: string }).p_token_hash);
    expect(rpc("admin_record_beta_invitation")[0].body).toMatchObject({ p_invitation_id: "inv-1", p_ok: true });
  });

  it("records a failure and stops the batch when Resend rate-limits", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    resendStatus = 429;
    const res = await sendInvitations(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
    expect(res?.message).toBe("Sent 0 of 2 invitations.");
    expect(resendCalls()).toHaveLength(1);
    expect(rpc("admin_record_beta_invitation")[0].body).toMatchObject({ p_ok: false });
  });

  it("skips contacts the database refuses (consent, unsubscribed, duplicates)", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    prepareError = "This contact unsubscribed.";
    const res = await sendInvitations(["11111111-1111-4111-8111-111111111111"]);
    expect(res?.details?.[0]).toMatch(/unsubscribed/);
    expect(resendCalls()).toHaveLength(0);
  });

  it("refuses batches bigger than the configured limit", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    const ids = Array.from({ length: 11 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`);
    expect((await sendInvitations(ids))?.error).toMatch(/limited to 10/);
    expect(resendCalls()).toHaveLength(0);
  });
});

describe("sendTestInvitation", () => {
  it("sends only to the signed-in admin, even with live sending off, with a dead preview link", async () => {
    const res = await sendTestInvitation();
    expect(res?.success).toBe(true);
    const [send] = resendCalls();
    const payload = send.body as { to: string; subject: string; html: string };
    expect(payload.to).toBe("mohnish@evntlyapp.com");
    expect(payload.subject).toMatch(/^\[TEST\]/);
    expect(payload.html).toContain("invite=preview");
    expect(rpc("admin_prepare_beta_invitation")).toHaveLength(0);
  });
});

describe("decideApplication", () => {
  it("goes through the capacity-checked RPC", async () => {
    await decideApplication("app-1", "needs_changes", "Add three photos");
    expect(rpc("admin_decide_founding_application")[0].body).toEqual({
      p_application_id: "app-1",
      p_decision: "needs_changes",
      p_note: "Add three photos",
    });
  });
});

describe("importWaitlist", () => {
  const csv =
    "email,first_name,business_name,category,invite_consent,consent_note\n" +
    "jane@photo.com.au,Jane,Jane Photo,photographer,yes,Tally form\n" +
    "tom@dj.com.au,Tom,Tom DJ,dj,no,\n" +
    "sam@decor.com.au,Sam,Sam Decor,decorator,yes,Tally form\n" +
    "x@site.test,X,,,yes,\n" +
    "jane@photo.com.au,Dup,,,yes,\n";
  const registeredSam = () => {
    tableRows = {
      vendor_waitlist: [],
      users: [{ id: "u-sam", email: "sam@decor.com.au" }],
      service_providers: [{ owner_user_id: "u-sam", is_demo: false }],
      beta_applications: [],
    };
  };

  it("Check file reports eligible and excluded rows and writes nothing", async () => {
    registeredSam();
    const res = await importWaitlist(null, form({ csv, mode: "check" }));
    expect(res?.message).toBe("Checked 4 rows. Nothing was imported.");
    expect(res?.report?.counts).toMatchObject({ eligible: 1, no_consent: 1, registered_vendor: 1, suppressed: 1 });
    expect(res?.report?.notes.join(" ")).toContain("appears twice");
    expect(res?.report?.notes.join(" ")).not.toMatch(/sam@|tom@/);
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("defaults to a check when no mode is given", async () => {
    registeredSam();
    await importWaitlist(null, form({ csv }));
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("Import skips registered vendors and undeliverable addresses", async () => {
    registeredSam();
    const res = await importWaitlist(null, form({ csv, mode: "import" }));
    const insert = calls.find((c) => c.method === "POST" && c.url.includes("/rest/v1/vendor_waitlist"));
    const emails = (insert?.body as { email: string }[]).map((r) => r.email);
    expect(emails).toEqual(["jane@photo.com.au", "tom@dj.com.au"]);
    expect((insert?.body as { invite_consent: boolean }[]).map((r) => r.invite_consent)).toEqual([true, false]);
    expect(res?.message).toContain("2 skipped");
  });

  it("refuses non-admins", async () => {
    adminSession = { admin: false, mfa: "n/a" };
    expect((await importWaitlist(null, form({ csv, mode: "check" })))?.error).toMatch(/Not authorized/);
    expect(calls).toHaveLength(0);
  });
});

describe("reminders", () => {
  it("send nothing unless BETA_INVITES_LIVE=true", async () => {
    expect((await sendReminders(["11111111-1111-4111-8111-111111111111"]))?.error).toMatch(/switched off/);
    expect(calls).toHaveLength(0);
  });

  it("use the reminder RPCs, the reminder template and their own idempotency key", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    const res = await sendReminders(["11111111-1111-4111-8111-111111111111"]);
    expect(res?.message).toBe("Sent 1 of 1 reminder.");
    expect(rpc("admin_prepare_beta_reminder")).toHaveLength(1);
    expect(rpc("admin_prepare_beta_invitation")).toHaveLength(0);
    const [send] = resendCalls();
    expect(send.headers.get("Idempotency-Key")).toBe("beta-reminder-inv-9-2");
    const payload = send.body as { subject: string; from: string; headers: Record<string, string>; text: string };
    expect(payload.subject).toBe("Following up on your Evntly invitation");
    expect(payload.from).toBe("Mohnish from Evntly <hello@evntlyapp.com>");
    expect(payload.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(rpc("admin_record_beta_reminder")[0].body).toMatchObject({ p_invitation_id: "inv-9", p_ok: true });
  });

  it("report the database's refusal (e.g. too soon) without emailing", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    prepareError = "Too soon: reminders go 3+ days after the invitation.";
    const res = await sendReminders(["11111111-1111-4111-8111-111111111111"]);
    expect(res?.details?.[0]).toMatch(/Too soon/);
    expect(resendCalls()).toHaveLength(0);
  });

  it("'Remind N due' only picks emailable contacts invited 3+ days ago", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    tableRows = {
      beta_invitations: [
        { waitlist_id: "11111111-1111-4111-8111-111111111111", delivery_status: "delivered" },
        { waitlist_id: "22222222-2222-4222-8222-222222222222", delivery_status: "bounced" },
        { waitlist_id: "33333333-3333-4333-8333-333333333333", delivery_status: "sent" },
      ],
      vendor_waitlist: [{ id: "11111111-1111-4111-8111-111111111111" }],
    };
    await sendDueReminders(5);
    const due = calls.find((c) => c.method === "GET" && c.url.includes("/rest/v1/beta_invitations"))!;
    expect(due.url).toContain("reminder_sent_at=is.null");
    expect(due.url).toMatch(/first_sent_at=lte\./);
    expect(rpc("admin_prepare_beta_reminder").map((c) => (c.body as { p_waitlist_id: string }).p_waitlist_id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("test reminder goes only to the admin", async () => {
    await sendTestInvitation("reminder");
    const [send] = resendCalls();
    const payload = send.body as { to: string; subject: string };
    expect(payload.to).toBe("mohnish@evntlyapp.com");
    expect(payload.subject).toBe("[TEST] Following up on your Evntly invitation");
  });
});

describe("scheduled campaign", () => {
  const contacts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}` }));
  const tomorrow = () => {
    const d = new Date(Date.now() + 2 * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  };

  it("needs live sending and an admin", async () => {
    tableRows = { vendor_waitlist: contacts(5), beta_invitations: [] };
    const res = await scheduleInvitationCampaign({ date: tomorrow(), time: "10:00", count: 5, batchSize: 10, intervalMinutes: 10 });
    expect(res?.error).toMatch(/switched off/);
    expect(calls).toHaveLength(0);
    adminSession = { admin: false, mfa: "n/a" };
    expect((await scheduleInvitationCampaign({ date: tomorrow(), time: "10:00", count: 5, batchSize: 10, intervalMinutes: 10 }))?.error).toMatch(/Not authorized/);
  });

  it("books each batch with Resend at its Sydney time and records the scheduled time", { timeout: 20_000 }, async () => {
    process.env.BETA_INVITES_LIVE = "true";
    tableRows = { vendor_waitlist: contacts(12), beta_invitations: [] };
    const date = tomorrow();
    const res = await scheduleInvitationCampaign({ date, time: "10:00", count: 12, batchSize: 10, intervalMinutes: 10 });
    expect(res?.message).toBe("Scheduled 12 of 12 invitations in 2 batches.");
    const sends = resendCalls().map((c) => c.body as { scheduledAt?: string; scheduled_at?: string });
    const times = sends.map((b) => b.scheduledAt ?? b.scheduled_at);
    const { sydneyToUtc } = await import("@/lib/founding/schedule");
    const t0 = sydneyToUtc(date, "10:00")!.toISOString();
    const t1 = sydneyToUtc(date, "10:10")!.toISOString();
    expect(times).toEqual([...Array(10).fill(t0), t1, t1]);
    const keys = resendCalls().map((c) => c.headers.get("Idempotency-Key"));
    expect(new Set(keys).size).toBe(12);
    expect(rpc("admin_record_beta_invitation").map((c) => (c.body as { p_scheduled_for: string }).p_scheduled_for)).toEqual(times);
  });

  it("refuses a time in the past or less than 5 minutes away", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    tableRows = { vendor_waitlist: contacts(3), beta_invitations: [] };
    const res = await scheduleInvitationCampaign({ date: "2026-01-01", time: "10:00", count: 3, batchSize: 10, intervalMinutes: 10 });
    expect(res?.error).toMatch(/5 minutes/);
    expect(resendCalls()).toHaveLength(0);
  });

  it("skips contacts already invited or booked", async () => {
    process.env.BETA_INVITES_LIVE = "true";
    tableRows = {
      vendor_waitlist: contacts(3),
      beta_invitations: [{ waitlist_id: contacts(3)[0].id, status: "sent" }, { waitlist_id: contacts(3)[1].id, status: "failed" }],
    };
    await scheduleInvitationCampaign({ date: tomorrow(), time: "10:00", count: 10, batchSize: 10, intervalMinutes: 10 });
    expect(rpc("admin_prepare_beta_invitation").map((c) => (c.body as { p_waitlist_id: string }).p_waitlist_id)).toEqual([contacts(3)[1].id, contacts(3)[2].id]);
  });

  it("cancels with Resend first, then frees the contact; leaves it alone if Resend refuses", async () => {
    tableRows = { beta_invitations: [{ id: "inv-a", resend_email_id: "re_a", scheduled_for: "2099-01-01T00:00:00Z", waitlist_id: "w1" }] };
    let res = await cancelScheduledSends();
    expect(calls.some((c) => c.url === "https://api.resend.com/emails/re_a/cancel")).toBe(true);
    expect(rpc("admin_cancel_beta_send")[0].body).toEqual({ p_invitation_id: "inv-a" });
    expect(res?.message).toBe("Cancelled 1 of 1 scheduled email.");

    calls.length = 0;
    cancelStatus = 422;
    res = await cancelScheduledSends();
    expect(rpc("admin_cancel_beta_send")).toHaveLength(0);
    expect(res?.details?.[0]).toMatch(/may still send/);
  });
});
