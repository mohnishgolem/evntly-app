import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { getJobCardForBooking } from "@/lib/data/job-cards";
import { JobCardPanel } from "@/components/job-card-panel";
import { EventTaskList } from "@/components/event-task-list";

export default async function EventDayPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/events");

  const { id } = await params;
  const email = session.user.email as string;
  const supabase = await createClient();

  const [{ data: event }, { data: tasks }] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).eq("organiser_email", email).maybeSingle(),
    supabase.from("event_tasks").select("*").eq("event_id", id).order("created_at"),
  ]);

  if (!event) notFound();

  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("event_id", id)
    .eq("client_email", email)
    .neq("status", "cancelled");

  const jobCards = await Promise.all(
    (bookings ?? []).map(async (b) => [b.id, await getJobCardForBooking(b.id)] as const)
  );
  const jobCardByBooking = new Map(jobCards);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href={`/dashboard/events/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Event board
      </Link>
      <h1 className="mb-1 text-2xl font-bold">Event day</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {event.event_type} in {event.suburb} · {event.event_date}
      </p>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Your vendor team</h2>
        {!bookings || bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No confirmed vendors for this event.</p>
        ) : (
          <div className="space-y-4">
            {bookings.map((b) => {
              const result = jobCardByBooking.get(b.id);
              return (
                <div key={b.id} className="rounded-2xl border border-border p-5">
                  <p className="font-semibold">{b.provider_name ?? "Vendor"}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {b.service_type.replace(/_/g, " ")} · {b.status}
                  </p>
                  {result?.jobCard && (
                    <JobCardPanel
                      jobCard={result.jobCard}
                      checklist={result.checklist}
                      viewer="organiser"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Run sheet</h2>
        <EventTaskList eventId={id} tasks={tasks ?? []} />
      </section>
    </div>
  );
}
