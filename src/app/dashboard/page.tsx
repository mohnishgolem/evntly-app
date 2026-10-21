import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { PlanClaimer } from "@/components/plan-claimer";
import { DashboardNav } from "@/components/dashboard-nav";
import { EventSummaryCard } from "@/components/event-board/board-cards";
import { Button } from "@/components/ui/button";
import { planningProgress } from "@/lib/event-board";
import { sydneyDate } from "@/lib/event-dates";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard");

  const supabase = await createClient();
  const [{ data: events }, { data: bookings }] = await Promise.all([
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
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 lg:max-w-4xl">
      <PlanClaimer />

      <h1 className="mb-1 text-2xl font-bold">
        {session.displayName ? `Welcome, ${session.displayName}` : "Your dashboard"}
      </h1>

      <DashboardNav tabs="customerTabs" />

      {events && events.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Upcoming events</h2>
            <Link href="/dashboard/events" className="flex h-11 items-center text-sm font-medium underline underline-offset-2">
              All events
            </Link>
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {events.map((e) => (
              <li key={e.id}>
                <EventSummaryCard
                  event={e}
                  href={`/dashboard/events/${e.id}`}
                  className="h-full"
                  progress={planningProgress(
                    e.required_services,
                    (bookings ?? []).filter((b) => b.event_id === e.id)
                  )}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-border py-12 text-center">
          <p className="mb-4 text-muted-foreground">You haven&apos;t started planning an event yet.</p>
          <Button size="lg" nativeButton={false} render={<Link href="/plan">Start planning</Link>} />
        </div>
      )}
    </div>
  );
}
