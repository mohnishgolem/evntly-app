import Link from "next/link";
import { CancelBookingButton } from "@/components/cancel-booking-button";
import { JobCardPanel } from "@/components/job-card-panel";
import type { getJobCardForBooking } from "@/lib/data/job-cards";
import type { ParticipantBooking } from "@/lib/public-columns";
import type { PaymentSummary } from "@/lib/event-board";
import { formatAudDollars } from "@/lib/payments/money";
import { BookingProgress, StatusPill } from "@/components/booking-progress";

type Booking = ParticipantBooking;
type JobCardResult = Awaited<ReturnType<typeof getJobCardForBooking>>;

const PAYMENT_TONE: Record<PaymentSummary["tone"], string> = {
  neutral: "text-muted-foreground",
  attention: "text-warning-text",
  active: "text-primary",
  success: "text-success",
};

const STATUS_TONE: Record<string, "waiting" | "action" | "good" | "muted"> = {
  pending: "waiting",
  confirmed: "action",
  completed: "good",
  cancelled: "muted",
};

export function BookingList({
  bookings,
  jobCardByBooking,
  reviewedBookingIds,
  payments,
}: {
  bookings: Booking[];
  jobCardByBooking: Map<string, JobCardResult>;
  reviewedBookingIds: Set<string>;
  /** Payment status per booking id, shown under the price (Event Board). */
  payments?: Map<string, PaymentSummary>;
}) {
  return (
    <div className="space-y-4">
      {bookings.map((b) => (
        <article key={b.id} className="surface-raised rounded-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href={`/vendor/${b.provider_id}`} className="text-[17px] font-semibold hover:underline">
                {b.provider_name ?? "Vendor"}
              </Link>
              <p className="text-sm text-muted-foreground">
                {b.event_date}
                {b.event_address ? ` · ${b.event_address}` : ""}
              </p>
              {!!b.total_price && <p className="mt-1 text-[15px] font-bold tabular-nums">{formatAudDollars(b.total_price)}</p>}
              {payments?.get(b.id) && b.status !== "cancelled" && (
                <p className={`text-sm font-medium ${PAYMENT_TONE[payments.get(b.id)!.tone]}`}>
                  {payments.get(b.id)!.label}
                </p>
              )}
            </div>
            <StatusPill tone={STATUS_TONE[b.status] ?? "muted"} className="capitalize">
              {b.status}
            </StatusPill>
          </div>
          <BookingProgress status={b.status} className="mt-4" />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href={`/bookings/${b.id}`} className="btn-coral inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold">
              View booking
            </Link>
            {b.status !== "cancelled" && b.status !== "completed" && (
              <CancelBookingButton bookingId={b.id} />
            )}
            {b.client_user_id && b.status !== "cancelled" && (
              <Link
                href={`/messages/${encodeURIComponent(`${b.provider_id}:${b.client_user_id}`)}`}
                className="btn-raised inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold"
              >
                Message vendor
              </Link>
            )}
            {(b.status === "confirmed" || b.status === "completed") && (
              <Link
                href={`/bookings/${b.id}/invoice`}
                className="text-sm underline underline-offset-2"
              >
                Invoice
              </Link>
            )}
            {b.status === "completed" && !reviewedBookingIds.has(b.id) && (
              <Link
                href={`/vendor/${b.provider_id}?review=new#reviews`}
                className="btn-raised inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold"
              >
                Leave a review
              </Link>
            )}
            {b.status === "completed" && reviewedBookingIds.has(b.id) && (
              <span className="text-sm text-muted-foreground">You reviewed this booking</span>
            )}
          </div>
          {jobCardByBooking.get(b.id)?.jobCard && (
            <JobCardPanel
              jobCard={jobCardByBooking.get(b.id)!.jobCard!}
              checklist={jobCardByBooking.get(b.id)!.checklist}
              viewer="organiser"
            />
          )}
        </article>
      ))}
    </div>
  );
}
