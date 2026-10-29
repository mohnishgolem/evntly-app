import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";
import { commissionCents, formatAud, parseDollarsToCents, suggestSplit, vendorPayoutCents } from "@/lib/payments/money";
import { milestoneStage } from "@/lib/payments/status";

// ── Real Stripe client, fake network ────────────────────────────────────
type Call = { method: string; path: string; body: URLSearchParams; headers: Record<string, string> };
let stripeCalls: Call[] = [];
let stripeRoutes: Record<string, (body: URLSearchParams) => { status?: number; json: unknown }> = {};

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const method = init?.method ?? "GET";
  const body = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => (headers[k.toLowerCase()] = v));
  stripeCalls.push({ method, path: url.pathname, body, headers });
  const route = stripeRoutes[`${method} ${url.pathname}`];
  const res = route ? route(body) : { status: 404, json: { error: { message: "no route", type: "invalid_request_error" } } };
  return new Response(JSON.stringify(res.json), {
    status: res.status ?? 200,
    headers: { "content-type": "application/json", "request-id": "req_test" },
  });
}) as typeof fetch;

const stripe = new Stripe("sk_test_fake", { httpClient: Stripe.createFetchHttpClient(fakeFetch), maxNetworkRetries: 0 });
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

// ── Supabase + side effects ─────────────────────────────────────────────
let current: ReturnType<typeof fakeSupabase>;
const notify = vi.fn();
const recordError = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => current.client }));
vi.mock("@/lib/email", () => ({ notify: (n: unknown) => notify(n), formatEventDate: (d: string) => d }));
vi.mock("@/lib/error-report", () => ({ recordError: (r: unknown) => recordError(r) }));

const { setStripeForTesting } = await import("@/lib/payments/stripe");
setStripeForTesting(stripe);
const { releaseMilestone, createMilestoneCheckout, refundMilestone } = await import("@/lib/payments/server");
const { POST } = await import("@/app/api/stripe/webhook/route");

function db(results: Parameters<typeof fakeSupabase>[0]["results"]) {
  current = fakeSupabase({ results });
  (current.client.auth as unknown as Record<string, unknown>).admin = {
    getUserById: async () => ({ data: { user: { email: "party@example.com" } } }),
  };
}

const plan = {
  id: "plan-1",
  booking_id: "b-1",
  vendor_user_id: "vendor-1",
  customer_user_id: "cust-1",
  status: "active",
  commission_bps: 700,
  transfer_group: "plan_abc",
  total_cents: 100000,
};
const milestone = {
  id: "11111111-1111-4111-8111-111111111111",
  plan_id: "plan-1",
  kind: "milestone",
  name: "Event night",
  amount_cents: 35000,
  charge_id: "ch_1",
  checkout_session_id: "cs_1",
  funding_status: "unfunded",
  work_status: "approved",
  payout_status: "processing",
  updated_at: "2026-10-21T00:00:00Z",
};

beforeEach(() => {
  stripeCalls = [];
  stripeRoutes = {};
  notify.mockClear();
  recordError.mockClear();
});

