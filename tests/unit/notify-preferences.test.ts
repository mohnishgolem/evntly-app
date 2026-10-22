import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { fakeSupabase } from "./fake-supabase";

// notify() looks up the RECIPIENT's preferences with the real service-role
// supabase-js client (network faked), then decides per channel.
let prefsRow: unknown = null;
const calls: string[] = [];
const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  calls.push(url);
  const body = url.includes("/users?") ? { id: "u-vendor" } : url.includes("/notification_preferences?") ? prefsRow : null;
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
});

const sent: string[] = [];
const pushed: string[] = [];
const pending: Promise<unknown>[] = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<unknown>) => pending.push(fn()) }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(async (m: { subject: string }) => (sent.push(m.subject), { error: null })) };
  },
}));
vi.mock("@/lib/push", () => ({ sendPushToUser: vi.fn(async (_id: string, p: { title: string }) => void pushed.push(p.title)) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    createClient("https://example.supabase.co", "service-role-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fakeFetch as unknown as typeof fetch },
    }),
}));
let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

process.env.RESEND_API_KEY = "re_test";
process.env.EMAIL_FROM = "Evntly <test@example.com>";
const { notify } = await import("@/lib/email");
const { saveNotificationPreferences } = await import("@/lib/actions/notification-prefs");

const base = { to: "vendor@realdomain.com.au", heading: "H", lines: ["L"], cta: { label: "Go", path: "/x" } };
async function run(category: "enquiries" | "bookings" | "reminders", subject: string) {
  notify({ ...base, category, subject });
  await Promise.all(pending.splice(0));
}

describe("notify() follows the recipient's preferences", () => {
  beforeEach(() => {
    sent.length = 0;
    pushed.length = 0;
    calls.length = 0;
  });

  it("sends both channels when there's no preference row", async () => {
    prefsRow = null;
    await run("enquiries", "New request");
    expect(sent).toEqual(["New request"]);
    expect(pushed).toEqual(["H"]);
    expect(calls[0]).toContain("/rest/v1/users?select=id&email=ilike.vendor%40realdomain.com.au");
    expect(calls[1]).toContain("/rest/v1/notification_preferences?select=prefs&user_id=eq.u-vendor");
  });

  it("skips a switched-off channel only", async () => {
    prefsRow = { prefs: { email: { reminders: false }, push: { enquiries: false } } };
    await run("reminders", "Reminder");
    await run("enquiries", "Request");
    expect(sent).toEqual(["Request"]);
    expect(pushed).toEqual(["H"]); // reminder push still on; enquiry push off
  });

  it("always emails about bookings, even if switched off", async () => {
    prefsRow = { prefs: { email: { bookings: false }, push: { bookings: false } } };
    await run("bookings", "Booking confirmed");
    expect(sent).toEqual(["Booking confirmed"]);
    expect(pushed).toEqual([]);
  });

  it("falls back to sending if the lookup fails", async () => {
    fakeFetch.mockImplementationOnce(async () => {
      throw new Error("network down");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await run("enquiries", "Still sent");
    expect(sent).toEqual(["Still sent"]);
    err.mockRestore();
  });
});

describe("saveNotificationPreferences", () => {
  const all = (v: boolean) => ({ enquiries: v, quotes: v, bookings: v, messages: v, reminders: v });

  it("refuses logged-out callers and malformed input", async () => {
    current = fakeSupabase({ user: null });
    expect(await saveNotificationPreferences({ email: all(true), push: all(true) })).toEqual({ error: "Not logged in." });
    current = fakeSupabase({ user: { id: "u1", email: "u1@example.invalid" } });
    // @ts-expect-error — tampered request
    expect(await saveNotificationPreferences({ email: { ...all(true), extra: true }, push: all(true) })).toEqual({ error: "Check your notification settings." });
    expect(current.writes).toHaveLength(0);
  });

  it("saves the caller's own row with booking emails forced on", async () => {
    current = fakeSupabase({ user: { id: "u1", email: "u1@example.invalid" } });
    expect(await saveNotificationPreferences({ email: all(false), push: all(false) })).toEqual({ success: true });
    expect(current.writes[0]).toMatchObject({
      table: "notification_preferences",
      op: "upsert",
      payload: { user_id: "u1", prefs: { email: { ...all(false), bookings: true }, push: all(false) } },
    });
  });
});
