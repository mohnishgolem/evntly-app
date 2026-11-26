"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CalendarClock, Check, ChevronRight, Flag, NotebookPen, Plus, X } from "lucide-react";
import { CategoryArt } from "@/components/category-art";
import { usePlannerSheet, type EditableItem, type ItemKind } from "@/components/planner/planner-sheet";
import { dismissPlannerSuggestion } from "@/lib/actions/planner";
import { clockLabel, dayMarker, type TimelineGroup, type TimelineItem } from "@/lib/planner/timeline";
import { countLabel, type Recommendation } from "@/lib/planner/recommendations";
import { rememberPlanEvent } from "@/lib/planner/context";
import { trackPlanner } from "@/lib/track-client";
import { cn } from "@/lib/utils";

const TONE_LABEL: Partial<Record<TimelineItem["tone"], { text: string; className: string }>> = {
  confirmed: { text: "Confirmed", className: "text-success-text" },
  pending: { text: "Pending", className: "text-warning-text" },
  action: { text: "Your move", className: "text-primary-text" },
  done: { text: "Done", className: "text-muted-foreground" },
};

const KIND_ICON: Partial<Record<TimelineItem["kind"], typeof Flag>> = {
  schedule: CalendarClock,
  reminder: BellRing,
  note: NotebookPen,
  event_start: Flag,
  event_end: Flag,
};

// The planner's spine: one rail of days, each with its cards. Real things
// (bookings, your own items) are white raised cards; suggestions are quieter
// sunken cards with a hollow node and can be dismissed.
export function PlannerTimeline({
  eventId,
  groups,
  recommendations,
  ready,
  preview = false,
}: {
  eventId: string;
  groups: TimelineGroup[];
  recommendations: Recommendation[];
  ready: boolean;
  /** Guest preview: nothing saved yet, so suggestions can't be dismissed. */
  preview?: boolean;
}) {
  const [recs, removeRec] = useOptimistic(recommendations, (list, key: string) => list.filter((r) => r.key !== key));
  const [, start] = useTransition();
  const router = useRouter();
  const dismiss = (key: string) =>
    start(async () => {
      removeRec(key);
      await dismissPlannerSuggestion(eventId, key);
      router.refresh();
    });

  // Suggestions sit right after "Now" (or open the timeline when nothing is
  // waiting), where the next decision is.
  const shown = recs.slice(0, 2);
  const suggestions = shown.map((r) => (
    <li key={r.key}>
      <SuggestionRow eventId={eventId} rec={r} onDismiss={preview ? undefined : () => dismiss(r.key)} />
    </li>
  ));
  const hasNow = groups[0]?.date === null;

  return (
    <ol>
      {!hasNow && suggestions}
      {groups.map((group, gi) => (
        <li key={group.key}>
          <DayGroup eventId={eventId} group={group} ready={ready} isLast={gi === groups.length - 1} />
          {hasNow && gi === 0 && <ol>{suggestions}</ol>}
        </li>
      ))}
    </ol>
  );
}

/** Rail column: weekday + day number, or a label for "Now". */
function Marker({ group }: { group: TimelineGroup }) {
  if (!group.date) {
    return (
      <div className="flex flex-col items-center pt-3">
        <span className="text-[13px] font-semibold">Now</span>
        <span aria-hidden className="mt-1.5 size-2.5 rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)]" />
      </div>
    );
  }
  const m = dayMarker(group.date);
  return (
    <div className="flex flex-col items-center pt-2">
      <span className={cn("text-[13px] font-semibold", group.isPast && "text-muted-foreground")}>{m.weekday}</span>
      <span
        className={cn(
          "mt-1 flex size-9 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums",
          group.isEventDay ? "bg-[image:var(--gradient-coral-strong)] text-white shadow-[var(--shadow-coral)]" : "surface-pressed",
          group.isPast && !group.isEventDay && "text-muted-foreground",
        )}
      >
        {m.day}
      </span>
      <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{m.month}</span>
    </div>
  );
}

