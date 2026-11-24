"use client";

import Link from "next/link";
import { createContext, useContext, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, BellRing, CalendarClock, ChevronLeft, ListChecks, NotebookPen, Plus, Search, Trash2, Wallet } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addPlannerItem, deletePlannerItem, movePlannerItem, setPlannerItemDone, updatePlannerItem } from "@/lib/actions/planner";
import { addEventTask } from "@/lib/actions/event-tasks";
import { addBudgetItem } from "@/lib/actions/budget";
import { rememberPlanEvent } from "@/lib/planner/context";
import { cn } from "@/lib/utils";

// One sheet for everything the organiser adds or edits in the planner,
// opened from the floating + (phones), the Add button (desktop) or by
// tapping their own item on the timeline.

export type ItemKind = "task" | "schedule" | "reminder" | "note";
export type EditableItem = { id: string; kind: ItemKind; title: string; date: string | null; time: string | null; details: string | null; done: boolean; canMove: boolean };

type Mode = { view: "menu" } | { view: "form"; kind: ItemKind; item?: EditableItem } | { view: "expense" };

type Ctx = { openMenu: () => void; openAdd: (kind: ItemKind) => void; openEdit: (item: EditableItem) => void };
const PlannerSheetContext = createContext<Ctx | null>(null);

export function usePlannerSheet() {
  const ctx = useContext(PlannerSheetContext);
  if (!ctx) throw new Error("usePlannerSheet outside PlannerSheetProvider");
  return ctx;
}

const KIND_COPY: Record<ItemKind, { label: string; hint: string; icon: typeof ListChecks; titleHint: string }> = {
  task: { label: "Task", hint: "Something to get done before the day", icon: ListChecks, titleHint: "Order the welcome sign" },
  schedule: { label: "Schedule item", hint: "A moment on the day, like speeches", icon: CalendarClock, titleHint: "First dance" },
  reminder: { label: "Reminder", hint: "A date to remember, like a payment", icon: BellRing, titleHint: "Pay the florist's deposit" },
  note: { label: "Note", hint: "Ideas, addresses, anything", icon: NotebookPen, titleHint: "Song ideas for the entrance" },
};

