import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { isPaymentGuardRejection, recordBlockedPayment } from "@/lib/payment-guard-log";
import { PAYMENT_GUARD_ERROR } from "@/lib/payment-guard";

describe("payment guard (DB decides block vs flag)", () => {
  it("recognises only the guard's own rejection", () => {
    const dbMessage =
      "That message mentions paying outside Evntly (cash, PayID, bank transfer, or crypto). All payments need to go through the app — edit your message and try again.";
    expect(isPaymentGuardRejection({ code: "23514", message: dbMessage })).toBe(true);
    // Other check violations (e.g. message too long) are not payment talk.
    expect(isPaymentGuardRejection({ code: "23514", message: "violates check constraint" })).toBe(false);
    expect(isPaymentGuardRejection({ code: "42501", message: dbMessage })).toBe(false);
    expect(isPaymentGuardRejection(null)).toBe(false);
  });

  it("the DB trigger's message matches the app's error text", () => {
    expect(PAYMENT_GUARD_ERROR).toContain("paying outside Evntly");
  });

  it("records a blocked attempt through the real client and returns the guard error", async () => {
    const calls: { url: string; method?: string; body: Record<string, unknown> }[] = [];
    const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(null, { status: 201 });
    });
    const supabase = createClient("https://example.supabase.co", "anon-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fakeFetch as unknown as typeof fetch },
    });

    const res = await recordBlockedPayment(
      supabase as never,
      { id: "user-1", email: "u1@example.invalid" },
      "vendor-1:user-1",
      "Can I pay you cash on the day?"
    );

    expect(res).toEqual({ error: PAYMENT_GUARD_ERROR });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://example.supabase.co/rest/v1/leakage_events");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toMatchObject({
      sender_id: "user-1",
      conversation_id: "vendor-1:user-1",
      category: "cash",
      original_snippet: "cash",
      delivered: false,
    });
  });
});
