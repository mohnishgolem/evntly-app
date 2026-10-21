import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { requireAdminPage } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { eventTitle, formatEventDay } from "@/components/event-board/board-cards";
import { Input } from "@/components/ui/input";
import { sydneyDate } from "@/lib/event-dates";

export const metadata: Metadata = {
  title: "Events",
  robots: { index: false, follow: false },
};

const LIMIT = 200;

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ q?: string; when?: string }> }) {
  const { needsEnrol } = await requireAdminPage("/admin/events");
  if (needsEnrol) return <AdminMfaRequired />;
  const { q = "", when = "upcoming" } = await searchParams;

  // events_select_admin (RLS) is what lets an admin read other people's
  // events; this page adds nothing on top of it.
  const supabase = await createClient();
  let query = supabase
    .from("events")
    .select("id, name, event_type, suburb, event_date, organiser_email, required_services, budget_total, created_at")
    .order("event_date", { ascending: when !== "past" })
    .limit(LIMIT);
  const today = sydneyDate();
  query = when === "past" ? query.lt("event_date", today) : query.gte("event_date", today);
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`organiser_email.ilike.%${term}%,suburb.ilike.%${term}%,name.ilike.%${term}%,id.eq.${term}`);
  const { data: events, error } = await query;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading title="Events" description="Every customer's Event Board, read-only. Use it to answer support questions." />

      <form className="mb-4 flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Email, suburb, name or event id" className="h-11 pl-9" aria-label="Search events" />
        </div>
        <input type="hidden" name="when" value={when} />
      </form>
      <nav aria-label="Event dates" className="mb-4 flex gap-2">
        {[
          { key: "upcoming", label: "Upcoming" },
          { key: "past", label: "Past" },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/admin/events?when=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            aria-current={when === t.key ? "page" : undefined}
            className={
              when === t.key
                ? "inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background"
                : "inline-flex h-10 items-center rounded-full border border-border px-4 text-sm text-muted-foreground"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {error ? (
        <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Couldn&apos;t load events: {error.message}
        </p>
      ) : !events?.length ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No events found.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/admin/events/${e.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-muted/60">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{eventTitle(e)}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {formatEventDay(e.event_date, true)} · {e.organiser_email} · {e.required_services.length} categories
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {events?.length === LIMIT && <p className="mt-3 text-xs text-muted-foreground">Showing the first {LIMIT}. Search to narrow down.</p>}
    </div>
  );
}
