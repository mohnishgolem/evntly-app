import { redirect } from "next/navigation";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/config";
import { PostEventButton } from "@/components/post-event-button";
import { CloseListingButton } from "@/components/close-listing-button";
import { EventApplicationActions } from "@/components/event-application-actions";
import { DashboardNav } from "@/components/dashboard-nav";
import type { Database } from "@/lib/supabase/database.types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/events", label: "My Events" },
  { href: "/dashboard/event-feed", label: "Event Feed" },
  { href: "/dashboard/quotes", label: "Quotes" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/bundles", label: "Bundles" },
  { href: "/messages", label: "Messages" },
];

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "Waiting for your response", className: "text-warning" },
  accepted: { label: "Accepted", className: "text-success" },
  declined: { label: "Declined", className: "text-destructive" },
};

type EventListing = Database["public"]["Tables"]["event_listings"]["Row"];
type EventApplication = Database["public"]["Tables"]["event_applications"]["Row"];

export default async function EventFeedPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/event-feed");

  const email = session.user.email as string;
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("organiser_email", email)
    .order("created_at", { ascending: false });

  const eventIds = (events ?? []).map((e) => e.id);
  let listings: EventListing[] = [];
  if (eventIds.length > 0) {
    const { data } = await supabase
      .from("event_listings")
      .select("*")
      .in("source_event_id", eventIds)
      .order("created_at", { ascending: false });
    listings = data ?? [];
  }

  const listingIds = listings.map((l) => l.id);
  let applications: EventApplication[] = [];
  if (listingIds.length > 0) {
    const { data } = await supabase
      .from("event_applications")
      .select("*")
      .in("listing_id", listingIds)
      .order("created_at", { ascending: false });
    applications = data ?? [];
  }

  const latestEvent = events?.[0] ?? null;
  const latestEventHasListing = listings.some((l) => l.source_event_id === latestEvent?.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Event Feed</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Post your event publicly and let vendors come to you with a pitch and a price.
      </p>

      <DashboardNav items={NAV_ITEMS} />

      {!latestEvent ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <p className="mb-4 text-muted-foreground">Plan an event first to post it to the feed.</p>
        </div>
      ) : (
        !latestEventHasListing && (
          <div className="mb-8 rounded-2xl border border-border p-5">
            <p className="mb-1 font-semibold">
              {latestEvent.event_type} in {latestEvent.suburb} on {latestEvent.event_date}
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              Not posted yet — post it so vendors can apply directly.
            </p>
            <PostEventButton eventId={latestEvent.id} />
          </div>
        )
      )}

      {listings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {latestEvent ? "You haven't posted any events to the feed yet." : ""}
        </p>
      ) : (
        <div className="space-y-6">
          {listings.map((listing) => {
            const listingApplications = applications.filter((a) => a.listing_id === listing.id);
            return (
              <div key={listing.id} className="rounded-2xl border border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {listing.event_type} in {listing.suburb} on {listing.event_date}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Needs {listing.required_services.map(categoryLabel).join(", ")}
                      {listing.budget_band ? ` · Budget ${listing.budget_band}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-muted-foreground capitalize">
                    {listing.status}
                  </span>
                </div>

                {listing.status === "open" && <CloseListingButton listingId={listing.id} />}

                <div className="mt-4 space-y-3">
                  {listingApplications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No applications yet.</p>
                  ) : (
                    listingApplications.map((app) => {
                      const meta = STATUS_META[app.status] ?? STATUS_META.pending;
                      return (
                        <div key={app.id} className="rounded-xl bg-secondary p-3">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium">{app.vendor_name ?? app.vendor_email}</p>
                              <p className="text-sm text-muted-foreground">
                                {categoryLabel(app.service_type)} · ${app.quoted_amount}
                              </p>
                              {app.pitch && <p className="mt-1 text-sm">{app.pitch}</p>}
                            </div>
                            <span
                              className={`flex shrink-0 items-center gap-1.5 text-sm font-medium ${meta.className}`}
                            >
                              {app.status === "accepted" ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : app.status === "declined" ? (
                                <XCircle className="h-4 w-4" />
                              ) : (
                                <Clock className="h-4 w-4" />
                              )}
                              {meta.label}
                            </span>
                          </div>
                          {app.status === "pending" && (
                            <EventApplicationActions applicationId={app.id} />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
