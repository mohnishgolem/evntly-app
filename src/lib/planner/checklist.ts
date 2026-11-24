import { categoryLabel } from "@/lib/config";

// "Before your event": a preparation checklist built from templates (event
// type + date + the vendors the organiser needs), merged with what they've
// done to it. No AI call: templates are predictable, instant and free.
//
// A suggestion only becomes a database row once the organiser acts on it
// (completes, edits or dismisses it) — event_tasks.template_key — so new or
// changed templates reach existing events without a backfill.

export type ChecklistTemplate = {
  key: string;
  title: string;
  detail: string;
  /** Due this many days before the event. */
  daysBefore: number;
};

export type StoredTask = {
  id: string;
  title: string;
  done: boolean | null;
  dismissed?: boolean | null;
  template_key?: string | null;
  due_date?: string | null;
  details?: string | null;
  kind?: string | null;
  created_at?: string;
};

export type ChecklistItem = {
  /** template key, or the stored row id for the organiser's own tasks */
  key: string;
  id?: string;
  title: string;
  detail: string | null;
  dueDate: string | null;
  done: boolean;
  /** Done because of a real booking, not a tick: can't be unticked here. */
  autoDone: boolean;
  source: "template" | "custom";
  /** Where the task is actually done, when that's somewhere else in Evntly. */
  href?: string;
};

type BookingLike = { service_type: string; status: string };

const COMMON: ChecklistTemplate[] = [
  { key: "guest_list", title: "Finalise your guest list", detail: "Numbers drive catering, venue size and quotes.", daysBefore: 45 },
  { key: "payments", title: "Check outstanding payments", detail: "Confirm each vendor's deposit and final payment dates.", daysBefore: 14 },
  { key: "arrival_times", title: "Confirm vendor arrival times", detail: "Agree set-up times so everyone is ready before guests arrive.", daysBefore: 7 },
  { key: "run_sheet", title: "Finalise the event schedule", detail: "Add the key moments to your timeline.", daysBefore: 10 },
  { key: "share_details", title: "Share event details with vendors", detail: "Address, parking, access and an on-the-day contact.", daysBefore: 5 },
];

const BY_TYPE: Record<string, ChecklistTemplate[]> = {
  Wedding: [
    { key: "confirm_venue", title: "Confirm your venue", detail: "Lock in the date, ceremony and reception spaces.", daysBefore: 300 },
    { key: "noim", title: "Lodge your Notice of Intended Marriage", detail: "With your celebrant, at least one month before the wedding.", daysBefore: 60 },
    { key: "send_invites", title: "Send invitations", detail: "Include RSVP date, dress code and directions.", daysBefore: 90 },
  ],
  Engagement: [
    { key: "confirm_venue", title: "Confirm your venue", detail: "Book the space and check what's included.", daysBefore: 90 },
    { key: "send_invites", title: "Send invitations", detail: "Include RSVP date and directions.", daysBefore: 35 },
  ],
  Birthday: [
    { key: "confirm_venue", title: "Confirm your venue", detail: "Home, a hired space or a restaurant: lock it in.", daysBefore: 60 },
    { key: "send_invites", title: "Send invitations", detail: "Include RSVP date and any theme.", daysBefore: 28 },
    { key: "food_drinks", title: "Plan food and drinks", detail: "Allow for dietary needs from your RSVPs.", daysBefore: 21 },
  ],
  Corporate: [
    { key: "confirm_venue", title: "Confirm your venue", detail: "Check capacity, access and AV before you sign.", daysBefore: 90 },
    { key: "send_invites", title: "Send invitations", detail: "Include agenda, location and how to RSVP.", daysBefore: 30 },
    { key: "av_power", title: "Check AV and power needs", detail: "Microphones, screens and power for each vendor.", daysBefore: 14 },
  ],
  Cultural: [
    { key: "confirm_venue", title: "Confirm your venue", detail: "Check space for ceremonies, food and music.", daysBefore: 120 },
    { key: "send_invites", title: "Send invitations", detail: "Include timings for each part of the day.", daysBefore: 45 },
  ],
  Party: [
    { key: "confirm_venue", title: "Confirm your venue", detail: "Lock in the space and any noise limits.", daysBefore: 45 },
    { key: "send_invites", title: "Send invitations", detail: "Include RSVP date and any theme.", daysBefore: 21 },
  ],
};

