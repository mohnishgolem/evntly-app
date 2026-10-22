import { z } from "zod";

// Event start/end are Sydney wall-clock "HH:MM". An end at or before the
// start means the event runs past midnight (e.g. 19:00–01:00).

export const NOT_LOGGED_IN = "Not logged in";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const time = z
  .string()
  .regex(TIME_RE, "Use a time like 18:30.")
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Both or neither, and not the same time. */
export const eventTimesSchema = z
  .object({ startTime: time, endTime: time })
  .refine((t) => !t.startTime === !t.endTime, "Add both a start and an end time, or neither.")
  .refine((t) => !t.startTime || t.startTime !== t.endTime, "The end time can't be the same as the start time.");

/** "18:00:00" (Postgres time) → "18:00". */
export function shortTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}

/** "6:00 pm – 10:00 pm (4 hrs)". */
export function formatEventTimes(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
  };
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const hours = Math.round((mins / 60) * 10) / 10;
  return `${fmt(start)} – ${fmt(end)} (${hours} hr${hours === 1 ? "" : "s"})`;
}
