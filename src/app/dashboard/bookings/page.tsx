import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsStatus } from "@/lib/payments/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { BookingList } from "@/components/booking-list";
import { getJobCardForBooking } from "@/lib/data/job-cards";
import { BOOKING_COLUMNS } from "@/lib/public-columns";
import { sydneyDate } from "@/lib/event-dates";

export const metadata: Metadata = {
  title: "Confirmed bookings",
  robots: { index: false, follow: false },
};


export default async function CustomerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ accepted?: string }>;
}) {
  // ?accepted=1: the customer just accepted a quote (QuoteActions).
  const justAccepted = (await searchParams).accepted === "1";
  const paymentsOn = justAccepted && (await getPaymentsStatus()).enabled;
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/bookings");

  const supabase = await createClient();
  const [{ data: bookings, error }, { data: myReviews }] = await Promise.all([
    supabase
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("client_user_id", session.user.id)
      .order("event_date", { ascending: false }),
    supabase.from("reviews").select("booking_id").eq("reviewer_user_id", session.user.id),
  ]);
  if (error) throw new Error(error.message);

  const reviewedBookingIds = new Set(
    (myReviews ?? []).map((r) => r.booking_id).filter((id): id is string => !!id)
  );

  const jobCards = await Promise.all(
    (bookings ?? [])
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .map(async (b) => [b.id, await getJobCardForBooking(b.id)] as const)
  );
  const jobCardByBooking = new Map(jobCards);

  // A booking only counts as confirmed once the vendor confirms it; until
  // then it's shown separately as waiting on the vendor.
  const today = sydneyDate();
  const all = bookings ?? [];
  const groups = [
    { id: "waiting", title: "Waiting for the vendor to confirm", rows: all.filter((b) => b.status === "pending") },
    {
      id: "upcoming",
      title: "Upcoming",
      rows: all.filter((b) => b.status === "confirmed" && b.event_date >= today).reverse(),
    },
    {
      id: "completed",
      title: "Completed",
      rows: all.filter((b) => b.status === "completed" || (b.status === "confirmed" && b.event_date < today)),
    },
    { id: "cancelled", title: "Cancelled", rows: all.filter((b) => b.status === "cancelled") },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="min-h-full bg-canvas">
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-title">Bookings</h1>
      <p className="mb-6 text-[15px] text-muted-foreground">
        Confirmed bookings: details, payments and progress. Cancellation and refund terms are on each
        booking.
      </p>

      <DashboardNav tabs="customerBookingsTabs" label="Booking sections" />

      {justAccepted && (
        <div role="status" className="surface-raised mb-6 rounded-card px-5 py-4 text-sm ring-1 ring-success/25">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <CheckCircle2 className="size-5 text-success-text" aria-hidden /> Quote accepted — your booking request is in
          </p>
          <p className="mt-1 text-muted-foreground">
            The vendor now confirms the booking. We&apos;ll email you as soon as they do.
            {!paymentsOn && " Then pay them directly, on the terms in their quote — Evntly doesn't take booking payments."}
          </p>
        </div>
      )}

      {all.length === 0 ? (
        <div className="surface-raised flex flex-col items-center rounded-card px-6 py-12 text-center">
          <CalendarClock className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 font-semibold">No bookings yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">When you accept a quote it becomes a booking here.</p>
          <Link href="/dashboard/quotes" className="btn-raised mt-5 inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold">
            View your requests &amp; quotes
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`bookings-${g.id}`}>
              <h2 id={`bookings-${g.id}`} className="text-eyebrow mb-3 text-muted-foreground">
                {g.title} ({g.rows.length})
              </h2>
              <BookingList
                bookings={g.rows}
                jobCardByBooking={jobCardByBooking}
                reviewedBookingIds={reviewedBookingIds}
              />
            </section>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
