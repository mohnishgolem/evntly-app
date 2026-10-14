import Link from "next/link";
import { Clock, CheckCircle2, Hourglass, XCircle } from "lucide-react";
import { QuoteActions } from "@/components/quote-actions";
import { cn } from "@/lib/utils";
import {
  effectiveQuoteStatus,
  quoteExpiresSoon,
  quoteTimeLeft,
} from "@/lib/quote-expiry";
import type { Database } from "@/lib/supabase/database.types";

type Quote = Database["public"]["Tables"]["quote_requests"]["Row"];

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "Waiting on vendor", className: "text-warning" },
  quoted: { label: "Quoted — review & accept", className: "text-primary" },
  accepted: { label: "Accepted", className: "text-success" },
  declined: { label: "Declined", className: "text-destructive" },
  cancelled: { label: "Cancelled", className: "text-muted-foreground" },
  expired: { label: "Expired", className: "text-muted-foreground" },
};

export function QuoteList({ quotes }: { quotes: Quote[] }) {
  return (
    <div className="space-y-4">
      {quotes.map((q) => {
        const status = effectiveQuoteStatus(q);
        const meta = STATUS_META[status] ?? STATUS_META.pending;
        const timeLeft = quoteTimeLeft(q);
        return (
          <div key={q.id} className="rounded-2xl border border-border p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
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
                className={`flex items-center gap-1.5 text-sm font-medium ${meta.className}`}
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
              </span>
            </div>

            {status === "pending" && timeLeft && (
              <p className="mt-2 text-xs text-muted-foreground">
                If {q.vendor_name ?? "the vendor"} doesn&apos;t reply, this
                request expires {timeLeft}.
              </p>
            )}

            {status === "expired" && (
              <p className="mt-2 text-sm text-muted-foreground">
                {q.quoted_amount != null
                  ? `The $${q.quoted_amount} quote wasn't accepted in time.`
                  : `${q.vendor_name ?? "The vendor"} didn't reply in time.`}{" "}
                <Link
                  href={`/vendor/${q.vendor_id}`}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Request a new quote
                </Link>
              </p>
            )}

            {status === "quoted" && (
              <div className="mt-3 rounded-xl bg-secondary p-3">
                <p className="text-sm">
                  Quoted price:{" "}
                  <span className="font-semibold">${q.quoted_amount}</span>
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
                <QuoteActions quoteId={q.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
