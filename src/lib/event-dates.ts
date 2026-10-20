// Event dates are calendar days in Sydney. A quote request closes at the
// start of the event day (quote_expiry_for in the DB), so an event has to be
// at least tomorrow for a vendor to have any time to reply.

const SYDNEY_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" in Sydney, offsetDays from now. */
export function sydneyDate(offsetDays = 0, now = new Date()) {
  return SYDNEY_DAY.format(new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000));
}

/** The earliest event date that can be planned or quoted ("YYYY-MM-DD"). */
export function earliestEventDate(now = new Date()) {
  return sydneyDate(1, now);
}

export function isBookableEventDate(isoDate: string, now = new Date()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) && isoDate >= earliestEventDate(now);
}

export const EVENT_DATE_ERROR = "Pick an event date from tomorrow onwards.";
