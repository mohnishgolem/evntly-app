import type { Metadata } from "next";
import Link from "next/link";
import { categoryLabel } from "@/lib/config";
import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { ApplyToEventForm } from "@/components/apply-to-event-form";
import { DashboardNav } from "@/components/dashboard-nav";

export const metadata: Metadata = {
  title: "Event feed",
  robots: { index: false, follow: false },
};

export default async function VendorEventFeedPage() {
  const session = await requireVendor("/vendor-dashboard/event-feed");

  const supabase = await createClient();

  const { data: vendor } = await supabase
    .rpc("my_service_providers")
    .select("*")
    .maybeSingle();

  if (!vendor) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">You don&apos;t have a listing yet</h1>
        <p className="mb-6 text-muted-foreground">
          Set up your vendor profile to start applying to events.
        </p>
        <Link href="/vendor-signup" className="font-semibold underline underline-offset-2">
          Create my listing
        </Link>
      </div>
    );
  }

  if (vendor.status !== "approved") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-1 text-2xl font-bold">Event Feed</h1>
        <DashboardNav tabs="vendorLeadsTabs" label="Lead types" />
        <p className="text-sm text-muted-foreground">
          Your listing needs to be approved before you can apply to events.
        </p>
      </div>
    );
  }

  const [{ data: listings }, { data: myApplications }] = await Promise.all([
    supabase
      .from("event_listings")
      .select("*")
      .eq("status", "open")
      .contains("required_services", [vendor.service_type])
      .order("created_at", { ascending: false }),
    supabase.from("event_applications").select("listing_id, status").eq("vendor_user_id", session.user.id),
  ]);

  const appliedListingIds = new Set((myApplications ?? []).map((a) => a.listing_id));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Event Feed</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Customers looking for a {categoryLabel(vendor.service_type).toLowerCase()} — apply with a
        pitch and a price.
      </p>

      <DashboardNav tabs="vendorLeadsTabs" label="Lead types" />

      {!listings || listings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open events right now. Check back soon.</p>
      ) : (
        <div className="space-y-4">
          {listings.map((listing) => {
            const applied = appliedListingIds.has(listing.id);
            return (
              <div key={listing.id} className="rounded-2xl border border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {listing.event_type} in {listing.suburb} on {listing.event_date}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Needs {listing.required_services.map(categoryLabel).join(", ")}
                      {listing.guest_count ? ` · ${listing.guest_count} guests` : ""}
                      {listing.budget_band ? ` · Budget ${listing.budget_band}` : ""}
                    </p>
                    {listing.notes && <p className="mt-1 text-sm">{listing.notes}</p>}
                  </div>
                  {applied ? (
                    <span className="shrink-0 text-sm font-medium text-muted-foreground">
                      Applied
                    </span>
                  ) : (
                    <ApplyToEventForm listingId={listing.id} />
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
