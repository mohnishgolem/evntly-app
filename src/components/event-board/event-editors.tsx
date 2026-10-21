"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { deleteEvent, setEventCategories, updateEventDetails } from "@/lib/actions/event-board";
import { GUEST_BUCKETS, LAUNCH_CATEGORIES, categoryIcon, categoryLabel } from "@/lib/config";
import { earliestEventDate } from "@/lib/event-dates";
import { cn } from "@/lib/utils";

export type EditableEvent = {
  id: string;
  name: string | null;
  eventDate: string;
  suburb: string;
  guestCount: string;
  budgetTotal: number;
  notes: string | null;
  requiredServices: string[];
  /** Date and place are locked while vendors are booked. */
  locked: boolean;
};

// Bottom sheet on phones, side panel from tablet up.
const SHEET_CLASS =
  "max-h-[90dvh] overflow-y-auto rounded-t-3xl px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md";

function useSheetSide() {
  const [side] = useState<"bottom" | "right">(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches ? "right" : "bottom"
  );
  return side;
}

export function EditEventSheet({ event }: { event: EditableEvent }) {
  const router = useRouter();
  const side = useSheetSide();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: event.name ?? "",
    eventDate: event.eventDate,
    suburb: event.suburb,
    guestCount: event.guestCount,
    budgetTotal: String(event.budgetTotal),
    notes: event.notes ?? "",
  });

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const budget = Number(form.budgetTotal.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(budget)) return setError("Enter a budget in dollars.");
    startTransition(async () => {
      const res = await updateEventDetails(event.id, {
        ...form,
        guestCount: form.guestCount as (typeof GUEST_BUCKETS)[number],
        budgetTotal: budget,
      });
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="lg" />}>
        <Pencil aria-hidden /> Edit
      </SheetTrigger>
      <SheetContent side={side} className={SHEET_CLASS}>
        <SheetHeader className="px-0">
          <SheetTitle>Edit event</SheetTitle>
          <SheetDescription>Changes update your vendor suggestions straight away.</SheetDescription>
        </SheetHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ev-name">Event name</Label>
            <Input
              id="ev-name"
              value={form.name}
              maxLength={80}
              placeholder="e.g. Priya & Sam's wedding"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-date">Date</Label>
              <Input
                id="ev-date"
                type="date"
                required
                disabled={event.locked}
                min={earliestEventDate()}
                value={form.eventDate}
                onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-suburb">Suburb</Label>
              <Input
                id="ev-suburb"
                required
                disabled={event.locked}
                maxLength={120}
                value={form.suburb}
                onChange={(e) => setForm((f) => ({ ...f, suburb: e.target.value }))}
              />
            </div>
          </div>
          {event.locked && (
            <p className="text-xs text-muted-foreground">Date and suburb are locked while vendors are booked.</p>
          )}
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Guests</legend>
            <div className="grid grid-cols-3 gap-2">
              {GUEST_BUCKETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={form.guestCount === b}
                  onClick={() => setForm((f) => ({ ...f, guestCount: b }))}
                  className={cn(
                    "h-11 rounded-xl border text-sm font-medium transition-colors",
                    form.guestCount === b ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="ev-budget">Total budget (AUD)</Label>
            <Input
              id="ev-budget"
              inputMode="decimal"
              value={form.budgetTotal}
              onChange={(e) => setForm((f) => ({ ...f, budgetTotal: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-notes">Notes for vendors</Label>
            <Textarea
              id="ev-notes"
              rows={3}
              maxLength={2000}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} Save changes
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function CategoriesSheet({ eventId, selected }: { eventId: string; selected: string[] }) {
  const router = useRouter();
  const side = useSheetSide();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(service: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(service)) next.delete(service);
      else next.add(service);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      // Keep the existing order, then append new categories.
      const ordered = [...selected.filter((s) => picked.has(s)), ...LAUNCH_CATEGORIES.filter((s) => picked.has(s) && !selected.includes(s))];
      const res = await setEventCategories(eventId, ordered);
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setPicked(new Set(selected));
      }}
    >
      <SheetTrigger
        render={
          <button
            type="button"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          />
        }
      >
        <Plus className="size-4" aria-hidden /> Add or remove vendor categories
      </SheetTrigger>
      <SheetContent side={side} className={SHEET_CLASS}>
        <SheetHeader className="px-0">
          <SheetTitle>Vendor categories</SheetTitle>
          <SheetDescription>Choose who you need for this event.</SheetDescription>
        </SheetHeader>
        <ul className="grid grid-cols-2 gap-2">
          {LAUNCH_CATEGORIES.map((service) => {
            const Icon = categoryIcon(service);
            const on = picked.has(service);
            return (
              <li key={service}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(service)}
                  className={cn(
                    "flex h-14 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-sm font-medium transition-colors",
                    on ? "border-foreground bg-foreground/[0.04]" : "border-border hover:bg-muted"
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{categoryLabel(service)}</span>
                  {on && <Check className="size-4 shrink-0" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button size="lg" className="w-full" disabled={pending} onClick={save}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} Save categories
        </Button>
      </SheetContent>
    </Sheet>
  );
}

export function DeleteEventButton({ eventId }: { eventId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-11 items-center gap-1.5 rounded-full px-2 text-sm text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" aria-hidden /> Delete event
      </button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm">Delete this event?</span>
        <Button
          variant="destructive"
          size="lg"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await deleteEvent(eventId);
              if (res?.error) setError(res.error);
            })
          }
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />} Delete
        </Button>
        <Button variant="ghost" size="lg" disabled={pending} onClick={() => setConfirming(false)}>
          Keep
        </Button>
      </div>
      {error && (
        <p role="alert" className="max-w-xs text-right text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
