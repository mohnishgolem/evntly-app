import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { LeaveReview } from "@/components/leave-review";
import { CancelBookingButton } from "@/components/cancel-booking-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { JobCardPanel } from "@/components/job-card-panel";
import { getJobCardForBooking } from "@/lib/data/job-cards";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/quotes", label: "Quotes" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/bundles", label: "Bundles" },
  { href: "/messages", label: "Messages" },
];

const STATUS_COLOR: Record<string, string> = {
  pending: "text-warning",
  confirmed: "text-primary",
  completed: "text-success",
  cancelled: "text-muted-foreground",
};

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

  const reviewedBookingIds = new Set((myReviews ?? []).map((r) => r.booking_id));

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
                  {!!b.total_price && (
                    <p className="text-sm font-semibold">${b.total_price}</p>
                  )}
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
                  <LeaveReview
                    providerId={b.provider_id}
                    bookingId={b.id}
                    eventType={b.service_type}
                  />
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
      )}
    </div>
  );
}
