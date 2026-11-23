import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

// A quote request sent from a vendor page reached through that vendor's Share
// profile link or QR code carries the share source (quote_requests.share_source).

let current: ReturnType<typeof fakeSupabase>;
let cookieValue: string | undefined;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("@/lib/supabase/admin", () => ({ quoteParticipantEmail: vi.fn(async () => null) }));
vi.mock("@/lib/email", () => ({ notify: vi.fn(), formatEventDate: (d: string) => d, formatAmount: (n: number) => `$${n}` }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "evntly_share_src" && cookieValue ? { name, value: cookieValue } : undefined) }),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), RATE_LIMIT_ERROR: "Too many attempts." }));

const { requestQuote } = await import("@/lib/actions/quotes");

const draft = { eventDate: "2099-03-14", eventType: "Birthday", location: "Parramatta", estimatedGuests: 60, budgetRange: "1000-2000" };
const setup = (insert: { data: unknown; error?: unknown } = { data: { id: "q1", service_type: "dj" } }) => {
  current = fakeSupabase({
    user: { id: "u1", email: "u1@example.invalid" },
    results: { service_providers: { data: { is_demo: false } }, "quote_requests:insert": insert },
  });
};
const inserts = () => current.writes.filter((w) => w.table === "quote_requests" && w.op === "insert").map((w) => w.payload);

describe("share attribution on quote requests", () => {
  beforeEach(() => {
    cookieValue = undefined;
  });

  it("stores the share source from this vendor page's cookie", async () => {
    cookieValue = "share_qr";
    setup();
    expect(await requestQuote("v1", draft)).toEqual({ success: true, quoteId: "q1" });
    expect(inserts()[0]).toMatchObject({ vendor_id: "v1", origin: "vendor_profile", share_source: "share_qr" });
  });

  it("ignores unknown values and requests from other flows", async () => {
    cookieValue = "admin";
    setup();
    await requestQuote("v1", draft);
    expect(inserts()[0]).not.toHaveProperty("share_source");

    cookieValue = "share_link";
    setup();
    await requestQuote("v1", draft, "e1", { origin: "smart_match" });
    expect(inserts()[0]).not.toHaveProperty("share_source");
  });

  it("retries without the column if the migration isn't applied yet", async () => {
    cookieValue = "share_story";
    setup({ data: null, error: { code: "PGRST204", message: "Could not find the 'share_source' column of 'quote_requests' in the schema cache" } });
    await requestQuote("v1", draft);
    expect(inserts()).toHaveLength(2);
    expect(inserts()[1]).not.toHaveProperty("share_source");
  });
});
