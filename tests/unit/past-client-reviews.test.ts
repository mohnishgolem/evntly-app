import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";
import {
  friendlyReviewError,
  isReviewReturn,
  pastClientReviewUrl,
  reviewerDisplayName,
  reviewRequestMessage,
} from "@/lib/past-client-reviews";

const V = "d8d7ce72-ad39-4b92-a647-509b7640cb98";

describe("past-client review helpers", () => {
  it("shows first name and last initial only", () => {
    expect(reviewerDisplayName("sarah jane kelly")).toBe("Sarah K.");
    expect(reviewerDisplayName("Ana")).toBe("Ana");
    expect(reviewerDisplayName("  ")).toBe("Past client");
    expect(reviewerDisplayName(null)).toBe("Past client");
  });

  it("links to the vendor's review page and recognises the sign-up return", () => {
    expect(pastClientReviewUrl(V)).toBe(`https://evntlyapp.com/vendor/${V}/review`);
    expect(isReviewReturn(`/vendor/${V}/review`)).toBe(true);
    expect(isReviewReturn(`/vendor/${V}?book=1`)).toBe(false);
    expect(isReviewReturn(`/vendor/${V}/review/../../admin`)).toBe(false);
    expect(reviewRequestMessage("Sara Louise Photography", V)).toContain(`/vendor/${V}/review`);
  });

  it("turns database refusals into plain words", () => {
    expect(friendlyReviewError("You can't review your own business")).toMatch(/your own business/);
    expect(friendlyReviewError('duplicate key value violates unique constraint "reviews_past_client_once"')).toMatch(/already reviewed/);
    expect(friendlyReviewError("Verify your email before posting a review")).toMatch(/Verify your email/);
    expect(friendlyReviewError("anything else")).toMatch(/Something went wrong/);
  });
});

// The post action: what reaches the database, and what's refused first.
let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("@/lib/email", () => ({ notify: vi.fn(), sendEmail: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/user", () => ({ getAdminSession: vi.fn(async () => ({ admin: false, mfa: "n/a" })) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), RATE_LIMIT_ERROR: "Too many attempts." }));

const { submitPastClientReview, setReviewHidden } = await import("@/lib/actions/reviews");
const good = { rating: 5, comment: "Captured our day beautifully and was so easy to work with.", eventType: "Wedding" as const, confirmed: true as const };
const setup = (opts: { user?: boolean; vendor?: unknown; insert?: { data: unknown; error?: unknown } } = {}) => {
  current = fakeSupabase({
    user: opts.user === false ? null : { id: "u1", email: "client@example.invalid", user_metadata: { full_name: "Mia van der Berg" } },
    results: {
      service_providers: { data: opts.vendor === undefined ? { id: V, name: "Sara Louise Photography", status: "approved", is_demo: false } : opts.vendor },
      "reviews:insert": opts.insert ?? { data: null },
    },
  });
};
const inserts = () => current.writes.filter((w) => w.table === "reviews" && w.op === "insert").map((w) => w.payload);

describe("submitPastClientReview", () => {
  beforeEach(() => setup());

  it("posts a labelled review under first name + initial", async () => {
    expect(await submitPastClientReview(V, good)).toEqual({ success: true });
    expect(inserts()[0]).toEqual({
      provider_id: V,
      reviewer_email: "client@example.invalid",
      reviewer_user_id: "u1",
      reviewer_name: "Mia B.",
      rating: 5,
      comment: good.comment,
      event_type: "Wedding",
      source: "past_client",
    });
  });

  it("needs an account, a confirmation, a real comment and a live vendor", async () => {
    setup({ user: false });
    expect((await submitPastClientReview(V, good))?.error).toMatch(/account/);
    setup();
    expect((await submitPastClientReview(V, { ...good, confirmed: false as unknown as true }))?.error).toMatch(/hired this vendor yourself/);
    expect((await submitPastClientReview(V, { ...good, comment: "Great!" }))?.error).toMatch(/at least 20/);
    expect((await submitPastClientReview(V, { ...good, rating: 0 }))?.error).toMatch(/1 to 5/);
    setup({ vendor: { id: V, name: "Draft", status: "pending_review", is_demo: false } });
    expect((await submitPastClientReview(V, good))?.error).toMatch(/isn't taking reviews/);
    expect(inserts()).toHaveLength(0);
  });

  it("explains the database's refusals", async () => {
    setup({ insert: { data: null, error: { message: "You can't review your own business" } } });
    expect((await submitPastClientReview(V, good))?.error).toBe("You can't review your own business.");
  });
});

describe("setReviewHidden", () => {
  it("is admins only", async () => {
    expect(await setReviewHidden("r1", true, "fake")).toEqual({ error: "Not authorized." });
  });
});
