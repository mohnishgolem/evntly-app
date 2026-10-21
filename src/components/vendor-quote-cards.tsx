import { VendorQuoteResponse } from "@/components/vendor-quote-response";
import { BlockUserButton } from "@/components/block-user";
import { cn } from "@/lib/utils";
import {
  effectiveQuoteStatus,
  quoteExpiresSoon,
  quoteTimeLeft,
} from "@/lib/quote-expiry";
import type { VendorQuote } from "@/lib/data/vendor-quotes";

const STATUS_LABEL: Record<string, string> = {
  pending: "Needs your response",
  quoted: "You quoted this",
  accepted: "Accepted — booking created",
  declined: "You declined",
  cancelled: "Customer cancelled",
  expired: "Expired",
};

// Quote request cards for the vendor's Enquiries (pending) and Quotes
// (priced) pages.
export function VendorQuoteCards({ quotes }: { quotes: VendorQuote[] }) {
  return (
    <div className="space-y-4">
      {quotes.map((q) => {
        const status = effectiveQuoteStatus(q);
        const timeLeft = quoteTimeLeft(q);
        return (
          <div key={q.id} className="rounded-2xl border border-border p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">
                  {q.client_name ?? "Customer"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {q.event_type} · {q.event_date} · {q.location}
                </p>
                <p className="text-sm text-muted-foreground">
                  {q.estimated_guests} guests · Budget {q.budget_range}
                </p>
                {q.details && <p className="mt-1 text-sm">{q.details}</p>}
              </div>
              <span className="shrink-0 text-sm font-medium text-muted-foreground">
                {STATUS_LABEL[status] ?? status}
              </span>
            </div>

            {timeLeft && (
              <p
                className={cn(
                  "mt-2 text-xs",
                  quoteExpiresSoon(q)
                    ? "font-medium text-warning"
                    : "text-muted-foreground",
                )}
              >
                {status === "pending"
                  ? `Reply ${timeLeft.replace(/^in /, "within ")} or this request expires.`
                  : `Your quote of $${q.quoted_amount} is open for the customer to accept — expires ${timeLeft}.`}
              </p>
            )}
            {status === "expired" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {q.quoted_amount != null
                  ? "The customer didn't accept your quote in time."
                  : "This request expired before you replied."}
              </p>
            )}

            {status === "pending" && <VendorQuoteResponse quoteId={q.id} />}
            {(status === "pending" || status === "quoted") && (
              <div className="mt-3 flex justify-end">
                <BlockUserButton name={q.client_name ?? "this customer"} quoteId={q.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
