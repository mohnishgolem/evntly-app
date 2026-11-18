import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { completionSteps, dueReminder, isListingComplete, pickListingReminders } from "@/lib/listing-completion";

// R1–R5: finishing a listing. The actions run through the REAL supabase-js
// client; only the network is faked (a mocked client hid a prod outage once).

type Call = { method: string; url: string; body: unknown };
const calls: Call[] = [];
let rpcResponse: { status: number; body: unknown } = { status: 200, body: "pending_review" };
let insertResponse: { status: number; body: unknown } = { status: 201, body: null };

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
  const json = (data: unknown, status = 200) =>
    new Response(data === null ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  if (url.includes("rpc/submit_listing_for_review")) return json(rpcResponse.body, rpcResponse.status);
  if (url.includes("/listing_setup_requests") && method === "POST") return json(insertResponse.body, insertResponse.status);
  return json([]);
});

const client = createClient("https://example.supabase.co", "anon-test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});
vi.spyOn(client.auth, "getUser").mockResolvedValue({
  data: { user: { id: "user-1", email: "vendor@example.com" } },
  error: null,
} as never);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
const recordFunnelEvent = vi.fn();
vi.mock("@/lib/funnel-events", () => ({ recordFunnelEvent }));
const emailApplicationReceived = vi.fn();
const emailAdmins = vi.fn();
vi.mock("@/lib/founding/notify", () => ({ emailApplicationReceived, emailAdmins }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { submitListingForReview, requestListingSetup } = await import("@/lib/actions/listing-completion");

async function run<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    return { redirected: String((e as Error).message) };
  }
}

beforeEach(() => {
  calls.length = 0;
  recordFunnelEvent.mockClear();
  emailApplicationReceived.mockClear();
  emailAdmins.mockClear();
  rpcResponse = { status: 200, body: "pending_review" };
  insertResponse = { status: 201, body: null };
});

describe("completion rules", () => {
  it("needs 3 photos and 1 active package", () => {
    expect(isListingComplete({ photos: 3, packages: 1 })).toBe(true);
    expect(isListingComplete({ photos: 2, packages: 5 })).toBe(false);
    expect(isListingComplete({ photos: 10, packages: 0 })).toBe(false);
  });

  it("builds the checklist from real counts", () => {
    const steps = completionSteps({ photos: 1, packages: 0, status: "draft" });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ["details", true],
      ["photos", false],
      ["packages", false],
      ["submit", false],
    ]);
    expect(steps[1].detail).toBe("1 of 3 added");
    expect(completionSteps({ photos: 4, packages: 2, status: "pending_review" }).every((s) => s.done)).toBe(true);
  });
});

describe("reminder schedule", () => {
  it("sends nothing before 24 hours or after 14 days", () => {
    expect(dueReminder(23.9, [])).toBeNull();
    expect(dueReminder(14 * 24 + 1, [])).toBeNull();
  });

  it("sends the 24 h reminder, then the 72 h one, each once", () => {
    expect(dueReminder(25, [])).toBe("24h");
    expect(dueReminder(30, ["24h"])).toBeNull();
    expect(dueReminder(73, ["24h"])).toBe("72h");
    expect(dueReminder(90, ["24h", "72h"])).toBeNull();
  });

  it("skips a missed 24 h reminder rather than sending it late", () => {
    expect(dueReminder(80, [])).toBe("72h");
    expect(dueReminder(80, ["72h"])).toBeNull();
  });

  it("picks only incomplete drafts that are due", () => {
    const now = new Date("2026-11-25T00:00:00Z");
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
    const due = pickListingReminders(
      [
        { id: "a", name: "A", owner_user_id: "u-a", created_at: hoursAgo(30) }, // 24h due
        { id: "b", name: "B", owner_user_id: "u-b", created_at: hoursAgo(30) }, // complete: skip
        { id: "c", name: "C", owner_user_id: "u-c", created_at: hoursAgo(10) }, // too early
        { id: "d", name: "D", owner_user_id: "u-d", created_at: hoursAgo(75) }, // 72h due
        { id: "e", name: "E", owner_user_id: "u-e", created_at: hoursAgo(30) }, // already sent
      ],
      {
        photos: [{ provider_id: "a" }, { provider_id: "b" }, { provider_id: "b" }, { provider_id: "b" }],
        packages: [{ provider_id: "b" }],
        sent: [{ provider_id: "e", kind: "24h" }, { provider_id: "d", kind: "24h" }],
      },
      now,
    );
    expect(due).toEqual([
      { providerId: "a", name: "A", ownerUserId: "u-a", kind: "24h", photos: 1, packages: 0 },
      { providerId: "d", name: "D", ownerUserId: "u-d", kind: "72h", photos: 0, packages: 0 },
    ]);
  });
});

