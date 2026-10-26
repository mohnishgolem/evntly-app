import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { BookingList } from "@/components/booking-list";
import { getJobCardForBooking } from "@/lib/data/job-cards";
import { BOOKING_COLUMNS } from "@/lib/public-columns";
import { sydneyDate } from "@/lib/event-dates";

export const metadata: Metadata = {
  title: "Confirmed bookings",
  robots: { index: false, follow: false },
};


export default async function CustomerBookingsPage() {
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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Bookings</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Confirmed bookings: details, payments and progress. Cancellation and refund terms are on each
        booking.
      </p>

      <DashboardNav tabs="customerBookingsTabs" label="Booking sections" />

      {all.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="mb-4 text-muted-foreground">No bookings yet.</p>
          <Link href="/dashboard/quotes" className="text-sm font-semibold underline underline-offset-2">
            View your requests &amp; quotes
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`bookings-${g.id}`}>
              <h2 id={`bookings-${g.id}`} className="mb-3 text-sm font-semibold text-muted-foreground">
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
  );
}
