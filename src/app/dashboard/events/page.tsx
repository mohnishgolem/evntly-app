import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { CUSTOMER_DASHBOARD_TABS } from "@/lib/nav";

export const metadata: Metadata = {
  title: "My events",
  robots: { index: false, follow: false },
};


export default async function MyEventsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/events");

  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("organiser_user_id", session.user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">My events</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Every event you&apos;ve planned, each with its own board.
      </p>

      <DashboardNav items={CUSTOMER_DASHBOARD_TABS} />

      {!events || events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <p className="mb-4 text-muted-foreground">You haven&apos;t planned an event yet.</p>
          <Link href="/plan" className="text-sm font-semibold underline underline-offset-2">
            Start planning
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/dashboard/events/${event.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-accent"
            >
              <div>
                <p className="font-semibold">
                  {event.event_type} in {event.suburb}
                </p>
                <p className="text-sm text-muted-foreground">{event.event_date}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