describe("money", () => {
  it("takes 7% to the cent and gives the vendor the rest", () => {
    expect(commissionCents(100000, 700)).toBe(7000);
    expect(vendorPayoutCents(100000, 700)).toBe(93000);
    expect(commissionCents(33333, 700)).toBe(2333);
    expect(vendorPayoutCents(33333, 700) + commissionCents(33333, 700)).toBe(33333);
  });
  it("rejects nonsense", () => {
    expect(() => commissionCents(-1, 700)).toThrow();
    expect(() => commissionCents(10.5, 700)).toThrow();
    expect(() => commissionCents(100, 9000)).toThrow();
  });
  it("parses dollars safely", () => {
    expect(parseDollarsToCents("$1,234.50")).toBe(123450);
    expect(parseDollarsToCents("10")).toBe(1000);
    expect(parseDollarsToCents("1.234")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
    expect(parseDollarsToCents("0")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
  });
  it("splits a total exactly", () => {
    const s = suggestSplit(100001, 25, 3);
    expect(s.deposit + s.milestones.reduce((a, b) => a + b, 0)).toBe(100001);
    expect(formatAud(250000)).toBe("$2,500");
    expect(formatAud(12345)).toBe("$123.45");
  });
});

describe("milestone stages", () => {
  const base = { kind: "milestone", work_status: "pending", funding_status: "unfunded", payout_status: "not_started" };
  it("follows the agreed workflow", () => {
    expect(milestoneStage(base).label).toBe("Pending");
    expect(milestoneStage({ ...base, work_status: "in_progress" }).label).toBe("In progress");
    expect(milestoneStage({ ...base, work_status: "submitted" }, "vendor").label).toBe("Submitted");
    expect(milestoneStage({ ...base, work_status: "submitted" }, "customer").label).toBe("Customer review");
    expect(milestoneStage({ ...base, work_status: "approved", funding_status: "funded" }).label).toBe("Approved");
    expect(milestoneStage({ ...base, work_status: "approved", funding_status: "funded", payout_status: "processing" }).label).toBe(
      "Payment processing"
    );
    expect(milestoneStage({ ...base, work_status: "approved", funding_status: "funded", payout_status: "paid" }).label).toBe("Paid");
  });
  it("shows exception states", () => {
    expect(milestoneStage({ ...base, work_status: "rejected" }).label).toBe("Rejected");
    expect(milestoneStage({ ...base, work_status: "disputed", funding_status: "funded" }).label).toBe("Disputed");
    expect(milestoneStage({ ...base, funding_status: "failed" }).label).toBe("Payment failed");
    expect(milestoneStage({ ...base, work_status: "cancelled" }).label).toBe("Cancelled");
  });
  it("never calls an unpaid milestone held", () => {
    expect(milestoneStage({ ...base, work_status: "approved" }).detail).toMatch(/waiting for the customer's payment/);
    expect(milestoneStage(base).detail).not.toMatch(/held/i);
  });
});

describe("releaseMilestone", () => {
  it("does nothing unless the database claims the milestone", async () => {
    db({ "rpc:claim_milestone_payout": { data: [] } });
    expect(await releaseMilestone(milestone.id)).toEqual({ released: false });
    expect(stripeCalls).toHaveLength(0);
  });

  it("transfers the vendor's share from the original charge, once", async () => {
    db({
      "rpc:claim_milestone_payout": { data: [milestone] },
      payment_plans: { data: plan },
      stripe_accounts: { data: { account_id: "acct_vendor" } },
      payment_milestones: { data: [] },
    });
    stripeRoutes["POST /v1/transfers"] = (b) => ({ json: { id: "tr_1", object: "transfer", amount: Number(b.get("amount")) } });

    expect(await releaseMilestone(milestone.id)).toEqual({ released: true });
    const call = stripeCalls.find((c) => c.path === "/v1/transfers")!;
    expect(call.body.get("amount")).toBe("32550"); // 35000 - 7%
    expect(call.body.get("currency")).toBe("aud");
    expect(call.body.get("destination")).toBe("acct_vendor");
    expect(call.body.get("source_transaction")).toBe("ch_1");
    expect(call.body.get("transfer_group")).toBe("plan_abc");
    expect(call.headers["idempotency-key"]).toBe(`payout-${milestone.id}-${milestone.updated_at}`);
    expect(current.writes).toContainEqual(
      expect.objectContaining({ table: "payment_milestones", op: "update", payload: expect.objectContaining({ payout_status: "paid", transfer_id: "tr_1" }) })
    );
  });

  it("never marks a sent payout as failed if bookkeeping breaks afterwards", async () => {
    db({
      "rpc:claim_milestone_payout": { data: [milestone] },
      payment_plans: { data: plan },
      stripe_accounts: { data: { account_id: "acct_vendor" } },
      payment_milestones: { data: [] },
    });
    stripeRoutes["POST /v1/transfers"] = (b) => ({ json: { id: "tr_2", object: "transfer", amount: Number(b.get("amount")) } });
    notify.mockImplementationOnce(() => {
      throw new Error("email provider down");
    });
    expect(await releaseMilestone(milestone.id)).toEqual({ released: true });
    const statuses = current.writes
      .filter((w) => w.table === "payment_milestones")
      .map((w) => (w.payload as { payout_status?: string }).payout_status);
    expect(statuses).toContain("paid");
    expect(statuses).not.toContain("failed");
  });

  it("marks the payout failed (and alerts) when Stripe refuses", async () => {
    db({
      "rpc:claim_milestone_payout": { data: [milestone] },
      payment_plans: { data: plan },
      stripe_accounts: { data: { account_id: "acct_vendor" } },
    });
    stripeRoutes["POST /v1/transfers"] = () => ({
      status: 400,
      json: { error: { type: "invalid_request_error", message: "Insufficient funds" } },
    });
    const res = await releaseMilestone(milestone.id);
    expect(res.released).toBe(false);
    expect(current.writes).toContainEqual(
      expect.objectContaining({ table: "payment_milestones", payload: expect.objectContaining({ payout_status: "failed" }) })
    );
    expect(recordError).toHaveBeenCalled();
  });
});

describe("createMilestoneCheckout", () => {
  const settings = { data: [{ key: "payments_enabled", value: "true" }] };

  it("refuses anyone but the plan's customer", async () => {
    db({ app_settings: settings, payment_milestones: { data: { ...milestone, funding_status: "unfunded" } }, payment_plans: { data: plan } });
    expect(await createMilestoneCheckout(milestone.id, "someone-else", "https://evntly-tau.vercel.app")).toEqual({
      error: "Payment not found.",
    });
    expect(stripeCalls).toHaveLength(0);
  });

  it("won't take money until the vendor can be paid", async () => {
    db({
      app_settings: settings,
      payment_milestones: { data: { ...milestone, kind: "deposit", funding_status: "unfunded" } },
      payment_plans: { data: plan },
      stripe_accounts: { data: { transfers_active: false } },
    });
    const res = await createMilestoneCheckout(milestone.id, "cust-1", "https://evntly-tau.vercel.app");
    expect(res.error).toMatch(/setting up payouts/);
    expect(stripeCalls).toHaveLength(0);
  });

  it("is off while payments are switched off", async () => {
    db({ app_settings: { data: [{ key: "payments_enabled", value: "false" }] } });
    expect((await createMilestoneCheckout(milestone.id, "cust-1", "x")).error).toMatch(/switched on/);
  });
});

describe("Stripe webhook", () => {
  async function signed(event: object, secret = "whsec_test_secret") {
    const payload = JSON.stringify(event);
    const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
    return new Request("https://evntly.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": header, "content-type": "application/json" },
      body: payload,
    }) as unknown as Parameters<typeof POST>[0];
  }
  const paidSession = (overrides: object = {}) => ({
    id: "evt_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 35000,
        currency: "aud",
        payment_intent: "pi_1",
        metadata: { milestone_id: milestone.id },
        ...overrides,
      },
    },
  });

  it("rejects unsigned or wrongly signed events without touching the database", async () => {
    db({});
    const forged = await signed(paidSession(), "whsec_attacker");
    expect((await POST(forged)).status).toBe(400);
    expect(current.writes).toHaveLength(0);
  });

  it("refuses a session whose amount doesn't match the milestone", async () => {
    db({ stripe_webhook_events: { data: null }, payment_milestones: { data: { ...milestone, funding_status: "unfunded" } } });
    const res = await POST(await signed(paidSession({ amount_total: 100 })));
    expect(res.status).toBe(500); // Stripe will retry; nothing marked funded
    expect(current.writes.some((w) => w.table === "payment_milestones")).toBe(false);
  });

  it("refuses a session that isn't the one created for this milestone", async () => {
    db({ stripe_webhook_events: { data: null }, payment_milestones: { data: { ...milestone, checkout_session_id: "cs_other" } } });
    expect((await POST(await signed(paidSession()))).status).toBe(500);
    expect(current.writes.some((w) => w.table === "payment_milestones")).toBe(false);
  });

  it("marks a verified payment funded using the real charge id", async () => {
    db({
      stripe_webhook_events: { data: null },
      payment_milestones: { data: { ...milestone, funding_status: "unfunded" } },
      payment_plans: { data: plan },
      "rpc:claim_milestone_payout": { data: [] },
    });
    stripeRoutes["GET /v1/payment_intents/pi_1"] = () => ({
      json: { id: "pi_1", object: "payment_intent", status: "succeeded", latest_charge: "ch_real" },
    });
    expect((await POST(await signed(paidSession()))).status).toBe(200);
    expect(current.writes).toContainEqual(
      expect.objectContaining({
        table: "payment_milestones",
        payload: expect.objectContaining({ funding_status: "funded", charge_id: "ch_real", payment_intent_id: "pi_1" }),
      })
    );
  });

  it("ignores an event it has already processed", async () => {
    db({ stripe_webhook_events: { data: { processed_at: "2026-10-21T00:00:00Z" } } });
    const res = await POST(await signed(paidSession()));
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(current.writes).toHaveLength(0);
  });
});

