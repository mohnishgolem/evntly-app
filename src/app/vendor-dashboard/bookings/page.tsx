import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { VendorBookingActions } from "@/components/vendor-booking-actions";
import { DashboardNav } from "@/components/dashboard-nav";
import { JobCardPanel } from "@/components/job-card-panel";
import { getJobCardForBooking } from "@/lib/data/job-cards";

const NAV_ITEMS = [
  { href: "/vendor-dashboard", label: "Listings" },
  { href: "/vendor-dashboard/event-feed", label: "Event Feed" },
  { href: "/vendor-dashboard/quotes", label: "Quotes" },
  { href: "/vendor-dashboard/bookings", label: "Bookings" },
  { href: "/vendor-dashboard/bundles", label: "Bundles" },
  { href: "/vendor-dashboard/portfolio", label: "Portfolio" },
  { href: "/messages", label: "Messages" },
];

const STATUS_COLOR: Record<string, string> = {
  pending: "text-warning",
  confirmed: "text-primary",
  completed: "text-success",
  cancelled: "text-muted-foreground",
};

export default async function VendorBookingsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard/bookings");

  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("provider_owner_email", session.user.email as string)
    .order("event_date", { ascending: false });

  const jobCards = await Promise.all(
    (bookings ?? [])
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .map(async (b) => [b.id, await getJobCardForBooking(b.id)] as const)
  );
  const jobCardByBooking = new Map(jobCards);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Bookings</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Bookings from accepted quotes, in one place.
      </p>

      <DashboardNav items={NAV_ITEMS} />

      {!bookings || bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bookings yet.</p>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => (
            <div key={b.id} className="rounded-2xl border border-border p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{b.client_name ?? b.client_email}</p>
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
              <VendorBookingActions bookingId={b.id} status={b.status} />
              {jobCardByBooking.get(b.id)?.jobCard && (
                <JobCardPanel
                  jobCard={jobCardByBooking.get(b.id)!.jobCard!}
                  checklist={jobCardByBooking.get(b.id)!.checklist}
                  viewer="vendor"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
