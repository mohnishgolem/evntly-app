import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { Button } from "@/components/ui/button";
import { EventSummaryCard } from "@/components/event-board/board-cards";
import { planningProgress } from "@/lib/event-board";
import { sydneyDate } from "@/lib/event-dates";

export const metadata: Metadata = {
  title: "My events",
  robots: { index: false, follow: false },
};

export default async function MyEventsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/events");

  const supabase = await createClient();
  const [{ data: events, error }, { data: bookings }] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("organiser_user_id", session.user.id)
      .order("event_date", { ascending: true }),
    supabase
      .from("bookings")
      .select("id, event_id, provider_id, service_type, status, total_price")
      .eq("client_user_id", session.user.id)
      .not("event_id", "is", null),
  ]);

  const today = sydneyDate();
  const upcoming = (events ?? []).filter((e) => e.event_date >= today);
  const past = (events ?? []).filter((e) => e.event_date < today).reverse();
  const progressFor = (eventId: string, services: string[]) =>
    planningProgress(
      services,
      (bookings ?? []).filter((b) => b.event_id === eventId)
    );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 lg:max-w-4xl">
      <div className="mb-1 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">My events</h1>
        <Button size="lg" nativeButton={false} render={<Link href="/plan" />}>
          <Plus aria-hidden /> New event
        </Button>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">Every event you&apos;re planning, each with its own board.</p>

      <DashboardNav tabs="customerTabs" />

      {error ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          We couldn&apos;t load your events. Refresh to try again.
        </div>
      ) : !events || events.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border px-6 py-14 text-center">
          <p className="mb-1 font-semibold">No events yet</p>
          <p className="mb-5 text-sm text-muted-foreground">Tell us about your event and we&apos;ll suggest vendors free on your date.</p>
          <Button size="lg" nativeButton={false} render={<Link href="/plan">Start planning</Link>} />
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <ul className="grid gap-4 md:grid-cols-2">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <EventSummaryCard
                    event={e}
                    href={`/dashboard/events/${e.id}`}
                    progress={progressFor(e.id, e.required_services)}
                    className="h-full"
                  />
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Past events</h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {past.map((e) => (
                  <li key={e.id}>
                    <EventSummaryCard
                      event={e}
                      href={`/dashboard/events/${e.id}`}
                      progress={progressFor(e.id, e.required_services)}
                      className="h-full opacity-80"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