describe("chargebacks", () => {
  async function signedDispute() {
    const payload = JSON.stringify({
      id: "evt_dispute",
      object: "event",
      type: "charge.dispute.created",
      data: { object: { id: "dp_1", object: "dispute", charge: "ch_new", payment_intent: "pi_1", reason: "fraudulent" } },
    });
    const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: "whsec_test_secret" });
    return new Request("https://evntly.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": header, "content-type": "application/json" },
      body: payload,
    }) as unknown as Parameters<typeof POST>[0];
  }
  const target = { id: milestone.id, plan_id: "plan-1", name: "Event night" };
  const froze = () =>
    current.writes.some(
      (w) => w.table === "payment_milestones" && (w.payload as { work_status?: string })?.work_status === "disputed"
    );

  it("freezes the milestone when the charge is already on it", async () => {
    db({ stripe_webhook_events: { data: null }, "payment_milestones?charge_id": { data: target } });
    expect((await POST(await signedDispute())).status).toBe(200);
    expect(froze()).toBe(true);
    expect(stripeCalls).toHaveLength(0);
    expect(recordError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Chargeback") }));
  });

  // Seen in the Stripe sandbox: the dispute arrived a second before
  // checkout.session.completed, while the milestone had no charge id yet.
  it("still freezes the milestone when the dispute arrives before the payment is recorded", async () => {
    db({
      stripe_webhook_events: { data: null },
      "payment_milestones?charge_id": { data: null },
      "payment_milestones?id": { data: target },
    });
    stripeRoutes["GET /v1/payment_intents/pi_1"] = () => ({
      json: { id: "pi_1", object: "payment_intent", status: "succeeded", metadata: { milestone_id: milestone.id } },
    });
    expect((await POST(await signedDispute())).status).toBe(200);
    expect(froze()).toBe(true);
    expect(current.writes).toContainEqual(
      expect.objectContaining({ table: "payment_events", payload: expect.objectContaining({ event: "chargeback_opened" }) })
    );
  });

  it("ignores disputes on payments that aren't for a milestone", async () => {
    db({ stripe_webhook_events: { data: null }, "payment_milestones?charge_id": { data: null } });
    stripeRoutes["GET /v1/payment_intents/pi_1"] = () => ({ json: { id: "pi_1", object: "payment_intent", metadata: {} } });
    expect((await POST(await signedDispute())).status).toBe(200);
    expect(current.writes.some((w) => w.table === "payment_milestones" || w.table === "payment_events")).toBe(false);
  });

  it("asks Stripe to retry if the milestone named on the payment can't be found", async () => {
    db({
      stripe_webhook_events: { data: null },
      "payment_milestones?charge_id": { data: null },
      "payment_milestones?id": { data: null },
    });
    stripeRoutes["GET /v1/payment_intents/pi_1"] = () => ({
      json: { id: "pi_1", object: "payment_intent", metadata: { milestone_id: milestone.id } },
    });
    expect((await POST(await signedDispute())).status).toBe(500);
    expect(froze()).toBe(false);
  });
});