function DayGroup({ eventId, group, ready, isLast }: { eventId: string; group: TimelineGroup; ready: boolean; isLast: boolean }) {
  const { openAdd } = usePlannerSheet();
  const heading = group.date ? dayMarker(group.date).full : "Waiting on you or a vendor";
  return (
    <section aria-label={group.isEventDay ? `Event day, ${heading}` : heading} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3">
      <div className="relative">
        <Marker group={group} />
        {/* Connector to the next day. */}
        {!isLast && <span aria-hidden className="absolute top-[4.75rem] bottom-0 left-1/2 border-l-2 border-dashed border-border" />}
      </div>
      <div className="space-y-2.5 pb-5">
        {group.isEventDay && <p className="pt-1 text-xs font-semibold tracking-wide text-primary-text uppercase">Event day</p>}
        {group.items.map((item) => (
          <TimelineCard key={item.id} eventId={eventId} item={item} />
        ))}
        {group.isEventDay && ready && !group.items.some((i) => i.kind === "schedule") && (
          <button
            type="button"
            onClick={() => openAdd("schedule")}
            className="flex min-h-14 w-full items-center gap-3 rounded-tile border border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            Add the first moment of the day: arrivals, speeches, the cake
          </button>
        )}
      </div>
    </section>
  );
}

function TimelineCard({ eventId, item }: { eventId: string; item: TimelineItem }) {
  const { openEdit } = usePlannerSheet();
  const tone = TONE_LABEL[item.tone];
  const Icon = KIND_ICON[item.kind];
  const time = clockLabel(item.time);
  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[0.875rem] bg-[image:var(--gradient-tile)]",
          item.tone === "done" && "opacity-60",
        )}
      >
        {item.service ? (
          <CategoryArt value={item.service} className="size-11" />
        ) : Icon ? (
          <Icon className="size-5 text-foreground/70" strokeWidth={1.75} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "line-clamp-2 block font-semibold",
            item.tone === "done" && item.stored && "text-muted-foreground line-through decoration-foreground/30",
          )}
        >
          {item.title}
        </span>
        {item.subtitle && <span className="line-clamp-2 block text-[13px] text-muted-foreground">{item.subtitle}</span>}
        {tone && item.kind !== "booking" && <span className={cn("mt-0.5 block text-xs font-semibold", tone.className)}>{tone.text}</span>}
      </span>
      {time && <span className="shrink-0 self-start pt-0.5 text-[13px] font-semibold tabular-nums text-foreground/75">{time}</span>}
      {item.tone === "done" && !time && <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      {(item.href || item.stored) && !time && item.tone !== "done" && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );
  const shell = cn(
    "flex min-h-[4.25rem] w-full items-center gap-3 rounded-tile px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
    item.tone === "pending" ? "border border-dashed border-foreground/20 bg-surface" : "surface-raised",
    item.tone === "action" && "ring-1 ring-primary/25",
    (item.href || item.stored) && "lift",
  );

  if (item.stored) {
    const s = item.stored;
    const editable: EditableItem = {
      id: s.id,
      kind: s.kind as ItemKind,
      title: item.title,
      date: s.date,
      time: s.time,
      details: s.details,
      done: s.done,
      canMove: !s.time && !!s.date,
    };
    return (
      <button type="button" className={shell} onClick={() => openEdit(editable)} aria-label={`${item.title}${time ? `, ${time}` : ""}. Edit`}>
        {body}
      </button>
    );
  }
  if (item.href) {
    return (
      <Link href={item.href} className={shell} onClick={() => item.service && rememberPlanEvent(eventId)}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}

function SuggestionRow({ eventId, rec, onDismiss }: { eventId: string; rec: Recommendation; onDismiss?: () => void }) {
  const href =
    rec.onPlan && onDismiss ? `/dashboard/events/${eventId}?open=${rec.service}#category-${rec.service}` : `/explore?category=${rec.service}`;
  return (
    <section aria-label={`Suggestion: ${rec.title}`} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3">
      <div className="relative flex justify-center pt-6">
        <span aria-hidden className="relative z-10 size-3 rounded-full border-2 border-foreground/25 bg-canvas" />
        <span aria-hidden className="absolute top-0 bottom-0 left-1/2 border-l-2 border-dashed border-border" />
      </div>
      <div className="relative pb-5">
        <Link
          href={href}
          onClick={() => {
            if (!onDismiss) return; // guest preview: no saved event yet
            rememberPlanEvent(eventId);
            trackPlanner("recommendation_clicked", eventId, rec.key);
          }}
          className="flex min-h-[5rem] items-center gap-3 rounded-tile bg-surface-sunken py-3 pr-12 pl-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_6%,transparent)] outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CategoryArt value={rec.service} className="size-14 shrink-0" />
          <span className="min-w-0">
            <span className="block font-semibold">{rec.title}</span>
            <span className="block text-[13px] text-foreground/70">{rec.why}</span>
            <span className="mt-0.5 block text-xs font-semibold text-foreground/75">{countLabel(rec)}</span>
          </span>
        </Link>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Hide "${rec.title}"`}
            className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}
