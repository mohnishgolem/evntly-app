import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Heart, Search } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlanClaimer } from "@/components/plan-claimer";
import { DashboardNav } from "@/components/dashboard-nav";
import { EventSummaryCard } from "@/components/event-board/board-cards";
import { VendorCard } from "@/components/vendor-card";
import { Button } from "@/components/ui/button";
import { planningProgress } from "@/lib/event-board";
import { sydneyDate } from "@/lib/event-dates";
import { categoryPlural } from "@/lib/config";
import { getFeaturedVendors, searchVendors } from "@/lib/data/vendors";
import { PUBLIC_VENDOR_COLUMNS } from "@/lib/vendor-columns";
import { sampleListingsHidden } from "@/lib/sample-listings";
import type { PublicVendor } from "@/lib/vendor-columns";

export const metadata: Metadata = {
  title: "My events",
  robots: { index: false, follow: false },
};

const RECENT_LIMIT = 4;

// Vendor profiles this customer opened recently, newest first. Page views
// are service-role only, so this reads them server-side for this user only.
async function recentlyViewedVendors(userId: string): Promise<PublicVendor[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data: views } = await admin
    .from("page_views")
    .select("vendor_id, created_at")
    .eq("user_id", userId)
    .eq("kind", "vendor")
    .not("vendor_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);
  const ids = [...new Set((views ?? []).map((v) => v.vendor_id as string))].slice(0, RECENT_LIMIT);
  if (ids.length === 0) return [];

  const supabase = await createClient();
  let query = supabase.from("service_providers").select(PUBLIC_VENDOR_COLUMNS).eq("status", "approved").in("id", ids);
  if (sampleListingsHidden()) query = query.eq("is_demo", false);
  const { data } = await query;
  const byId = new Map((data ?? []).map((v) => [v.id, v as PublicVendor]));
  return ids.map((id) => byId.get(id)).filter((v): v is PublicVendor => !!v);
}

// My Events hub: pick up where you left off, see what's coming, and find
// vendors for what's still missing. Everything comes from the customer's
// own events, bookings, saves and views.
export default async function DashboardPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard");

  const supabase = await createClient();
  const [{ data: events, error: eventsError }, { data: bookings }, recent] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("organiser_user_id", session.user.id)
      .gte("event_date", sydneyDate())
      .order("event_date", { ascending: true })
      .order("id")
      .limit(4),
    supabase
      .from("bookings")
      .select("event_id, service_type, status")
      .eq("client_user_id", session.user.id)
      .not("event_id", "is", null),
    recentlyViewedVendors(session.user.id),
  ]);

  const progressFor = (e: NonNullable<typeof events>[number]) =>
    planningProgress(
      e.required_services,
      (bookings ?? []).filter((b) => b.event_id === e.id)
    );

  // Continue planning: the soonest event that still has categories to book.
  const next = (events ?? []).find((e) => progressFor(e).done < progressFor(e).total) ?? events?.[0];
  const nextProgress = next ? progressFor(next) : null;
  const confirmedCategories = new Set(
    (bookings ?? [])
      .filter((b) => b.event_id === next?.id && (b.status === "confirmed" || b.status === "completed"))
      .map((b) => b.service_type)
  );
  const openCategory = next?.required_services.find((s) => !confirmedCategories.has(s));

  const recommended = (openCategory ? await searchVendors({ category: openCategory }) : await getFeaturedVendors(4)).slice(0, 4);
  const savedIds = new Set(session.profile?.saved_providers ?? []);
  const firstName = session.displayName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 lg:max-w-4xl">
      <PlanClaimer />

      <h1 className="mb-1 text-2xl font-bold">{firstName ? `Hi, ${firstName}` : "My events"}</h1>
      <p className="mb-6 text-sm text-muted-foreground">Your events, plans and vendors in one place.</p>

      <DashboardNav tabs="customerEventsTabs" label="Event sections" />

      <form action="/explore" role="search" className="mb-8 flex gap-2">
        <label htmlFor="quick-search" className="sr-only">
          Search vendors
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id="quick-search"
            name="q"
            type="search"
            placeholder="Search vendors by name, service or suburb"
            className="h-11 w-full rounded-full border border-input bg-transparent pr-4 pl-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" className="h-11 rounded-full px-5">
          Search
        </Button>
      </form>

      {eventsError ? (
        <p className="mb-8 rounded-2xl border border-border px-4 py-4 text-sm text-muted-foreground">
          We couldn&apos;t load your events just now. Refresh to try again.
        </p>
      ) : next && nextProgress ? (
        <section aria-labelledby="continue" className="mb-8">
          <h2 id="continue" className="mb-3 text-lg font-semibold">
            Continue planning
          </h2>
          <Link
            href={`/dashboard/events/${next.id}`}
            className="block rounded-2xl border border-border p-5 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{next.name || next.event_type || "Your event"}</p>
                <p className="text-sm text-muted-foreground">
                  {next.event_date}
                  {next.suburb ? ` · ${next.suburb}` : ""}
                </p>
              </div>
              <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            {nextProgress.total > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {nextProgress.done} of {nextProgress.total} vendors booked
                  </span>
                  <span>{nextProgress.percent}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Planning progress"
                  aria-valuenow={nextProgress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${nextProgress.percent}%` }} />
                </div>
              </div>
            )}
          </Link>
        </section>
      ) : (
        <div className="mb-8 rounded-3xl border border-dashed border-border py-12 text-center">
          <p className="mb-4 text-muted-foreground">You haven&apos;t started planning an event yet.</p>
          <Button size="lg" nativeButton={false} render={<Link href="/plan">Start planning</Link>} />
        </div>
      )}

      {events && events.length > 1 && (
        <section aria-labelledby="upcoming" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="upcoming" className="text-lg font-semibold">
              Upcoming events
            </h2>
            <Link href="/dashboard/events" className="flex h-11 items-center text-sm font-medium underline underline-offset-2">
              All events
            </Link>
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {events.map((e) => (
              <li key={e.id}>
                <EventSummaryCard event={e} href={`/dashboard/events/${e.id}`} className="h-full" progress={progressFor(e)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recommended.length > 0 && (
        <section aria-labelledby="recommended" className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 id="recommended" className="text-lg font-semibold">
              {openCategory ? `${categoryPlural(openCategory).replace(/^./, (c) => c.toUpperCase())} for your event` : "Recommended vendors"}
            </h2>
            <Link
              href={openCategory ? `/explore?category=${openCategory}` : "/explore"}
              className="flex h-11 shrink-0 items-center text-sm font-medium underline underline-offset-2"
            >
              See more
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {recommended.map((v) => (
              <li key={v.id}>
                <VendorCard vendor={v} saved={savedIds.has(v.id)} isAuthenticated />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recent" className="mb-8">
          <h2 id="recent" className="mb-3 text-lg font-semibold">
            Recently viewed
          </h2>
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {recent.map((v) => (
              <li key={v.id}>
                <VendorCard vendor={v} saved={savedIds.has(v.id)} isAuthenticated />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/saved"
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm font-medium outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Heart className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
        <span className="flex-1">Saved vendors ({savedIds.size})</span>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </div>
  );
}
