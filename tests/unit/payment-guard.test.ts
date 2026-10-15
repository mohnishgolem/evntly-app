import { describe, expect, it } from "vitest";
import cases from "../fixtures/payment-guard-cases.json";
import { scanForPaymentCircumvention } from "@/lib/payment-guard";

// The same cases are run through the database trigger's patterns
// (supabase/tests/payment_guard_parity.sql); both must agree.
export const expected: Record<string, string | null> = Object.fromEntries(
  (cases as string[]).map((c) => {
    const r = scanForPaymentCircumvention(c);
    return [c, r.blocked ? r.category : null];
  })
);

describe("payment guard", () => {
  it("blocks off-platform payment talk and allows normal chat", () => {
    expect(expected["Can I pay cash on the day?"]).toBe("cash");
    expect(expected["send it via PayID"]).toBe("payid");
    expect(expected["BSB 062-000"]).toBe("bank_transfer");
    expect(expected["1BoatSLRHtKNngkdXEeobR76b53LETtpyT"]).toBe("crypto");
    expect(expected["cashew cake for dessert"]).toBeNull();
    expect(expected["Can we pay the deposit through Evntly?"]).toBeNull();
    expect(expected["See you at 6pm, can't wait!"]).toBeNull();
  });
});
