import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { CategoryArt } from "@/components/category-art";
import { eventTitle, formatEventDay } from "@/components/event-board/board-cards";
import { formatEventTimes, shortTime } from "@/lib/event-times";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];

/** The illustration on the event's cover, when nothing is booked yet. */
const COVER_BY_TYPE: Record<string, string> = {
  Wedding: "florist",
  Engagement: "photographer",
  Birthday: "cakes_desserts",
  Corporate: "mc",
  Cultural: "decorator",
  Party: "dj",
};

export function coverCategory(eventType: string, booked: string[]) {
  return booked[0] ?? COVER_BY_TYPE[eventType] ?? "decorator";
}

// The summary at the top of the planner: what, when, where, how close it is
// and how far along the planning is. Compact on purpose; details live below.
export function EventOverview({
  event,
  cover,
  countdown,
  progress,
  settings,
}: {
  event: Event;
  cover: string;
  countdown: { days: number; label: string };
  progress: { percent: number; tasksDone: number; tasksTotal: number; vendorsDone: number; vendorsTotal: number };
  settings: React.ReactNode;
}) {
  const times = event.start_time && event.end_time ? formatEventTimes(shortTime(event.start_time), shortTime(event.end_time)) : null;
  const past = countdown.days < 0;
  return (
    <header className="surface-raised overflow-hidden rounded-card">
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-tile bg-[image:var(--gradient-tile)] shadow-[var(--shadow-pressed)] sm:size-28">
          <CategoryArt value={cover} eager className="absolute inset-1.5 size-[calc(100%-0.75rem)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="pt-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{event.event_type}</p>
            <div className="-mt-1.5 -mr-1.5 shrink-0">{settings}</div>
          </div>
          <h1 className="text-xl leading-tight font-bold tracking-tight text-pretty sm:text-2xl">{eventTitle(event)}</h1>
          <p
            className={cn(
              "mt-2 inline-flex h-7 items-center rounded-full px-2.5 text-[13px] font-semibold",
              past ? "surface-pressed text-muted-foreground" : "bg-primary/10 text-primary-text"
            )}
          >
            {countdown.label}
          </p>
        </div>
      </div>

      <dl className="flex flex-col gap-x-6 gap-y-2 border-t border-border/70 px-4 py-3.5 text-sm sm:flex-row sm:flex-wrap sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Date</dt>
          <dd className="truncate">{formatEventDay(event.event_date)}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Time</dt>
          <dd className={cn("truncate", !times && "text-muted-foreground")}>{times ?? "Time not set"}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Location and guests</dt>
          <dd className={cn("truncate", !event.suburb?.trim() && "text-muted-foreground")}>
            {event.suburb?.trim() || "Location not set"}
            {event.guest_count && (
              <span className="text-muted-foreground">
                {" "}
                · <Users className="inline size-3.5 -translate-y-px" aria-hidden /> {event.guest_count}
              </span>
            )}
          </dd>
        </div>
      </dl>
      {(!event.suburb?.trim() || !event.guest_count) && (
        <p className="-mt-1 px-4 pb-3 text-[13px] text-foreground/70 sm:px-5">Add a location and guest numbers (Edit) so vendors can quote.</p>
      )}

      <div className="border-t border-border/70 px-4 pt-3 pb-4 sm:px-5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <p className="font-semibold">{progress.percent}% planned</p>
          <p className="text-[13px] text-muted-foreground tabular-nums">
            {progress.tasksDone} of {progress.tasksTotal} tasks
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-label="Planning progress"
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken shadow-[var(--shadow-pressed)]"
        >
          <div
            className="h-full rounded-full bg-[image:var(--gradient-coral)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.max(progress.percent, progress.percent > 0 ? 4 : 0)}%` }}
          />
        </div>
        {progress.vendorsTotal > 0 && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {progress.vendorsDone} of {progress.vendorsTotal} vendor{progress.vendorsTotal === 1 ? "" : "s"} booked
          </p>
        )}
      </div>
    </header>
  );
}
