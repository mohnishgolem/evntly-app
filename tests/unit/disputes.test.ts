import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

let current: ReturnType<typeof fakeSupabase>;
let adminSession: { admin: boolean; mfa: string } = { admin: false, mfa: "n/a" };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("@/lib/data/user", () => ({ getAdminSession: async () => ({ session: null, ...adminSession }) }));
vi.mock("@/lib/email", () => ({ notify: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("@/lib/actions/disputes");
const { disputeAgeDays, isDisputeOutcome, isDisputeReason } = await import("@/lib/disputes");

const user = { id: "u1", email: "u1@example.invalid" };
const uuid = "6f1c2b0e-8a43-4e9b-9b1a-2f3c4d5e6f70";

describe("openDispute", () => {
  it("validates before calling the database", async () => {
    current = fakeSupabase({ user });
    expect((await actions.openDispute({ bookingId: "b1", reason: "hacked", description: "x".repeat(30), desiredOutcome: "" }))?.error).toMatch(/Pick/);
    expect((await actions.openDispute({ bookingId: "b1", reason: "no_show", description: "too short", desiredOutcome: "" }))?.error).toMatch(/20 characters/);
    expect(current.client.rpc).not.toHaveBeenCalled();
  });

  it("opens through the RPC, which decides the caller's role", async () => {
    current = fakeSupabase({ user, results: { "rpc:open_booking_dispute": { data: uuid } } });
    const res = await actions.openDispute({ bookingId: "b1", reason: "no_show", description: "The vendor never arrived at the venue.", desiredOutcome: "Refund" });
    expect(res).toEqual({ success: true, disputeId: uuid });
    expect(current.client.rpc).toHaveBeenCalledWith("open_booking_dispute", {
      p_booking_id: "b1",
      p_reason: "no_show",
      p_description: "The vendor never arrived at the venue.",
      p_desired_outcome: "Refund",
    });
  });

  it("passes on the database's plain-English errors, hides internal ones", async () => {
    current = fakeSupabase({ user, results: { "rpc:open_booking_dispute": { data: null, error: { message: "There's already an open dispute on this booking." } } } });
    expect((await actions.openDispute({ bookingId: "b1", reason: "quality", description: "Photos were all out of focus.", desiredOutcome: "" }))?.error).toBe(
      "There's already an open dispute on this booking."
    );
    current = fakeSupabase({ user, results: { "rpc:open_booking_dispute": { data: null, error: { message: 'new row violates check constraint "x"' } } } });
    expect((await actions.openDispute({ bookingId: "b1", reason: "quality", description: "Photos were all out of focus.", desiredOutcome: "" }))?.error).toBe(
      "Something went wrong. Please try again."
    );
  });
});

describe("messages and withdrawal", () => {
  it("rejects empty messages and bad ids without a database call", async () => {
    current = fakeSupabase({ user });
    expect((await actions.postDisputeMessage(uuid, "   "))?.error).toMatch(/Write a message/);
    expect((await actions.postDisputeMessage("not-a-uuid", "hi"))?.error).toBeTruthy();
    expect((await actions.withdrawDispute("nope"))?.error).toBe("Dispute not found.");
    expect(current.client.rpc).not.toHaveBeenCalled();
  });
});

describe("admin dispute and risk actions", () => {
  it("require an MFA-verified admin", async () => {
    current = fakeSupabase({ user });
    adminSession = { admin: true, mfa: "enrol" };
    expect(await actions.adminUpdateDispute({ disputeId: uuid, status: "under_review", outcome: null, note: "" })).toEqual({ error: "Not authorized." });
    adminSession = { admin: false, mfa: "n/a" };
    expect(await actions.markRiskReviewed("u2", "checked")).toEqual({ error: "Not authorized." });
    expect(current.client.rpc).not.toHaveBeenCalled();
  });

  it("won't resolve without an outcome and a real note", async () => {
    current = fakeSupabase({ user });
    adminSession = { admin: true, mfa: "ok" };
    expect((await actions.adminUpdateDispute({ disputeId: uuid, status: "resolved", outcome: null, note: "Long enough note here" }))?.error).toMatch(/outcome/);
    expect((await actions.adminUpdateDispute({ disputeId: uuid, status: "resolved", outcome: "vendor_favour", note: "ok" }))?.error).toMatch(/outcome/);
    expect(current.client.rpc).not.toHaveBeenCalled();
  });

  it("resolves through the audited RPC", async () => {
    current = fakeSupabase({ user, results: { "rpc:admin_update_dispute": { data: null } } });
    adminSession = { admin: true, mfa: "ok" };
    expect(await actions.adminUpdateDispute({ disputeId: uuid, status: "resolved", outcome: "customer_favour", note: "Venue confirmed a no-show." })).toEqual({ success: true });
    expect(current.client.rpc).toHaveBeenCalledWith("admin_update_dispute", {
      p_dispute_id: uuid,
      p_status: "resolved",
      p_outcome: "customer_favour",
      p_note: "Venue confirmed a no-show.",
    });
  });
});

describe("dispute helpers", () => {
  it("validates vocab and computes age", () => {
    expect(isDisputeReason("no_show")).toBe(true);
    expect(isDisputeReason("refund_me")).toBe(false);
    expect(isDisputeOutcome("partial")).toBe(true);
    expect(disputeAgeDays("2026-10-18T00:00:00Z", Date.parse("2026-10-22T01:00:00Z"))).toBe(4);
  });
});
