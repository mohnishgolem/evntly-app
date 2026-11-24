"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, EyeOff, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePlannerSheet } from "@/components/planner/planner-sheet";
import { setPlannerItemDone, updateChecklistSuggestion } from "@/lib/actions/planner";
import { toggleEventTask } from "@/lib/actions/event-tasks";
import { dueLabel, type ChecklistItem } from "@/lib/planner/checklist";
import { cn } from "@/lib/utils";

const OPEN_LIMIT = 6;

// "Before your event": the preparation checklist. Suggestions come from
// templates; ticking, renaming or hiding one stores it. Tasks done by a real
// booking tick themselves and can't be unticked here.
export function PrepChecklist({
  eventId,
  items,
  today,
  ready,
  onLocked,
}: {
  eventId: string;
  items: ChecklistItem[];
  today: string;
  ready: boolean;
  /** Guest preview: any change asks them to save their plan first. */
  onLocked?: () => void;
}) {
  const router = useRouter();
  const { openAdd, openEdit } = usePlannerSheet();
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [list, patch] = useOptimistic(items, (current, change: { key: string; done?: boolean; hidden?: boolean }) =>
    change.hidden ? current.filter((i) => i.key !== change.key) : current.map((i) => (i.key === change.key ? { ...i, done: change.done ?? i.done } : i))
  );

  const run = (change: { key: string; done?: boolean; hidden?: boolean }, action: () => Promise<{ error?: string } | null>) =>
    start(async () => {
      setError(null);
      patch(change);
      const res = await action();
      if (res?.error) setError(res.error);
      router.refresh();
    });

  const toggle = (item: ChecklistItem) => {
    if (onLocked) return onLocked();
    const done = !item.done;
    if (item.source === "template") return run({ key: item.key, done }, () => updateChecklistSuggestion(eventId, item.key, { done }));
    run({ key: item.key, done }, () => (ready ? setPlannerItemDone(eventId, item.id!, done) : toggleEventTask(item.id!, done)));
  };

  const open = list.filter((i) => !i.done);
  const done = list.filter((i) => i.done);
  const visible = showAll ? open : open.slice(0, OPEN_LIMIT);

  return (
    <div>
      {open.length === 0 ? (
        <p className="rounded-tile surface-pressed px-4 py-5 text-center text-sm text-muted-foreground">Everything on your checklist is done. Nice work.</p>
      ) : (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-card surface-raised">
          {visible.map((item) => (
            <Row key={item.key} item={item} today={today} ready={ready} onToggle={() => toggle(item)}
              onHide={onLocked ?? (() => run({ key: item.key, hidden: true }, () => updateChecklistSuggestion(eventId, item.key, { dismissed: true })))}
              onEdit={() => openEdit({ id: item.id!, kind: "task", title: item.title, date: item.dueDate, time: null, details: item.detail, done: item.done, canMove: false })}
            />
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4">
        {open.length > OPEN_LIMIT && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="h-11 text-sm font-semibold underline-offset-2 hover:underline">
            {showAll ? "Show fewer" : `Show all ${open.length}`}
          </button>
        )}
        {done.length > 0 && (
          <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="h-11 text-sm text-muted-foreground underline-offset-2 hover:underline">
            {showDone ? "Hide" : "Show"} done ({done.length})
          </button>
        )}
        <button type="button" onClick={() => openAdd("task")} className="ml-auto inline-flex h-11 items-center gap-1.5 text-sm font-semibold">
          <Plus className="size-4" aria-hidden /> Add a task
        </button>
      </div>
      {showDone && done.length > 0 && (
        <ul className="mt-1 divide-y divide-border/70 overflow-hidden rounded-tile surface-pressed">
          {done.map((item) => (
            <Row key={item.key} item={item} today={today} ready={ready} onToggle={() => toggle(item)} />
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}

function Row({
  item,
  today,
  ready,
  onToggle,
  onHide,
  onEdit,
}: {
  item: ChecklistItem;
  today: string;
  ready: boolean;
  onToggle: () => void;
  onHide?: () => void;
  onEdit?: () => void;
}) {
  const due = item.done ? null : dueLabel(item.dueDate, today);
  const overdue = due === "Overdue";
  return (
    <li className="flex items-center gap-1 pr-1.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.autoDone ? `${item.title}: done, booked` : item.title}
        disabled={item.autoDone}
        onClick={onToggle}
        className="flex size-14 shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-6 items-center justify-center rounded-full border-2 transition-colors duration-150 motion-reduce:transition-none",
            item.done ? "border-transparent bg-success text-white" : "border-foreground/30 bg-surface"
          )}
        >
          {item.done && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </button>
      <div className="min-w-0 flex-1 py-3">
        <p className={cn("font-medium", item.done && "text-muted-foreground line-through decoration-foreground/30")}>{item.title}</p>
        {!item.done && item.detail && <p className="text-[13px] text-muted-foreground">{item.detail}</p>}
        {(due || item.autoDone) && (
          <p className={cn("mt-0.5 text-xs font-semibold", item.autoDone ? "text-success-text" : overdue ? "text-destructive-text" : "text-foreground/70")}>
            {item.autoDone ? "Booked" : due}
          </p>
        )}
      </div>
      {item.href && !item.done && (
        <Link href={item.href} aria-label={`${item.title}: open`} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
      {!item.done && (onHide || onEdit) && (item.source === "template" ? !!onHide : ready && !!onEdit) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`More for "${item.title}"`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {item.source === "template" ? (
              <DropdownMenuItem onClick={onHide}>
                <EyeOff aria-hidden /> Not needed for this event
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil aria-hidden /> Edit or delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
