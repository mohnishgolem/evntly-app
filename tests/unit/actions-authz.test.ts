import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  RATE_LIMIT_ERROR: "Too many attempts.",
}));

const admin = await import("@/lib/actions/admin");
const reviews = await import("@/lib/actions/reviews");
const portfolio = await import("@/lib/actions/portfolio");

const user = { id: "u1", email: "u1@example.invalid" };

describe("admin actions", () => {
  it("reject logged-out users", async () => {
    current = fakeSupabase({ user: null });
    expect(await admin.setUserRole("u2", "admin")).toEqual({ error: "Not authorized." });
    expect(current.writes).toHaveLength(0);
  });

  it("reject non-admins", async () => {
    current = fakeSupabase({ user, results: { users: { data: { id: "u1", role: "customer" } } } });
    expect(await admin.setVendorStatus("v1", "approved")).toEqual({ error: "Not authorized." });
    expect(current.writes).toHaveLength(0);
  });

  it("reject admins whose session is not MFA-verified (aal1)", async () => {
    current = fakeSupabase({ user, aal: "aal1", nextAal: "aal2", results: { users: { data: { id: "u1", role: "admin" } } } });
    expect(await admin.setUserRole("u2", "admin")).toEqual({ error: "Not authorized." });
    current = fakeSupabase({ user, aal: "aal1", results: { users: { data: { id: "u1", role: "admin" } } } });
    expect(await admin.updateReportStatus("r1", "actioned")).toEqual({ error: "Not authorized." });
    expect(current.writes).toHaveLength(0);
  });

  it("allow MFA-verified admins", async () => {
    current = fakeSupabase({ user, aal: "aal2", results: { users: { data: { id: "u1", role: "admin" } } } });
    expect(await admin.setVendorStatus("v1", "approved")).toEqual({ success: true });
    expect(current.writes).toEqual([{ table: "service_providers", op: "update", payload: { status: "approved" } }]);
  });

  it("let admins move a listing back to pending review", async () => {
    current = fakeSupabase({ user, aal: "aal2", results: { users: { data: { id: "u1", role: "admin" } } } });
    expect(await admin.setVendorStatus("v1", "pending_review")).toEqual({ success: true });
    expect(current.writes).toEqual([{ table: "service_providers", op: "update", payload: { status: "pending_review" } }]);
  });

  it("reject made-up statuses sent from the browser", async () => {
    current = fakeSupabase({ user, aal: "aal2", results: { users: { data: { id: "u1", role: "admin" } } } });
    // @ts-expect-error — simulating a tampered request
    expect(await admin.setVendorStatus("v1", "featured")).toEqual({ error: "Invalid status." });
    expect(current.writes).toHaveLength(0);
  });
});

describe("submitReview (review manipulation)", () => {
  beforeEach(() => {
    current = fakeSupabase({ user });
  });

  it.each([0, 6, 100, 4.5, NaN])("rejects rating %s without writing", async (rating) => {
    const res = await reviews.submitReview("p1", "b1", null, rating, "x");
    expect(res?.error).toMatch(/rating/i);
    expect(current.writes).toHaveLength(0);
  });

  it("rejects reviews without a completed booking with that vendor", async () => {
    current = fakeSupabase({ user, results: { bookings: { data: null } } });
    const res = await reviews.submitReview("p1", "b1", null, 5, "great");
    expect(res?.error).toMatch(/completed booking/);
    expect(current.writes).toHaveLength(0);
  });

  it("rejects a second review of the same booking", async () => {
    current = fakeSupabase({ user, results: { bookings: { data: { id: "b1" } }, reviews: { data: { id: "r1" } } } });
    const res = await reviews.submitReview("p1", "b1", null, 5, "again");
    expect(res?.error).toMatch(/already reviewed/);
    expect(current.writes).toHaveLength(0);
  });

  it("accepts a review of a completed booking", async () => {
    current = fakeSupabase({ user, results: { bookings: { data: { id: "b1" } }, reviews: { data: null } } });
    expect(await reviews.submitReview("p1", "b1", "Wedding", 5, "great")).toEqual({ success: true });
    expect(current.writes.map((w) => w.op)).toEqual(["insert"]);
  });
});

describe("addPortfolioItem (vendor impersonation)", () => {
  const ownPath = "u1/p1/0b6f3c3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f.png";

  it("refuses to record media for a listing the caller doesn't own", async () => {
    current = fakeSupabase({ user, results: { "rpc:my_service_providers": { data: null } } });
    const res = await portfolio.addPortfolioItem("someone-elses-listing", {
      path: "u1/someone-elses-listing/0b6f3c3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f.png",
      type: "image/png",
    });
    expect(res?.error).toMatch(/your own listing/);
    expect(current.writes).toHaveLength(0);
  });

  it("refuses SVG (script-capable) and other unlisted types", async () => {
    current = fakeSupabase({ user });
    const res = await portfolio.addPortfolioItem("p1", { path: "u1/p1/x.svg", type: "image/svg+xml" });
    expect(res?.error).toMatch(/can't be added/);
    expect(current.writes).toHaveLength(0);
  });

  it("refuses paths outside the caller's folder for that listing", async () => {
    current = fakeSupabase({ user });
    for (const path of [
      "u2/p1/0b6f3c3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f.png",
      "u1/p2/0b6f3c3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f.png",
      "u1/p1/../../u2/p1/0b6f3c3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f.png",
      ownPath.replace(".png", ".mp4"),
    ]) {
      const res = await portfolio.addPortfolioItem("p1", { path, type: "image/png" });
      expect(res?.error).toMatch(/can't be added/);
    }
    expect(current.writes).toHaveLength(0);
  });
});
