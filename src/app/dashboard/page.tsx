import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { VendorCard } from "@/components/vendor-card";
import { PlanClaimer } from "@/components/plan-claimer";
import { DashboardNav } from "@/components/dashboard-nav";
import { categoryLabel } from "@/lib/config";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/database.types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/event-feed", label: "Event Feed" },
  { href: "/dashboard/quotes", label: "Quotes" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/bundles", label: "Bundles" },
  { href: "/messages", label: "Messages" },
];

type Vendor = Database["public"]["Tables"]["service_providers"]["Row"];

export default async function DashboardPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard");

  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("organiser_email", session.user.email as string)
    .order("created_at", { ascending: false });

  const latestPlan = events?.[0] ?? null;

  let shortlist: Vendor[] | null = null;
  if (latestPlan?.required_services?.length) {
    const { data } = await supabase
      .from("service_providers")
      .select("*")
      .eq("status", "approved")
      .in("service_type", latestPlan.required_services)
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(8);
    shortlist = data;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PlanClaimer />

      <h1 className="mb-1 text-2xl font-bold">
        {session.displayName ? `Welcome, ${session.displayName}` : "Your dashboard"}
      </h1>

      <DashboardNav items={NAV_ITEMS} />

      {latestPlan ? (
        <>
          <p className="mb-6 text-muted-foreground">
            Planning a <strong>{latestPlan.event_type}</strong> in {latestPlan.suburb} on{" "}
            {latestPlan.event_date} for {latestPlan.guest_count} guests — budget $
            {latestPlan.budget_total.toLocaleString()}.
          </p>

          <section>
            <h2 className="mb-4 text-lg font-semibold">
              Your vendor shortlist ({latestPlan.required_services.map(categoryLabel).join(", ")})
            </h2>
            {shortlist && shortlist.length > 0 ? (
              <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
                {shortlist.map((v) => (
                  <VendorCard
                    key={v.id}
                    vendor={v}
                    saved={(session.profile?.saved_providers ?? []).includes(v.id)}
                    isAuthenticated
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No matching vendors yet — check back soon, or{" "}
                <Link href="/explore" className="underline underline-offset-2">
                  browse everyone
                </Link>
                .
              </p>
            )}
          </section>
        </>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-border py-12 text-center">
          <p className="mb-4 text-muted-foreground">You haven&apos;t started planning an event yet.</p>
          <Button nativeButton={false} render={<Link href="/plan">Start planning</Link>} />
        </div>
      )}
    </div>
  );
}