/** How far ahead vendors are usually booked, by event type (days). */
const BOOK_LEAD: Record<string, number> = { Wedding: 240, Engagement: 75, Corporate: 75, Cultural: 120 };

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 864e5);
}

/** "photographer", "DJ", "cakes & desserts": a category inside a sentence. */
export function categoryNoun(service: string) {
  const label = categoryLabel(service);
  return /^[A-Z]{2,}$/.test(label) ? label : label.toLowerCase();
}

export function templatesFor(eventType: string, services: string[]): ChecklistTemplate[] {
  const lead = BOOK_LEAD[eventType] ?? 45;
  const booking = services.map((s, i) => ({
    key: `book_${s}`,
    title: `Book your ${categoryNoun(s)}`,
    detail: "Compare quotes from vendors free on your date.",
    // Stagger so they don't all land on one day.
    daysBefore: lead - i * 3,
  }));
  const types = BY_TYPE[eventType] ?? BY_TYPE.Party;
  const common = services.length ? COMMON : COMMON.filter((c) => c.key !== "arrival_times");
  return [...types, ...booking, ...common];
}

/**
 * The checklist for one event: templates (with the organiser's edits and
 * ticks), minus dismissed ones, plus their own tasks. Sorted by due date,
 * open items first.
 */
export function buildChecklist(input: {
  eventId: string;
  eventType: string;
  eventDate: string;
  services: string[];
  bookings: BookingLike[];
  stored: StoredTask[];
  today: string;
}): ChecklistItem[] {
  const { eventId, eventType, eventDate, services, bookings, stored, today } = input;
  const byKey = new Map(stored.filter((t) => t.template_key).map((t) => [t.template_key!, t]));
  const booked = new Set(bookings.filter((b) => b.status === "confirmed" || b.status === "completed").map((b) => b.service_type));
  const board = `/dashboard/events/${eventId}`;

  const items: ChecklistItem[] = [];
  for (const t of templatesFor(eventType, services)) {
    const row = byKey.get(t.key);
    if (row?.dismissed) continue;
    const service = t.key.startsWith("book_") ? t.key.slice(5) : null;
    const autoDone = !!service && booked.has(service);
    const due = row?.due_date ?? clampDue(addDays(eventDate, -t.daysBefore), today, eventDate);
    items.push({
      key: t.key,
      id: row?.id,
      title: row?.title ?? t.title,
      detail: row?.details ?? t.detail,
      dueDate: due,
      done: autoDone || !!row?.done,
      autoDone,
      source: "template",
      href: service ? `${board}?open=${service}#category-${service}` : t.key === "payments" ? "/dashboard/bookings" : undefined,
    });
  }
  for (const t of stored) {
    if (t.template_key || t.dismissed || (t.kind && t.kind !== "task")) continue;
    items.push({ key: t.id, id: t.id, title: t.title, detail: t.details ?? null, dueDate: t.due_date ?? null, done: !!t.done, autoDone: false, source: "custom" });
  }
  return items.sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.title.localeCompare(b.title)
  );
}

/** A due date already behind us (late planning) becomes "now", never "overdue by 200 days". */
function clampDue(due: string, today: string, eventDate: string) {
  if (eventDate < today) return due;
  return due < today ? today : due;
}

export function checklistProgress(items: ChecklistItem[]) {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

/** "Due today", "Due in 3 days", "Due 12 Mar", "Overdue". */
export function dueLabel(due: string | null, today: string) {
  if (!due) return null;
  const d = daysBetween(today, due);
  if (d < 0) return "Overdue";
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d < 14) return `Due in ${d} days`;
  const [y, m, day] = due.split("-").map(Number);
  return `Due ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, day)))}`;
}
