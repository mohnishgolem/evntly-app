import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock, ShieldCheck, XCircle, PauseCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard-nav";

const NAV_ITEMS = [
  { href: "/vendor-dashboard", label: "Listings" },
  { href: "/vendor-dashboard/quotes", label: "Quotes" },
  { href: "/vendor-dashboard/bookings", label: "Bookings" },
  { href: "/vendor-dashboard/bundles", label: "Bundles" },
  { href: "/vendor-dashboard/portfolio", label: "Portfolio" },
  { href: "/messages", label: "Messages" },
];

const STATUS_META: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  pending_review: { icon: Clock, label: "Under review", color: "text-amber-600" },
  approved: { icon: ShieldCheck, label: "Live", color: "text-green-600" },
  rejected: { icon: XCircle, label: "Not approved", color: "text-destructive" },
  suspended: { icon: PauseCircle, label: "Suspended", color: "text-muted-foreground" },
};

export default async function VendorDashboardPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard");

  const supabase = await createClient();
  const { data: listings } = await supabase
    .from("service_providers")
    .select("*")
    .eq("owner_email", session.user.email as string)
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

  const { count: unreadCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_email", session.user.email as string)
    .eq("read", false);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Your listings</h1>

      <DashboardNav items={NAV_ITEMS} />

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
              {listing.status === "approved" && (
                <Link
                  href={`/vendor/${listing.id}`}
                  className="mt-3 inline-block text-sm underline underline-offset-2"
                >
                  View public listing
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
