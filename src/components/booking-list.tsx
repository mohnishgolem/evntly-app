import Link from "next/link";
import { LeaveReview } from "@/components/leave-review";
import { CancelBookingButton } from "@/components/cancel-booking-button";
import { JobCardPanel } from "@/components/job-card-panel";
import type { getJobCardForBooking } from "@/lib/data/job-cards";
import type { Database } from "@/lib/supabase/database.types";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type JobCardResult = Awaited<ReturnType<typeof getJobCardForBooking>>;

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
}: {
  bookings: Booking[];
  jobCardByBooking: Map<string, JobCardResult>;
  reviewedBookingIds: Set<string>;
}) {
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
            </div>
            <span className={`text-sm font-medium capitalize ${STATUS_COLOR[b.status] ?? ""}`}>
              {b.status}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {b.status !== "cancelled" && b.status !== "completed" && (
              <CancelBookingButton bookingId={b.id} />
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
