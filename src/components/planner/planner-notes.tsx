"use client";

import { useEffect } from "react";
import { NotebookPen } from "lucide-react";
import { usePlannerSheet } from "@/components/planner/planner-sheet";
import { trackPlanner } from "@/lib/track-client";

type Note = { id: string; title: string; details: string | null };

/** Undated notes: ideas and details that don't belong to a day. */
export function PlannerNotes({ notes }: { notes: Note[] }) {
  const { openEdit, openAdd } = usePlannerSheet();
  if (notes.length === 0) {
    return (
      <button
        type="button"
        onClick={() => openAdd("note")}
        className="flex min-h-14 w-full items-center gap-3 rounded-tile border border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <NotebookPen className="size-4 shrink-0" aria-hidden />
        Keep song ideas, addresses and anything else here
      </button>
    );
  }
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {notes.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => openEdit({ id: n.id, kind: "note", title: n.title, date: null, time: null, details: n.details, done: false, canMove: false })}
            className="lift surface-raised block h-full w-full rounded-tile px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block font-semibold">{n.title}</span>
            {n.details && <span className="mt-0.5 line-clamp-3 block text-[13px] whitespace-pre-line text-muted-foreground">{n.details}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Counts a planner visit once per page load (repeat visits show up as repeat rows). */
export function PlannerOpened({ eventId }: { eventId: string }) {
  useEffect(() => {
    trackPlanner("planner_opened", eventId);
  }, [eventId]);
  return null;
}