export function PlannerSheetProvider({
  eventId,
  eventDate,
  eventType,
  ready,
  children,
}: {
  eventId: string;
  eventDate: string;
  eventType: string;
  ready: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>({ view: "menu" });
  const ctx: Ctx = {
    openMenu: () => {
      setMode({ view: "menu" });
      setOpen(true);
    },
    openAdd: (kind) => {
      setMode({ view: "form", kind });
      setOpen(true);
    },
    openEdit: (item) => {
      setMode({ view: "form", kind: item.kind, item });
      setOpen(true);
    },
  };
  const close = () => setOpen(false);

  return (
    <PlannerSheetContext.Provider value={ctx}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto w-full max-w-lg gap-0 overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-4 sm:rounded-[var(--radius-sheet)]">
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-foreground/15" />
          {mode.view === "menu" && (
            <AddMenu
              ready={ready}
              eventId={eventId}
              eventType={eventType}
              onPick={(kind) => setMode({ view: "form", kind })}
              onExpense={() => setMode({ view: "expense" })}
              onClose={close}
            />
          )}
          {mode.view === "form" && (
            <ItemForm
              key={mode.item?.id ?? mode.kind}
              eventId={eventId}
              eventDate={eventDate}
              kind={mode.kind}
              item={mode.item}
              ready={ready}
              onBack={mode.item ? undefined : () => setMode({ view: "menu" })}
              onDone={close}
            />
          )}
          {mode.view === "expense" && <ExpenseForm eventId={eventId} onBack={() => setMode({ view: "menu" })} onDone={close} />}
        </SheetContent>
      </Sheet>
    </PlannerSheetContext.Provider>
  );
}

function AddMenu({
  ready,
  eventId,
  eventType,
  onPick,
  onExpense,
  onClose,
}: {
  ready: boolean;
  eventId: string;
  eventType: string;
  onPick: (kind: ItemKind) => void;
  onExpense: () => void;
  onClose: () => void;
}) {
  // Before the planner migration only plain tasks can be stored.
  const kinds: ItemKind[] = ready ? ["task", "schedule", "reminder", "note"] : ["task"];
  const row = "flex min-h-16 w-full items-center gap-3.5 rounded-tile px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:bg-accent";
  const tile = "flex size-11 shrink-0 items-center justify-center rounded-[0.875rem] btn-raised text-foreground/80";
  return (
    <>
      <SheetHeader className="px-1 pt-3 pb-2">
        <SheetTitle className="text-lg">Add to your plan</SheetTitle>
        <SheetDescription className="sr-only">Choose what to add to this event.</SheetDescription>
      </SheetHeader>
      <ul className="space-y-0.5">
        {kinds.map((k) => {
          const { label, hint, icon: Icon } = KIND_COPY[k];
          return (
            <li key={k}>
              <button type="button" className={row} onClick={() => onPick(k)}>
                <span className={tile}>
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-[13px] text-muted-foreground">{hint}</span>
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" className={row} onClick={onExpense}>
            <span className={tile}>
              <Wallet className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Expense</span>
              <span className="block text-[13px] text-muted-foreground">A cost to track against your budget</span>
            </span>
          </button>
        </li>
        <li>
          <Link
            href={`/explore?event=${encodeURIComponent(eventType)}`}
            className={row}
            onClick={() => {
              rememberPlanEvent(eventId);
              onClose();
            }}
          >
            <span className={tile}>
              <Search className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Vendor</span>
              <span className="block text-[13px] text-muted-foreground">Find and request quotes for this event</span>
            </span>
          </Link>
        </li>
      </ul>
    </>
  );
}

function ItemForm({
  eventId,
  eventDate,
  kind,
  item,
  ready,
  onBack,
  onDone,
}: {
  eventId: string;
  eventDate: string;
  kind: ItemKind;
  item?: EditableItem;
  ready: boolean;
  onBack?: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(item?.title ?? "");
  const [date, setDate] = useState(item?.date ?? (kind === "schedule" ? eventDate : ""));
  const [time, setTime] = useState(item?.time ?? "");
  const [details, setDetails] = useState(item?.details ?? "");
  const copy = KIND_COPY[kind];

  function run(action: () => Promise<{ error?: string } | null>, close = true) {
    setError(null);
    start(async () => {
      const res = await action();
      if (res?.error) return setError(res.error);
      router.refresh();
      if (close) onDone();
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return run(() => addEventTask(eventId, title));
    const input = { kind, title, date: date || null, time: time || null, details: details.trim() || null };
    run(() => (item ? updatePlannerItem(eventId, item.id, input) : addPlannerItem(eventId, input)));
  }

  const dateLabel = kind === "task" ? "Due date (optional)" : kind === "reminder" ? "Date" : kind === "schedule" ? "Day" : "Date (optional)";

  return (
    <form onSubmit={save} className="pt-1">
      <SheetHeader className="flex-row items-center gap-1 px-0 pt-2 pb-3">
        {onBack && (
          <Button type="button" variant="ghost" size="icon-lg" className="-ml-2" onClick={onBack} aria-label="Back">
            <ChevronLeft className="size-5" />
          </Button>
        )}
        <SheetTitle className="text-lg">{item ? `Edit ${copy.label.toLowerCase()}` : `Add a ${copy.label.toLowerCase()}`}</SheetTitle>
        <SheetDescription className="sr-only">{copy.hint}</SheetDescription>
      </SheetHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-title`}>Title</Label>
          <Input
            id={`${id}-title`}
            value={title}
            maxLength={120}
            required
            autoFocus={!item}
            enterKeyHint="done"
            placeholder={copy.titleHint}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        {ready && kind !== "note" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-date`}>{dateLabel}</Label>
              <Input id={`${id}-date`} type="date" value={date} required={kind === "reminder"} onChange={(e) => setDate(e.target.value)} />
            </div>
            {kind !== "task" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-time`}>Time (optional)</Label>
                <Input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            )}
          </div>
        )}
        {ready && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-details`}>{kind === "note" ? "Note" : "Details (optional)"}</Label>
            <Textarea id={`${id}-details`} value={details} maxLength={500} rows={kind === "note" ? 4 : 2} onChange={(e) => setDetails(e.target.value)} />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="btn-coral h-12 w-full text-base" disabled={pending || !title.trim()}>
          {item ? "Save changes" : `Add ${copy.label.toLowerCase()}`}
        </Button>

        {item && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
            {(kind === "reminder" || kind === "task") && (
              <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => run(() => setPlannerItemDone(eventId, item.id, !item.done))}>
                {item.done ? "Mark as not done" : "Mark as done"}
              </Button>
            )}
            {item.canMove && (
              <>
                <Button type="button" variant="outline" size="icon-lg" aria-label="Move earlier" disabled={pending} onClick={() => run(() => movePlannerItem(eventId, item.id, "up"), false)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button type="button" variant="outline" size="icon-lg" aria-label="Move later" disabled={pending} onClick={() => run(() => movePlannerItem(eventId, item.id, "down"), false)}>
                  <ArrowDown className="size-4" />
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="ml-auto text-destructive-text hover:text-destructive-text"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Delete "${item.title}"?`)) run(() => deletePlannerItem(eventId, item.id));
              }}
            >
              <Trash2 className="size-4" aria-hidden /> Delete
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}

function ExpenseForm({ eventId, onBack, onDone }: { eventId: string; onBack: () => void; onDone: () => void }) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <form
      className="pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await addBudgetItem(eventId, label, amount);
          if (res?.error) return setError(res.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <SheetHeader className="flex-row items-center gap-1 px-0 pt-2 pb-3">
        <Button type="button" variant="ghost" size="icon-lg" className="-ml-2" onClick={onBack} aria-label="Back">
          <ChevronLeft className="size-5" />
        </Button>
        <SheetTitle className="text-lg">Add an expense</SheetTitle>
        <SheetDescription className="sr-only">Track a cost against your budget.</SheetDescription>
      </SheetHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-label`}>What is it for?</Label>
          <Input id={`${id}-label`} value={label} maxLength={120} required autoFocus placeholder="Invitations" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-amount`}>Amount (AUD)</Label>
          <Input id={`${id}-amount`} value={amount} inputMode="decimal" required placeholder="250" onChange={(e) => setAmount(e.target.value)} />
        </div>
        <p className="text-[13px] text-muted-foreground">Recorded in your budget only. Pay vendors directly as agreed in their quote.</p>
        {error && (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="btn-coral h-12 w-full text-base" disabled={pending || !label.trim() || !amount.trim()}>
          Add expense
        </Button>
      </div>
    </form>
  );
}

/** The floating + on phones and tablets: sits above the tab bar and any consent card. */
export function PlannerFab() {
  const { openMenu } = usePlannerSheet();
  return (
    <button
      type="button"
      onClick={openMenu}
      aria-label="Add to your plan"
      className={cn(
        "fixed right-[max(1rem,env(safe-area-inset-right))] z-30 flex size-14 items-center justify-center rounded-full surface-float text-foreground outline-none lg:hidden print:hidden",
        "bottom-[calc(var(--tabbar-height)+var(--consent-h,0px)+1rem)] md:bottom-[max(1.5rem,env(safe-area-inset-bottom))]",
        "transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring active:scale-95 motion-reduce:transition-none"
      )}
    >
      <Plus className="size-6" strokeWidth={2} aria-hidden />
    </button>
  );
}

/** Desktop: the same menu from a button in the section header. */
export function PlannerAddButton({ className }: { className?: string }) {
  const { openMenu } = usePlannerSheet();
  return (
    <Button type="button" variant="outline" size="lg" className={cn("btn-raised hidden lg:inline-flex", className)} onClick={openMenu}>
      <Plus aria-hidden /> Add
    </Button>
  );
}
