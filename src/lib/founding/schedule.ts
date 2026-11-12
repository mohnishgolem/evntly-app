// Scheduling helpers for founding-vendor invitation batches. Times are
// entered as Sydney wall-clock time and converted to UTC for Resend's
// scheduledAt; daylight saving (AEDT/AEST) is handled by the Intl timezone
// database, not a fixed offset.

export const SYDNEY_TZ = "Australia/Sydney";
/** Resend holds scheduled emails for up to 30 days. */
export const MAX_SCHEDULE_DAYS = 30;
/** Bookings closer than this are refused: the batch must finish booking first. */
export const MIN_LEAD_MINUTES = 5;

function sydneyParts(utc: Date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(utc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Some engines print midnight as "24" even with hourCycle h23.
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") % 24, min: get("minute") };
}

/**
 * "2026-11-03" + "10:00" in Sydney → the UTC instant. Null for invalid input
 * or a wall-clock time that doesn't exist (the hour skipped when daylight
 * saving starts).
 */
export function sydneyToUtc(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, m, d, h, min] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null;
  // Guess with the target as UTC, then correct by Sydney's offset at that
  // moment; a second pass settles the daylight-saving changeover.
  const target = Date.UTC(y, m - 1, d, h, min);
  let utc = target;
  for (let i = 0; i < 2; i++) {
    const p = sydneyParts(new Date(utc));
    utc += target - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  }
  const check = sydneyParts(new Date(utc));
  if (check.y !== y || check.m !== m || check.d !== d || check.h !== h || check.min !== min) return null;
  return new Date(utc);
}

// Built from numeric parts with fixed English names, not Intl's text output:
// Node and Safari ship different ICU data (spacing before "am", "Sep" vs
// "Sept", "AEDT" vs "GMT+11"), and any difference between the server render
// and the browser is a React hydration error (#418) in client components.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 3 Nov, 10:10 am AEDT" */
export function formatSydney(utc: Date) {
  const p = sydneyParts(utc);
  const wallClock = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  // Compare whole minutes: seconds in `utc` would otherwise skew the offset.
  const utcMinute = Math.floor(utc.getTime() / 60_000) * 60_000;
  const offsetMinutes = (wallClock - utcMinute) / 60_000;
  const zone = offsetMinutes === 660 ? "AEDT" : "AEST";
  const weekday = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  const hour12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const minutes = String(p.min).padStart(2, "0");
  return `${weekday} ${p.d} ${MONTHS[p.m - 1]}, ${hour12}:${minutes} ${p.h < 12 ? "am" : "pm"} ${zone}`;
}

/** "3 Nov" in Sydney, identical on server and in every browser; "—" for null. */
export function formatSydneyDay(iso: string | null, empty = "—") {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return empty;
  const p = sydneyParts(date);
  return `${p.d} ${MONTHS[p.m - 1]}`;
}

export type BatchPlan = { index: number; at: Date; ids: string[] }[];

/** Splits contacts into batches of `size`, `intervalMinutes` apart from `start`. */
export function planBatches(ids: string[], start: Date, size: number, intervalMinutes: number): BatchPlan {
  const plan: BatchPlan = [];
  for (let i = 0; i < ids.length; i += size) {
    const index = i / size;
    plan.push({ index, at: new Date(start.getTime() + index * intervalMinutes * 60_000), ids: ids.slice(i, i + size) });
  }
  return plan;
}

/** Why a batch plan can't be booked, or null if it can. */
export function planProblem(plan: BatchPlan, now = new Date()): string | null {
  if (plan.length === 0) return "No contacts to schedule.";
  const first = plan[0].at.getTime();
  const last = plan[plan.length - 1].at.getTime();
  if (first < now.getTime() + MIN_LEAD_MINUTES * 60_000) return `The first batch must be at least ${MIN_LEAD_MINUTES} minutes from now.`;
  if (last > now.getTime() + (MAX_SCHEDULE_DAYS - 1) * 86_400_000) return `Resend can only hold emails for ${MAX_SCHEDULE_DAYS} days.`;
  return null;
}
