// Minimal iCalendar (RFC 5545) writer for the vendor booking feed. Kept
// dependency-free: the feed only needs VEVENTs and one VTIMEZONE.

const TZID = "Australia/Sydney";

// Sydney's rules since 2008: AEDT (+11) from the first Sunday in October at
// 02:00, AEST (+10) from the first Sunday in April at 03:00. Clients use this
// block to interpret TZID-qualified times.
const SYDNEY_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:STANDARD",
  "DTSTART:20080406T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU",
  "TZOFFSETFROM:+1100",
  "TZOFFSETTO:+1000",
  "TZNAME:AEST",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:20081005T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU",
  "TZOFFSETFROM:+1000",
  "TZOFFSETTO:+1100",
  "TZNAME:AEDT",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
];

export type IcsEvent = {
  uid: string;
  /** YYYY-MM-DD, a Sydney calendar day. */
  date: string;
  /** "HH:MM" (24h) for a timed event; omit for all-day. */
  startTime?: string | null;
  durationHours?: number | null;
  summary: string;
  description?: string;
  location?: string | null;
  url?: string;
  status: "CONFIRMED" | "TENTATIVE";
  updatedAt: string;
};

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Lines longer than 75 octets are folded: CRLF + a single space.
function fold(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const pad = (n: number) => String(n).padStart(2, "0");
const compactDate = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const compactDateTime = (d: Date) =>
  `${compactDate(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;

// Wall-clock arithmetic in a UTC Date, so the server's own zone never leaks in.
function wallClock(date: string, time = "00:00") {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm));
}

/**
 * Best-effort parse of a free-text booking time ("18:30", "6pm", "6:30 pm")
 * to "HH:MM"; null means treat the booking as all-day.
 */
export function parseEventTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (match[3] === "pm" && hours < 12) hours += 12;
  if (match[3] === "am" && hours === 12) hours = 0;
  if (!match[3] && !match[2]) return null; // a bare "6" is too ambiguous
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

function eventLines(e: IcsEvent): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${compactDateTime(new Date(e.updatedAt))}Z`,
    `LAST-MODIFIED:${compactDateTime(new Date(e.updatedAt))}Z`,
  ];
  if (e.startTime) {
    const start = wallClock(e.date, e.startTime);
    const end = new Date(start.getTime() + (e.durationHours || 4) * 60 * 60 * 1000);
    lines.push(`DTSTART;TZID=${TZID}:${compactDateTime(start)}`);
    lines.push(`DTEND;TZID=${TZID}:${compactDateTime(end)}`);
  } else {
    const start = wallClock(e.date);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    lines.push(`DTSTART;VALUE=DATE:${compactDate(start)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(end)}`);
  }
  lines.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  lines.push(`STATUS:${e.status}`);
  // All-day bookings shouldn't block the vendor's whole day as "busy" in
  // free/busy views unless confirmed.
  lines.push(`TRANSP:${e.status === "CONFIRMED" ? "OPAQUE" : "TRANSPARENT"}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar(name: string, events: IcsEvent[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Evntly//Booking feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${TZID}`,
    // Hints for clients that honour them (Apple, Outlook); Google ignores.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...SYDNEY_VTIMEZONE,
    ...events.flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
