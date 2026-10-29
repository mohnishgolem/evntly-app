import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { VendorQuoteResponse } from "@/components/vendor-quote-response";
import { BlockUserButton } from "@/components/block-user";
import { cn } from "@/lib/utils";
import {
  effectiveQuoteStatus,
  quoteExpiresSoon,
  quoteTimeLeft,
} from "@/lib/quote-expiry";
import type { VendorQuote } from "@/lib/data/vendor-quotes";
import { QuoteDetails } from "@/components/quote-details";
import { reasonForVendor } from "@/lib/matching/engine";
import { formatAudDollars } from "@/lib/payments/money";

const STATUS_LABEL: Record<string, string> = {
  pending: "Needs your response",
  quoted: "You quoted this",
  accepted: "Accepted — booking created",
  declined: "You declined",
  cancelled: "Customer cancelled",
  expired: "Expired",
};

// Quote request cards for the vendor's Leads pages: New requests (pending)
// and Quotes (priced). Each card can open a conversation with its customer.
export function VendorQuoteCards({ quotes }: { quotes: VendorQuote[] }) {
  return (
    <div className="space-y-4">
      {quotes.map((q) => {
        const status = effectiveQuoteStatus(q);
        const timeLeft = quoteTimeLeft(q);
        return (
          <div key={q.id} className="rounded-2xl border border-border p-5">
            {/* Phones: status on its own line above the details; wider: on the right. */}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="font-semibold">
                  {q.client_name ?? "Customer"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {q.event_type} · {q.event_date} · {q.location}
                </p>
                <p className="text-sm text-muted-foreground">
                  {q.estimated_guests} guests · Budget {q.budget_range}
                </p>
                {q.estimated_hours != null && (
                  <p className="text-sm text-muted-foreground">{Number(q.estimated_hours)} hours</p>
                )}
                {q.details && <p className="mt-1 text-sm">{q.details}</p>}
                {q.match_score != null && (
                  <p className="mt-2 text-xs">
                    <span className="mr-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                      {q.match_score}% match
                    </span>
                    <span className="text-muted-foreground">{reasonForVendor(q.match_reason)}</span>
                  </p>
                )}
              </div>
              <span className="order-first shrink-0 text-sm font-medium text-muted-foreground sm:order-none">
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
                  : `Your quote of ${formatAudDollars(q.quoted_amount)} is open for the customer to accept — expires ${timeLeft}.`}
              </p>
            )}
            {status === "expired" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {q.quoted_amount != null
                  ? "The customer didn't accept your quote in time."
                  : "This request expired before you replied."}
              </p>
            )}

            {status !== "pending" && q.quoted_amount != null && <QuoteDetails quote={q} />}
            {status === "pending" && <VendorQuoteResponse quoteId={q.id} estimatedHours={q.estimated_hours} />}
            {(() => {
              const thread = q.vendor_id && q.client_user_id ? `${q.vendor_id}:${q.client_user_id}` : null;
              const canMessage = !!thread;
              const canBlock = status === "pending" || status === "quoted";
              if (!canMessage && !canBlock) return null;
              return (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  {canMessage ? (
                    <Link
                      href={`/messages/${encodeURIComponent(thread!)}`}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline underline-offset-2"
                    >
                      <MessageCircle className="size-4" aria-hidden /> Message {q.client_name ?? "customer"}
                    </Link>
                  ) : (
                    <span />
                  )}
                  {canBlock && <BlockUserButton name={q.client_name ?? "this customer"} quoteId={q.id} />}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
