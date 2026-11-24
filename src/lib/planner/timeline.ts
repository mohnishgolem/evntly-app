import { categoryLabel } from "@/lib/config";
import { shortTime } from "@/lib/event-times";
import { daysBetween } from "@/lib/planner/checklist";

// The planner timeline: everything with a date or a time, from what Evntly
// already knows (bookings, vendor arrival times, quotes waiting on someone)
// and what the organiser added (schedule items, reminders such as a payment
// date, notes), grouped by day in order. Payment plans (the inactive escrow
// feature) are deliberately not shown: vendors are paid directly.

export type TimelineKind =
  | "quote" // a quote to review: the organiser's move
  | "enquiry" // waiting on a vendor's reply
  | "booking"
  | "schedule"
  | "reminder"
  | "note"
  | "event_start"
  | "event_end";

/** Drives the visual: confirmed (solid), pending (dashed), action (accent), done (muted). */
export type TimelineTone = "confirmed" | "pending" | "action" | "done" | "plain";

export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  title: string;
  subtitle: string | null;
  /** "14:30" */
  time: string | null;
  tone: TimelineTone;
  href?: string;
  service?: string;
  /** A row the organiser owns (edit / delete / reorder / complete). */
  stored?: { id: string; kind: string; date: string | null; time: string | null; details: string | null; done: boolean; position: number };
};

export type TimelineGroup = {
  key: string;
  /** null = "Now": things waiting on someone, not tied to a day. */
  date: string | null;
  isEventDay: boolean;
  isPast: boolean;
  items: TimelineItem[];
};

export type PlannerRow = {
  id: string;
  title: string;
  kind: string | null;
  due_date: string | null;
  due_time: string | null;
  details: string | null;
  done: boolean | null;
  dismissed: boolean | null;
  position: number | null;
  created_at: string;
};

type Booking = {
  id: string;
  provider_name: string | null;
  service_type: string;
  status: string;
  event_date: string;
  start_time: string | null;
};
type Quote = { id: string; vendor_name: string | null; service_type: string | null; status: string; quoted_amount: number | string | null };

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

/** "14:30" → "2:30 pm". */
export function clockLabel(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

export function buildTimeline(input: {
  eventId: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  rows: PlannerRow[];
  bookings: Booking[];
  arrivals: Map<string, string>;
  quotes: Quote[];
  today: string;
}): TimelineGroup[] {
  const { eventId, eventDate, rows, bookings, arrivals, quotes, today } = input;
  const board = `/dashboard/events/${eventId}`;
  const byDate = new Map<string | null, TimelineItem[]>();
  const add = (date: string | null, item: TimelineItem) => {
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(item);
  };

  // Now: quotes to review, then requests still waiting on a vendor.
  for (const q of quotes) {
    const who = q.vendor_name ?? "A vendor";
    const what = q.service_type ? categoryLabel(q.service_type) : "Vendor";
    if (q.status === "quoted") {
      add(null, {
        id: `quote-${q.id}`,
        kind: "quote",
        title: `Review ${who}'s quote`,
        subtitle: [what, q.quoted_amount != null ? aud(Number(q.quoted_amount)) : null].filter(Boolean).join(" · "),
        time: null,
        tone: "action",
        href: q.service_type ? `${board}?open=${q.service_type}#category-${q.service_type}` : "/dashboard/quotes",
        service: q.service_type ?? undefined,
      });
    } else if (q.status === "pending") {
      add(null, {
        id: `enquiry-${q.id}`,
        kind: "enquiry",
        title: `Waiting on ${who}`,
        subtitle: `${what} · quote requested`,
        time: null,
        tone: "pending",
        href: "/dashboard/quotes",
        service: q.service_type ?? undefined,
      });
    }
  }

  // Bookings land on their day, at the vendor's arrival or start time.
  for (const b of bookings) {
    if (b.status === "cancelled" || b.status === "declined") continue;
    const arrival = arrivals.get(b.id) ?? null;
    const time = shortTime(arrival ?? b.start_time) || null;
    const statusText = b.status === "confirmed" ? "Confirmed" : b.status === "completed" ? "Completed" : "Awaiting vendor";
    add(b.event_date, {
      id: `booking-${b.id}`,
      kind: "booking",
      title: b.provider_name ?? categoryLabel(b.service_type),
      subtitle: [categoryLabel(b.service_type), arrival ? `arrives ${clockLabel(shortTime(arrival))}` : null, statusText].filter(Boolean).join(" · "),
      time,
      tone: b.status === "confirmed" ? "confirmed" : b.status === "completed" ? "done" : "pending",
      href: `/bookings/${b.id}`,
      service: b.service_type,
    });
  }

  // The organiser's own schedule items, reminders and notes.
  for (const r of rows) {
    if (r.dismissed || !r.kind || r.kind === "task") continue;
    const date = r.kind === "schedule" ? (r.due_date ?? eventDate) : r.due_date;
    if (r.kind === "note" && !date) continue; // undated notes live in Notes, not the timeline
    const time = shortTime(r.due_time) || null;
    add(date, {
      id: `row-${r.id}`,
      kind: r.kind as TimelineKind,
      title: r.title,
      subtitle: r.details,
      time,
      tone: r.done ? "done" : "plain",
      stored: { id: r.id, kind: r.kind, date: r.due_date, time, details: r.details, done: !!r.done, position: r.position ?? 0 },
    });
  }

  // The event itself always has a day on the timeline.
  if (input.startTime) {
    add(eventDate, { id: "event-start", kind: "event_start", title: "Your event begins", subtitle: null, time: shortTime(input.startTime), tone: "plain" });
  }
  if (input.endTime) {
    add(eventDate, { id: "event-end", kind: "event_end", title: "Your event ends", subtitle: null, time: shortTime(input.endTime), tone: "plain" });
  }
  if (!byDate.has(eventDate)) byDate.set(eventDate, []);

  const order = (a: TimelineItem, b: TimelineItem) =>
    (a.time ?? "99:99").localeCompare(b.time ?? "99:99") ||
    (a.stored?.position ?? 0) - (b.stored?.position ?? 0) ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);

  const dates = [...byDate.keys()].filter((d): d is string => d !== null).sort();
  const groups: TimelineGroup[] = [];
  const now = byDate.get(null);
  if (now?.length) groups.push({ key: "now", date: null, isEventDay: false, isPast: false, items: now.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) });
  for (const d of dates) {
    groups.push({ key: d, date: d, isEventDay: d === eventDate, isPast: d < today, items: byDate.get(d)!.sort(order) });
  }
  return groups;
}

const KIND_ORDER: TimelineKind[] = ["quote", "enquiry", "reminder", "event_start", "booking", "schedule", "note", "event_end"];

/** "In 42 days", "Tomorrow", "Today", "3 days ago". */
export function countdown(eventDate: string, today: string) {
  const d = daysBetween(today, eventDate);
  if (d === 0) return { days: 0, label: "Today" };
  if (d === 1) return { days: 1, label: "Tomorrow" };
  if (d > 1) return { days: d, label: `In ${d} days` };
  return { days: d, label: d === -1 ? "Yesterday" : `${-d} days ago` };
}

/** Weekday + day number for the timeline's date marker, without a timezone shift. */
export function dayMarker(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return {
    weekday: new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" }).format(date),
    day: d,
    month: new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" }).format(date),
    full: new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date),
  };
}
