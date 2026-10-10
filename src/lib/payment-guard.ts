// Payment-circumvention guard: blocks messages that try to arrange payment
// outside the platform (cash, PayID, bank transfer, crypto). Unlike contact
// info (phone/email/social, intentionally allowed — see git history for the
// removed anti-leakage scanner), these mentions are blocked outright rather
// than redacted-and-delivered, since the goal is to stop the arrangement
// from happening at all, not just hide it.

const PATTERNS: { category: string; regex: RegExp }[] = [
  { category: "cash", regex: /\bcash\b/i },
  { category: "payid", regex: /\bpay\s*id\b/i },
  {
    category: "bank_transfer",
    regex: /\bbank\s*transfer\b|\bdirect\s*deposit\b|\bBSB\b|\baccount\s*number\b/i,
  },
  {
    category: "crypto",
    regex:
      /\bcrypto(currency)?\b|\bbitcoin\b|\bbtc\b|\bethereum\b|\busdt\b|\busdc\b|\b0x[a-fA-F0-9]{40}\b|\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b/i,
  },
];

export type PaymentGuardResult =
  | { blocked: true; category: string; snippet: string }
  | { blocked: false };

export function scanForPaymentCircumvention(content: string): PaymentGuardResult {
  for (const { category, regex } of PATTERNS) {
    const match = content.match(regex);
    if (match) {
      return { blocked: true, category, snippet: match[0] };
    }
  }
  return { blocked: false };
}

export const PAYMENT_GUARD_ERROR =
  "That message mentions paying outside Evntly (cash, PayID, bank transfer, or crypto). All payments need to go through the app — edit your message and try again.";
