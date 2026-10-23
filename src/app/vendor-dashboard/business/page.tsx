import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ShieldCheck, XCircle, PauseCircle, ImagePlus, Eye, PencilLine, Images, Tags, CalendarDays } from "lucide-react";
import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard-nav";
import { ListingPauseToggle } from "@/components/listing-pause-toggle";

export const metadata: Metadata = {
  title: "Listings",
  robots: { index: false, follow: false },
};

const STATUS_META: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  pending_review: { icon: Clock, label: "Under review", color: "text-warning" },
  approved: { icon: ShieldCheck, label: "Live", color: "text-success" },
  rejected: { icon: XCircle, label: "Not approved", color: "text-destructive" },
  suspended: { icon: PauseCircle, label: "Suspended", color: "text-muted-foreground" },
};

export default async function VendorBusinessPage() {
  await requireVendor("/vendor-dashboard/business");

  const supabase = await createClient();
  const { data: listings } = await supabase
    .rpc("my_service_providers")
    .select("*")
    .order("created_at", { ascending: false });

  if (!listings || listings.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">You don&apos;t have a listing yet</h1>
        <p className="mb-6 text-muted-foreground">
          Set up your vendor profile to start appearing in Evntly search.
        </p>
        <Button nativeButton={false} render={<Link href="/vendor-signup">Create my listing</Link>} />
      </div>
    );
  }

  const { data: portfolioRows } = await supabase
    .from("portfolio_items")
    .select("provider_id")
    .in("provider_id", listings.map((l) => l.id));
  const listingsWithPhotos = new Set((portfolioRows ?? []).map((r) => r.provider_id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Listings</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        What customers see: your details, photos, pricing and availability.
      </p>

      <DashboardNav tabs="vendorListingsTabs" label="Listing sections" />

      <div className="space-y-4">
        {listings.map((listing) => {
          const meta = STATUS_META[listing.status ?? "pending_review"] ?? STATUS_META.pending_review;
          const Icon = meta.icon;
          return (
            <div key={listing.id} className="rounded-2xl border border-border p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{listing.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {categoryLabel(listing.service_type)} · ${listing.hourly_rate}/hr
                  </p>
                </div>
                <span className={`flex items-center gap-1.5 text-sm font-medium ${meta.color}`}>
                  <Icon className="h-4 w-4" /> {meta.label}
                </span>
              </div>
              {listing.available === false && listing.status === "approved" && (
                <p className="mt-2 text-sm text-warning">Paused: customers can see it but can&apos;t request quotes.</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { href: `/vendor-dashboard/edit/${listing.id}`, icon: PencilLine, label: "Edit details" },
                  { href: "/vendor-dashboard/portfolio", icon: Images, label: "Photos & videos" },
                  { href: "/vendor-dashboard/pricing", icon: Tags, label: "Pricing & packages" },
                  { href: "/vendor-dashboard/calendar", icon: CalendarDays, label: "Availability" },
                ].map((a) => (
                  <Link
                    key={a.label}
                    href={a.href}
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <a.icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                    {a.label}
                  </Link>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {listing.status === "approved" && (
                  <>
                    <Link
                      href={`/vendor/${listing.id}`}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline underline-offset-2 sm:min-h-9"
                    >
                      <Eye className="size-4" aria-hidden /> Preview as a customer
                    </Link>
                    <ListingPauseToggle listingId={listing.id} accepting={listing.available !== false} />
                  </>
                )}
                {listing.status === "pending_review" && (
                  <p className="text-sm text-muted-foreground">
                    It goes live once our team approves it. We&apos;ll email you.
                  </p>
                )}
              </div>
              {!listingsWithPhotos.has(listing.id) && (
                <Link
                  href="/vendor-dashboard/portfolio"
                  className="mt-4 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
                >
                  <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <span className="font-medium">Add photos of your work.</span> Organisers compare
                    portfolios before asking for a quote, and listings without photos are easy to skip.
                  </span>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