describe("submitListingForReview", () => {
  it("sends a complete draft to review, records the funnel event and tells admins", async () => {
    const res = await run(() => submitListingForReview("sp-1"));
    expect(res).toEqual({ redirected: "REDIRECT:/vendor-dashboard/finish" });
    const rpc = calls.find((c) => c.url.includes("rpc/submit_listing_for_review"));
    expect(rpc?.method).toBe("POST");
    expect(rpc?.body).toEqual({ p_provider_id: "sp-1" });
    expect(recordFunnelEvent).toHaveBeenCalledWith("listing_submitted");
    expect(emailAdmins).toHaveBeenCalledTimes(1);
    expect(emailAdmins.mock.calls[0][2]).toEqual({ label: "Review approvals", path: "/admin/approvals" });
    expect(emailApplicationReceived).not.toHaveBeenCalled();
  });

  it("sends founding applicants back to their application", async () => {
    rpcResponse = { status: 200, body: "founding_submitted" };
    const res = await run(() => submitListingForReview("sp-1"));
    expect(res).toEqual({ redirected: "REDIRECT:/founding-vendors/claim" });
    expect(emailApplicationReceived).toHaveBeenCalledWith("vendor@example.com");
    expect(recordFunnelEvent).toHaveBeenCalledWith("listing_submitted");
  });

  it("shows the database's reason when the listing is incomplete, and sends nothing", async () => {
    rpcResponse = {
      status: 400,
      body: { code: "P0001", message: "Add at least 3 photos of your work first (you have 1).", details: null, hint: null },
    };
    const res = await run(() => submitListingForReview("sp-1"));
    expect(res).toEqual({ error: "Add at least 3 photos of your work first (you have 1)." });
    expect(recordFunnelEvent).not.toHaveBeenCalled();
    expect(emailAdmins).not.toHaveBeenCalled();
  });

  it("hides unexpected database errors", async () => {
    rpcResponse = { status: 500, body: { code: "XX000", message: "internal detail", details: null, hint: null } };
    expect(await run(() => submitListingForReview("sp-1"))).toEqual({ error: "Something went wrong. Please try again." });
  });
});

describe("requestListingSetup (done-with-you)", () => {
  const valid = { services: "Birthday package 3 hours $650", photoLinks: "instagram.com/example", permission: true as const };

  it("needs the photo permission box", async () => {
    const res = await requestListingSetup("sp-1", { ...valid, permission: false as unknown as true });
    expect(res).toEqual({ error: "Please confirm we may use these photos on your listing." });
    expect(calls).toHaveLength(0);
  });

  it("saves the request and tells admins", async () => {
    expect(await requestListingSetup("sp-1", valid)).toEqual({ success: true });
    const insert = calls.find((c) => c.method === "POST" && c.url.includes("/listing_setup_requests"));
    expect(insert?.body).toEqual({
      provider_id: "sp-1",
      user_id: "user-1",
      services: "Birthday package 3 hours $650",
      photo_links: "instagram.com/example",
      photo_permission: true,
    });
    expect(emailAdmins.mock.calls[0][2]).toEqual({ label: "Open setup requests", path: "/admin/setup-requests" });
  });

  it("explains a duplicate open request", async () => {
    insertResponse = { status: 409, body: { code: "23505", message: "duplicate key", details: null, hint: null } };
    const res = await requestListingSetup("sp-1", valid);
    expect(res?.error).toMatch(/already have your request/);
    expect(emailAdmins).not.toHaveBeenCalled();
  });
});
