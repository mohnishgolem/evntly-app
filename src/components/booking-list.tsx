import Link from "next/link";
import { LeaveReview } from "@/components/leave-review";
import { CancelBookingButton } from "@/components/cancel-booking-button";
import { JobCardPanel } from "@/components/job-card-panel";
import type { getJobCardForBooking } from "@/lib/data/job-cards";
import type { ParticipantBooking } from "@/lib/public-columns";
import type { PaymentSummary } from "@/lib/event-board";

type Booking = ParticipantBooking;
type JobCardResult = Awaited<ReturnType<typeof getJobCardForBooking>>;

const PAYMENT_TONE: Record<PaymentSummary["tone"], string> = {
  neutral: "text-muted-foreground",
  attention: "text-warning",
  active: "text-primary",
  success: "text-success",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-warning",
  confirmed: "text-primary",
  completed: "text-success",
  cancelled: "text-muted-foreground",
};

export function BookingList({
  bookings,
  jobCardByBooking,
  reviewedBookingIds,
  payments,
  conversationIds = [],
}: {
  bookings: Booking[];
  /** The viewer's existing conversations; a booking links to its thread only when one exists. */
  conversationIds?: string[];
  jobCardByBooking: Map<string, JobCardResult>;
  reviewedBookingIds: Set<string>;
  /** Payment status per booking id, shown under the price (Event Board). */
  payments?: Map<string, PaymentSummary>;
}) {
  const threads = new Set(conversationIds);
  return (
    <div className="space-y-4">
      {bookings.map((b) => (
        <div key={b.id} className="rounded-2xl border border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href={`/vendor/${b.provider_id}`} className="font-semibold hover:underline">
                {b.provider_name ?? "Vendor"}
              </Link>
              <p className="text-sm text-muted-foreground">
                {b.event_date}
                {b.event_address ? ` · ${b.event_address}` : ""}
              </p>
              {!!b.total_price && <p className="text-sm font-semibold">${b.total_price}</p>}
              {payments?.get(b.id) && b.status !== "cancelled" && (
                <p className={`text-sm font-medium ${PAYMENT_TONE[payments.get(b.id)!.tone]}`}>
                  {payments.get(b.id)!.label}
                </p>
              )}
            </div>
            <span className={`text-sm font-medium capitalize ${STATUS_COLOR[b.status] ?? ""}`}>
              {b.status}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href={`/bookings/${b.id}`} className="text-sm font-medium underline underline-offset-2">
              Booking & payments
            </Link>
            {b.status !== "cancelled" && b.status !== "completed" && (
              <CancelBookingButton bookingId={b.id} />
            )}
            {b.client_user_id && threads.has(`${b.provider_id}:${b.client_user_id}`) && (
              <Link
                href={`/messages/${encodeURIComponent(`${b.provider_id}:${b.client_user_id}`)}`}
                className="text-sm underline underline-offset-2"
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
              <LeaveReview providerId={b.provider_id} bookingId={b.id} eventType={b.service_type} />
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
        </div>
      ))}
    </div>
  );
}
