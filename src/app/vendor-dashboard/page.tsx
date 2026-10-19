import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock, ShieldCheck, XCircle, PauseCircle, ImagePlus } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard-nav";
import { VENDOR_NAV_ITEMS } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Vendor dashboard",
  robots: { index: false, follow: false },
};

const STATUS_META: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  pending_review: { icon: Clock, label: "Under review", color: "text-warning" },
  approved: { icon: ShieldCheck, label: "Live", color: "text-success" },
  rejected: { icon: XCircle, label: "Not approved", color: "text-destructive" },
  suspended: { icon: PauseCircle, label: "Suspended", color: "text-muted-foreground" },
};

export default async function VendorDashboardPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard");

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

  const [{ data: unreadCount }, { data: portfolioRows }] = await Promise.all([
    supabase.rpc("my_unread_message_count"),
    supabase
      .from("portfolio_items")
      .select("provider_id")
      .in("provider_id", listings.map((l) => l.id)),
  ]);
  const listingsWithPhotos = new Set((portfolioRows ?? []).map((r) => r.provider_id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Your listings</h1>

      <DashboardNav items={VENDOR_NAV_ITEMS} />

      {!!unreadCount && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          You have {unreadCount} unread message{unreadCount === 1 ? "" : "s"}.{" "}
          <Link href="/messages" className="font-medium underline underline-offset-2">
            View
          </Link>
        </div>
      )}

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
              <div className="mt-3 flex gap-4">
                <Link
                  href={`/vendor-dashboard/edit/${listing.id}`}
                  className="text-sm underline underline-offset-2"
                >
                  Edit listing
                </Link>
                {listing.status === "approved" && (
                  <Link
                    href={`/vendor/${listing.id}`}
                    className="text-sm underline underline-offset-2"
                  >
                    View public listing
                  </Link>
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
