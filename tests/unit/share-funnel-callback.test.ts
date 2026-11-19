import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

// Google/Apple sign-up from a shared profile: a brand-new customer account is
// attributed to the share, and lands back on the vendor's quote flow.
const VENDOR = "d5984a9a-70dc-4e42-a1ce-dcdd2022d1d7";
const NEXT = `/vendor/${VENDOR}?book=1&src=share_story`;

let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    ...current.client,
    auth: { ...current.client.auth, exchangeCodeForSession: vi.fn(async () => ({ error: null })) },
  }),
}));
vi.mock("@/lib/funnel-events", () => ({ recordFunnelEvent: vi.fn() }));
vi.mock("@/lib/meta-capi", () => ({ recordVendorRegistration: vi.fn() }));
const shareAccounts: unknown[][] = [];
vi.mock("@/lib/share-funnel", () => ({ recordShareAccount: vi.fn(async (...a: unknown[]) => void shareAccounts.push(a)) }));

const { GET } = await import("@/app/auth/callback/route");
const callback = (query: string) => GET(new Request(`https://evntly.example/auth/callback?code=abc&${query}`));
const asUser = (createdAt: string, meta: Record<string, unknown> = {}) =>
  fakeSupabase({ user: { id: "u-new", email: "c@example.invalid", user_metadata: meta, created_at: createdAt, app_metadata: { provider: "google" } } as never });

beforeEach(() => {
  shareAccounts.length = 0;
});

describe("OAuth callback from a shared profile", () => {
  it("attributes a brand-new customer and returns them to the quote flow", async () => {
    current = asUser(new Date().toISOString());
    const res = await callback(`next=${encodeURIComponent(NEXT)}`);
    expect(res.headers.get("location")).toBe(`https://evntly.example${NEXT}`);
    expect(shareAccounts).toEqual([["u-new", NEXT, "google"]]);
  });

  it("doesn't count returning customers signing in", async () => {
    current = asUser("2026-01-01T00:00:00Z");
    await callback(`next=${encodeURIComponent(NEXT)}`);
    expect(shareAccounts).toEqual([]);
  });

  it("leaves email-confirmation links to the sign-up step (already counted there)", async () => {
    current = asUser(new Date().toISOString());
    await callback(`flow=signup&next=${encodeURIComponent(NEXT)}`);
    expect(shareAccounts).toEqual([]);
  });
});
