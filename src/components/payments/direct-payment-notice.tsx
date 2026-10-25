import Link from "next/link";
import { Info } from "lucide-react";

// Shown on a booking while Evntly's online payments are switched off.
// Customers pay vendors directly; Evntly doesn't take, hold or refund money.
export function DirectPaymentNotice({ role }: { role: "customer" | "vendor" | "admin" }) {
  return (
    <section aria-labelledby="payments-heading" className="space-y-3">
      <h2 id="payments-heading" className="text-lg font-semibold">
        Payment
      </h2>
      <div className="flex items-start gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="space-y-2">
          {role === "vendor" ? (
            <p>
              Your customer pays you directly, using the payment details and terms you give them. Evntly
              doesn&apos;t take, hold or release booking payments, and doesn&apos;t charge you a fee for this
              booking.
            </p>
          ) : (
            <p>
              You pay the vendor directly, using the payment details and terms they give you. Evntly doesn&apos;t
              take, hold or refund booking payments.
            </p>
          )}
          {role !== "vendor" && (
            <p>
              Before paying, confirm the vendor&apos;s bank details with them by phone, and be wary of any request
              to change them. Evntly will never ask you to pay Evntly for a vendor&apos;s services.
            </p>
          )}
          <p>
            Cancellations and refunds are between you and the{" "}
            {role === "vendor" ? "customer" : "vendor"}, under the vendor&apos;s terms and the Australian Consumer
            Law. See our{" "}
            <Link href="/cancellation-refund-dispute-policy" className="font-medium text-foreground underline underline-offset-2">
              Cancellation, Refund &amp; Dispute Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
