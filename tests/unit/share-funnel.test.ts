import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { preparedSource, shareFromNext } from "@/lib/share-profile";

// Share funnel rows are written with the REAL service-role supabase-js client;
// only the network is faked, so the tests see exactly what PostgREST receives.
const calls: { method: string; url: string; body: unknown }[] = [];
let reply: { status: number; body: unknown } = { status: 201, body: [] };
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    createClient("https://example.supabase.co", "service-role-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fakeFetch as unknown as typeof fetch },
    }),
}));

const { recordShareAccount, recordSharePrepared } = await import("@/lib/share-funnel");
const VENDOR = "d5984a9a-70dc-4e42-a1ce-dcdd2022d1d7";
const USER = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  calls.length = 0;
  reply = { status: 201, body: [] };
});

describe("shareFromNext", () => {
  it("reads the share from a quote return path", () => {
    expect(shareFromNext(`/vendor/${VENDOR}?book=1&src=share_story`)).toEqual({ vendorId: VENDOR, source: "share_story" });
    expect(shareFromNext(`/vendor/${VENDOR}?src=share_link&book=1`)).toEqual({ vendorId: VENDOR, source: "share_link" });
  });
  it("ignores everything else", () => {
    for (const n of [null, "", "/dashboard", `/vendor/${VENDOR}?book=1`, `/vendor/${VENDOR}?src=meta_ads`, `//evil.com/vendor/${VENDOR}?src=share_qr`, `https://evil.com/vendor/${VENDOR}?src=share_qr`]) {
      expect(shareFromNext(n)).toBeNull();
    }
  });
});

describe("preparedSource", () => {
  it("credits each action to the link it hands out", () => {
    expect(preparedSource("story_save")).toBe("share_story");
    expect(preparedSource("story_copy")).toBe("share_story");
    expect(preparedSource("card_copy")).toBe("share_link");
    expect(preparedSource("card_share")).toBe("share_link");
    expect(preparedSource("card_save")).toBe("share_qr");
  });
});

describe("recording", () => {
  it("writes one account row per share sign-up", async () => {
    await recordShareAccount(USER, `/vendor/${VENDOR}?book=1&src=share_qr`, "email");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://example.supabase.co/rest/v1/share_funnel_events");
    expect(calls[0].body).toEqual({ event: "account_created", source: "share_qr", vendor_id: VENDOR, user_id: USER, detail: "email" });
  });

  it("writes nothing for sign-ups that didn't come from a share", async () => {
    await recordShareAccount(USER, "/dashboard", "email");
    await recordShareAccount(USER, undefined, "google");
    expect(calls).toHaveLength(0);
  });

  it("never throws, including when the account was already counted", async () => {
    reply = { status: 409, body: { code: "23505", message: "duplicate key value violates unique constraint" } };
    await expect(recordShareAccount(USER, `/vendor/${VENDOR}?src=share_link`, "google")).resolves.toBeUndefined();
    reply = { status: 500, body: { message: "boom" } };
    await expect(recordSharePrepared(USER, VENDOR, "card_save")).resolves.toBeUndefined();
  });

  it("records a prepared share against its channel", async () => {
    await recordSharePrepared(USER, VENDOR, "story_copy");
    expect(calls[0].body).toEqual({ event: "prepared", source: "share_story", vendor_id: VENDOR, user_id: USER, detail: "story_copy" });
  });
});
