import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { BookingList } from "@/components/booking-list";
import { getJobCardForBooking } from "@/lib/data/job-cards";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/events", label: "My Events" },
  { href: "/dashboard/event-feed", label: "Event Feed" },
  { href: "/dashboard/quotes", label: "Quotes" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/bundles", label: "Bundles" },
  { href: "/messages", label: "Messages" },
];

export default async function CustomerBookingsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/bookings");

  const email = session.user.email as string;
  const supabase = await createClient();
  const [{ data: bookings }, { data: myReviews }] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("client_email", email)
      .order("event_date", { ascending: false }),
    supabase.from("reviews").select("booking_id").eq("reviewer_email", email),
  ]);

  const reviewedBookingIds = new Set(
    (myReviews ?? []).map((r) => r.booking_id).filter((id): id is string => !!id)
  );

  const jobCards = await Promise.all(
    (bookings ?? [])
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .map(async (b) => [b.id, await getJobCardForBooking(b.id)] as const)
  );
  const jobCardByBooking = new Map(jobCards);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Your bookings</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Bookings created from accepted quotes.
      </p>

      <DashboardNav items={NAV_ITEMS} />

      {!bookings || bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="mb-4 text-muted-foreground">No bookings yet.</p>
          <Link
            href="/dashboard/quotes"
            className="text-sm font-semibold underline underline-offset-2"
          >
            View your quote requests
          </Link>
        </div>
      ) : (
        <BookingList
          bookings={bookings}
          jobCardByBooking={jobCardByBooking}
          reviewedBookingIds={reviewedBookingIds}
        />
      )}
    </div>
  );
}
