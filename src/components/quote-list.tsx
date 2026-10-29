import { cache } from "react";
import Link from "next/link";
import { Clock, CheckCircle2, Hourglass, XCircle } from "lucide-react";
import { QuoteActions, WithdrawRequest } from "@/components/quote-actions";
import { getPaymentsStatus } from "@/lib/payments/server";
import { QuoteDetails } from "@/components/quote-details";
import { HelpTip } from "@/components/help/help-tip";
import { cn } from "@/lib/utils";
import { categoryPlural } from "@/lib/config";
import {
  effectiveQuoteStatus,
  quoteExpiresSoon,
  quoteTimeLeft,
} from "@/lib/quote-expiry";
import type { Database } from "@/lib/supabase/database.types";
import type { SimilarVendor } from "@/lib/data/vendors";
import { formatAudDollars } from "@/lib/payments/money";

// Follow-up bookkeeping columns aren't part of what the list shows (and the
// my_quote_requests RPC doesn't return them).
type Quote = Omit<
  Database["public"]["Tables"]["quote_requests"]["Row"],
  "vendor_reminder_sent_at" | "client_reminder_sent_at" | "expiry_notice_sent_at"
>;

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "Waiting on vendor", className: "text-warning" },
  quoted: { label: "Quoted — review & accept", className: "text-primary" },
  accepted: { label: "Accepted", className: "text-success" },
  declined: { label: "Declined", className: "text-destructive" },
  cancelled: { label: "Cancelled", className: "text-muted-foreground" },
  expired: { label: "Expired", className: "text-muted-foreground" },
};

export function QuoteList({
  quotes,
  alternatives = {},
}: {
  quotes: Quote[];
  alternatives?: Record<string, SimilarVendor[]>;
}) {
  return (
    <div className="space-y-4">
      {quotes.map((q) => {
        const status = effectiveQuoteStatus(q);
        const meta = STATUS_META[status] ?? STATUS_META.pending;
        const timeLeft = quoteTimeLeft(q);
        return (
          <div key={q.id} className="rounded-2xl border border-border p-5">
            {/* Phones: status on its own line above the details; wider: on the right. */}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <Link
                  href={`/vendor/${q.vendor_id}`}
                  className="font-semibold hover:underline"
                >
                  {q.vendor_name ?? "Vendor"}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {q.event_type} · {q.event_date} · {q.location}
                </p>
                <p className="text-sm text-muted-foreground">
                  {q.estimated_guests} guests · Budget {q.budget_range}
                </p>
              </div>
              <span
                className={`order-first flex shrink-0 items-center gap-1.5 text-sm font-medium sm:order-none ${meta.className}`}
              >
                {status === "accepted" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : status === "declined" ? (
                  <XCircle className="h-4 w-4" />
                ) : status === "expired" ? (
                  <Hourglass className="h-4 w-4" />
                ) : (
                  <Clock className="h-4 w-4" />
                )}
                {meta.label}
                <HelpTip label="What quote statuses mean" article="quote-statuses">
                  Requests expire 7 days after they&apos;re sent, or on the event date if sooner. When the vendor sends a
                  price you get a fresh 7 days to accept it. Accepting creates a booking the vendor then confirms.
                </HelpTip>
              </span>
            </div>

            {status === "pending" && timeLeft && (
              <p className="mt-2 text-xs text-muted-foreground">
                If {q.vendor_name ?? "the vendor"} doesn&apos;t reply, this
                request expires {timeLeft}.
              </p>
            )}
            {status === "pending" && <WithdrawRequest quoteId={q.id} vendorName={q.vendor_name ?? "the vendor"} />}

            {status === "expired" && (
              <p className="mt-2 text-sm text-muted-foreground">
                {q.quoted_amount != null
                  ? `The ${formatAudDollars(q.quoted_amount)} quote wasn't accepted in time.`
                  : `${q.vendor_name ?? "The vendor"} didn't reply in time.`}{" "}
                <Link
                  href={`/vendor/${q.vendor_id}`}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Request a new quote
                </Link>
              </p>
            )}

            {!!alternatives[q.id]?.length && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Other {q.service_type ? categoryPlural(q.service_type) : "vendors"} you could ask
                </p>
                <div className="flex flex-wrap gap-2">
                  {alternatives[q.id].map((v) => (
                    <Link
                      key={v.id}
                      href={`/vendor/${v.id}`}
                      className="rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:border-foreground/30"
                    >
                      {v.name} <span className="text-muted-foreground">· {formatAudDollars(v.hourly_rate)}/hr</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {status === "quoted" && (
              <div className="mt-3 rounded-xl bg-secondary p-3">
                <p className="text-sm">
                  Quoted price:{" "}
                  <span className="font-semibold">{formatAudDollars(q.quoted_amount)}</span>
                </p>
                {timeLeft && (
                  <p
                    className={cn(
                      "mt-0.5 text-xs",
                      quoteExpiresSoon(q)
                        ? "font-medium text-warning"
                        : "text-muted-foreground",
                    )}
                  >
                    Quote expires {timeLeft}
                  </p>
                )}
                {q.vendor_note && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {q.vendor_note}
                  </p>
                )}
                <QuoteDetails quote={q} />
                <AcceptPaymentNote vendorName={q.vendor_name ?? "the vendor"} />
                <QuoteActions quoteId={q.id} />
              </div>
            )}
            {q.vendor_id && q.client_user_id && (
              <Link
                href={`/messages/${encodeURIComponent(`${q.vendor_id}:${q.client_user_id}`)}`}
                className="mt-3 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2 sm:min-h-0"
              >
                Message {q.vendor_name ?? "vendor"}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

const paymentsStatus = cache(getPaymentsStatus);

// Shown before "Accept & book": accepting never charges anything, and while
// online payments are off the customer pays the vendor directly.
async function AcceptPaymentNote({ vendorName }: { vendorName: string }) {
  const { enabled } = await paymentsStatus();
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      Accepting doesn&apos;t charge you anything.{" "}
      {enabled
        ? "Once the vendor confirms, your booking page shows how to pay."
        : `You pay ${vendorName} directly, on the terms in this quote — Evntly doesn't take or hold booking payments.`}
    </p>
  );
}
