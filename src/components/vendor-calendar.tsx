"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Ban, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { setAcceptingBookings, setBlockedDates, setWeeklyDaysOff } from "@/lib/actions/availability";

export type CalendarListing = {
  id: string;
  name: string;
  unavailable_dates: string[] | null;
  weekly_unavailable_days: number[] | null;
  available: boolean | null;
};

export type CalendarBooking = {
  id: string;
  provider_id: string;
  event_date: string;
  event_time: string | null;
  status: string;
  client_label: string;
  total_price: number | null;
};

const STATUS_STYLE: Record<string, { dot: string; label: string }> = {
  pending: { dot: "bg-warning", label: "Awaiting your confirmation" },
  confirmed: { dot: "bg-primary", label: "Confirmed" },
  completed: { dot: "bg-success", label: "Completed" },
};

// Monday-first (Australian convention). Values are JS getDay() / Postgres
// extract(dow) numbers, which is what weekly_unavailable_days stores.
const WEEKDAYS = [
  { dow: 1, short: "M", long: "Mon" },
  { dow: 2, short: "T", long: "Tue" },
  { dow: 3, short: "W", long: "Wed" },
  { dow: 4, short: "T", long: "Thu" },
  { dow: 5, short: "F", long: "Fri" },
  { dow: 6, short: "S", long: "Sat" },
  { dow: 0, short: "S", long: "Sun" },
];

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function VendorCalendar({
  listings,
  bookings,
  today,
}: {
  listings: CalendarListing[];
  bookings: CalendarBooking[];
  /** YYYY-MM-DD in Sydney time, from the server. */
  today: string;
}) {
  const [listingId, setListingId] = useState(listings[0].id);
  const listing = listings.find((l) => l.id === listingId) ?? listings[0];

  // Optimistic copies of the listing's availability, keyed by listing.
  const [blockedBy, setBlockedBy] = useState(
    () => new Map(listings.map((l) => [l.id, new Set(l.unavailable_dates ?? [])]))
  );
  const [weeklyBy, setWeeklyBy] = useState(
    () => new Map(listings.map((l) => [l.id, new Set(l.weekly_unavailable_days ?? [])]))
  );
  const [acceptingBy, setAcceptingBy] = useState(
    () => new Map(listings.map((l) => [l.id, l.available !== false]))
  );
  const blocked = blockedBy.get(listingId) ?? new Set<string>();
  const weekly = weeklyBy.get(listingId) ?? new Set<number>();
  const accepting = acceptingBy.get(listingId) ?? true;

  const [month, setMonth] = useState(() => startOfMonth(parseISO(today)));
  const [selected, setSelected] = useState<string | null>(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of bookings) {
      if (b.provider_id !== listingId || b.status === "cancelled") continue;
      const list = map.get(b.event_date) ?? [];
      list.push(b);
      map.set(b.event_date, list);
    }
    return map;
  }, [bookings, listingId]);

  const days = useMemo(() => {
    const start = startOfWeek(month, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);

  // Persist with rollback: apply locally, save, restore on failure.
  function save<T>(
    setter: React.Dispatch<React.SetStateAction<Map<string, T>>>,
    next: T,
    previous: T,
    persist: () => Promise<{ error?: string } | null>
  ) {
    setError(null);
    setter((m) => new Map(m).set(listingId, next));
    startTransition(async () => {
      const res = await persist();
      if (res?.error) {
        setError(res.error);
        setter((m) => new Map(m).set(listingId, previous));
      }
    });
  }

  function toggleDay(day: string) {
    const next = new Set(blocked);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    // Drop past dates as we go — they no longer mean anything.
    for (const d of next) if (d < today) next.delete(d);
    save(setBlockedBy, next, blocked, () => setBlockedDates(listingId, [...next]));
  }

  function toggleWeekday(dow: number) {
    const next = new Set(weekly);
    if (next.has(dow)) next.delete(dow);
    else next.add(dow);
    save(setWeeklyBy, next, weekly, () => setWeeklyDaysOff(listingId, [...next]));
  }

  function toggleAccepting(value: boolean) {
    save(setAcceptingBy, value, accepting, () => setAcceptingBookings(listingId, value));
  }

  const selectedBookings = selected ? (bookingsByDay.get(selected) ?? []) : [];
  const selectedDate = selected ? parseISO(selected) : null;
  const selectedIsPast = !!selected && selected < today;
  const selectedWeeklyOff = !!selectedDate && weekly.has(selectedDate.getDay());
  const selectedBlocked = !!selected && blocked.has(selected);

  const upcoming = bookings
    .filter(
      (b) =>
        b.provider_id === listingId &&
        b.event_date >= today &&
        (b.status === "pending" || b.status === "confirmed")
    )
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {listings.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {listings.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setListingId(l.id)}
              aria-pressed={l.id === listingId}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                l.id === listingId
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Taking new bookings</p>
          <p className="text-xs text-muted-foreground">
            {accepting
              ? "Customers can request quotes from you."
              : "Paused — customers can't request new quotes until you turn this back on."}
          </p>
        </div>
        <Switch checked={accepting} onCheckedChange={toggleAccepting} disabled={pending} />
      </div>

      <div className="rounded-2xl border border-border p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{format(month, "MMMM yyyy")}</h2>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Previous month"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMonth(startOfMonth(parseISO(today)));
                setSelected(today);
              }}
            >
              Today
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Next month"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
          {WEEKDAYS.map((w) => (
            <div key={w.dow} className="pb-2">
              <span className="sm:hidden">{w.short}</span>
              <span className="hidden sm:inline">{w.long}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = iso(d);
            const inMonth = isSameMonth(d, month);
            const isPast = key < today;
            const isBlocked = blocked.has(key);
            const isWeeklyOff = weekly.has(d.getDay());
            const dayBookings = bookingsByDay.get(key) ?? [];
            const isSelected = key === selected;
            const isToday = key === today;
            const label = [
              format(d, "EEEE d MMMM"),
              dayBookings.length ? `${dayBookings.length} booking${dayBookings.length > 1 ? "s" : ""}` : null,
              isBlocked ? "blocked" : isWeeklyOff ? "day off" : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-label={label}
                aria-pressed={isSelected}
                className={cn(
                  "relative flex aspect-square min-h-11 flex-col items-stretch rounded-xl p-1 text-left transition-colors sm:aspect-[4/3] sm:p-1.5",
                  inMonth ? "text-foreground" : "text-muted-foreground/50",
                  isPast && "opacity-50",
                  isBlocked
                    ? "bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)]"
                    : isWeeklyOff
                      ? "bg-muted/60"
                      : "hover:bg-muted/60",
                  isSelected && "ring-2 ring-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                    isToday && "bg-primary text-primary-foreground"
                  )}
                >
                  {format(d, "d")}
                </span>
                {dayBookings.length > 0 && (
                  <span className="mt-auto flex flex-wrap items-center gap-0.5">
                    {dayBookings.slice(0, 3).map((b) => (
                      <span
                        key={b.id}
                        className={cn("size-1.5 rounded-full", STATUS_STYLE[b.status]?.dot ?? "bg-muted-foreground")}
                      />
                    ))}
                    <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
                      {dayBookings.length === 1
                        ? dayBookings[0].client_label
                        : `${dayBookings.length} bookings`}
                    </span>
                  </span>
                )}
                {isBlocked && dayBookings.length === 0 && (
                  <Ban className="mt-auto size-3 text-muted-foreground" aria-hidden />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" /> Confirmed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warning" /> Awaiting confirmation
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" /> Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_2px,transparent_2px_4px)] opacity-60" />
            Blocked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-muted" /> Day off
          </span>
        </div>
      </div>

      {selected && selectedDate && (
        <div className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{format(selectedDate, "EEEE d MMMM yyyy")}</p>
              <p className="text-xs text-muted-foreground">
                {selectedBlocked
                  ? "Blocked — customers can't request quotes for this day."
                  : selectedWeeklyOff
                    ? `You don't work ${format(selectedDate, "EEEE")}s (set below).`
                    : selectedIsPast
                      ? "In the past."
                      : "Open for quote requests."}
              </p>
            </div>
            {!selectedIsPast && !selectedWeeklyOff && (
              <Button
                size="sm"
                variant={selectedBlocked ? "outline" : "secondary"}
                disabled={pending}
                onClick={() => toggleDay(selected)}
              >
                {selectedBlocked ? "Unblock day" : "Block this day"}
              </Button>
            )}
          </div>
          {selectedBookings.length > 0 && (
            <ul className="mt-3 space-y-2">
              {selectedBookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", STATUS_STYLE[b.status]?.dot)} />
                    <span className="truncate">
                      {b.client_label}
                      {b.event_time ? ` · ${b.event_time}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {STATUS_STYLE[b.status]?.label ?? b.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {selectedBookings.length > 0 && !selectedBlocked && !selectedIsPast && (
            <p className="mt-2 text-xs text-muted-foreground">
              Blocking only stops new quote requests — existing bookings stay as they are.
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border p-4">
        <p className="text-sm font-semibold">Days you never work</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Customers can&apos;t request quotes for these days of the week.
        </p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((w) => (
            <button
              key={w.dow}
              type="button"
              onClick={() => toggleWeekday(w.dow)}
              aria-pressed={weekly.has(w.dow)}
              disabled={pending}
              className={cn(
                "w-14 rounded-full border py-1.5 text-sm font-medium transition-colors",
                weekly.has(w.dow)
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {w.long}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Coming up</h2>
          <Link href="/vendor-dashboard/bookings" className="text-sm font-medium underline underline-offset-2">
            All bookings
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming bookings for {listing.name}.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {upcoming.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    setMonth(startOfMonth(parseISO(b.event_date)));
                    setSelected(b.event_date);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {format(parseISO(b.event_date), "EEE d MMM")}
                      {b.event_time ? ` · ${b.event_time}` : ""}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{b.client_label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("size-2 rounded-full", STATUS_STYLE[b.status]?.dot)} />
                    {STATUS_STYLE[b.status]?.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
