import { cache } from "react";
import Link from "next/link";
import { Clock, CheckCircle2, Hourglass, MessageCircle, XCircle } from "lucide-react";
import { StatusPill } from "@/components/booking-progress";
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
import { vendorPrice } from "@/lib/pricing-model";

// Follow-up bookkeeping and attribution columns aren't part of what the list
// shows (and the my_quote_requests RPC doesn't return them).
type Quote = Omit<
  Database["public"]["Tables"]["quote_requests"]["Row"],
  "vendor_reminder_sent_at" | "client_reminder_sent_at" | "expiry_notice_sent_at" | "share_source"
>;

const STATUS_META: Record<string, { label: string; tone: "waiting" | "action" | "good" | "muted" | "bad" }> = {
  pending: { label: "Waiting on vendor", tone: "waiting" },
  quoted: { label: "Quoted — review & accept", tone: "action" },
  accepted: { label: "Accepted", tone: "good" },
  declined: { label: "Declined", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
};

export function QuoteList({
  quotes,
  alternatives = {},
}: {
  quotes: Quote[];
  alternatives?: Record<string, SimilarVendor[]>;
}) {
  // Two or more priced quotes for the same event and service: the event
  // board already has a side-by-side comparison, so point there.
  const quotedPerGroup = new Map<string, number>();
  for (const q of quotes) {
    if (q.event_id && q.service_type && effectiveQuoteStatus(q) === "quoted") {
      const k = `${q.event_id}:${q.service_type}`;
      quotedPerGroup.set(k, (quotedPerGroup.get(k) ?? 0) + 1);
    }
  }
  return (
    <div className="space-y-4">
      {quotes.map((q) => {
        const status = effectiveQuoteStatus(q);
        const meta = STATUS_META[status] ?? STATUS_META.pending;
        const timeLeft = quoteTimeLeft(q);
        return (
          <article key={q.id} className="surface-raised rounded-card p-5">
            {/* Phones: status on its own line above the details; wider: on the right. */}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <Link
                  href={`/vendor/${q.vendor_id}`}
                  className="text-[17px] font-semibold hover:underline"
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
              <span className="order-first flex shrink-0 items-center gap-1 sm:order-none">
                <StatusPill tone={meta.tone}>
                {status === "accepted" ? (
                  <CheckCircle2 className="size-3.5" aria-hidden />
                ) : status === "declined" ? (
                  <XCircle className="size-3.5" aria-hidden />
                ) : status === "expired" ? (
                  <Hourglass className="size-3.5" aria-hidden />
                ) : (
                  <Clock className="size-3.5" aria-hidden />
                )}
                {meta.label}
                </StatusPill>
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
                      className="btn-raised rounded-full px-3 py-1.5 text-sm"
                    >
                      {v.name} <span className="text-muted-foreground">· {vendorPrice(v).label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {status === "quoted" && (
              <div className="mt-4 rounded-2xl bg-primary/[0.06] p-4 ring-1 ring-primary/15">
                <p className="text-sm text-muted-foreground">Quoted price</p>
                <p className="text-2xl font-bold tabular-nums">{formatAudDollars(q.quoted_amount)}</p>
                {timeLeft && (
                  <p
                    className={cn(
                      "mt-0.5 text-xs",
                      quoteExpiresSoon(q)
                        ? "font-medium text-warning-text"
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
                {q.event_id && q.service_type && (quotedPerGroup.get(`${q.event_id}:${q.service_type}`) ?? 0) > 1 && (
                  <Link href={`/dashboard/events/${q.event_id}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary-text underline underline-offset-2">
                    Compare {quotedPerGroup.get(`${q.event_id}:${q.service_type}`)} {categoryPlural(q.service_type)} quotes on your event board
                  </Link>
                )}
              </div>
            )}
            {q.vendor_id && q.client_user_id && (
              <Link
                href={`/messages/${encodeURIComponent(`${q.vendor_id}:${q.client_user_id}`)}`}
                className="btn-raised mt-4 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
              >
                <MessageCircle className="size-4" aria-hidden /> Message {q.vendor_name ?? "vendor"}
              </Link>
            )}
          </article>
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