describe("refundMilestone", () => {
  const paidOut = {
    ...milestone,
    funding_status: "funded",
    payout_status: "paid",
    transfer_id: "tr_1",
    payment_intent_id: "pi_1",
  };
  const refundEvents = () =>
    current.writes
      .filter((w) => w.table === "payment_events")
      .map((w) => (w.payload as { event: string }).event);

  it("pulls back the vendor's payout, then refunds the customer", async () => {
    db({ payment_milestones: { data: paidOut }, payment_plans: { data: plan } });
    stripeRoutes["POST /v1/transfers/tr_1/reversals"] = () => ({ json: { id: "trr_1", object: "transfer_reversal" } });
    stripeRoutes["POST /v1/refunds"] = () => ({ json: { id: "re_1", object: "refund", status: "succeeded" } });
    expect(await refundMilestone(milestone.id, "Customer cancelled")).toEqual({});
    expect(stripeCalls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /v1/transfers/tr_1/reversals", "POST /v1/refunds"]);
    expect(refundEvents()).toEqual(["refunded"]);
  });

  it("reports a completed refund as done even if the email afterwards fails", async () => {
    db({ payment_milestones: { data: paidOut }, payment_plans: { data: plan } });
    stripeRoutes["POST /v1/transfers/tr_1/reversals"] = () => ({ json: { id: "trr_1", object: "transfer_reversal" } });
    stripeRoutes["POST /v1/refunds"] = () => ({ json: { id: "re_1", object: "refund", status: "succeeded" } });
    notify.mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });
    expect(await refundMilestone(milestone.id, "Customer cancelled")).toEqual({});
    expect(refundEvents()).toEqual(["refunded"]);
    expect(recordError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Post-refund") }));
  });

  it("logs a failed refund when Stripe refuses it", async () => {
    db({ payment_milestones: { data: { ...paidOut, payout_status: "not_started", transfer_id: null } } });
    stripeRoutes["POST /v1/refunds"] = () => ({
      status: 400,
      json: { error: { message: "Charge already refunded", type: "invalid_request_error" } },
    });
    const res = await refundMilestone(milestone.id, "Customer cancelled");
    expect(res.error).toContain("already refunded");
    expect(refundEvents()).toEqual(["refund_failed"]);
  });
});
