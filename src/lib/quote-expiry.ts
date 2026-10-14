import { formatDistanceToNowStrict } from "date-fns";

// Mirrors the DB: open quote requests (pending → vendor must respond,
// quoted → customer must accept) carry an `expires_at` set by the
// `set_quote_request_expiry` trigger, and a pg_cron job flips overdue rows to
// "expired" every 15 minutes. Between cron runs a row can still say
// pending/quoted while being past its deadline, so the UI derives the
// effective status here rather than trusting `status` alone.

type QuoteLike = { status: string; expires_at: string | null };

const OPEN_STATUSES = new Set(["pending", "quoted"]);

export function isQuoteExpired(q: QuoteLike, now = Date.now()) {
  if (q.status === "expired") return true;
  return (
    OPEN_STATUSES.has(q.status) &&
    !!q.expires_at &&
    new Date(q.expires_at).getTime() <= now
  );
}

export function effectiveQuoteStatus(q: QuoteLike, now = Date.now()) {
  return isQuoteExpired(q, now) ? "expired" : q.status;
}

/** "in 3 days" for an open request, or null if there's no live deadline. */
export function quoteTimeLeft(q: QuoteLike, now = Date.now()) {
  if (!OPEN_STATUSES.has(q.status) || !q.expires_at || isQuoteExpired(q, now))
    return null;
  return formatDistanceToNowStrict(new Date(q.expires_at), { addSuffix: true });
}

/** Under a day left — worth highlighting. */
export function quoteExpiresSoon(q: QuoteLike, now = Date.now()) {
  if (!q.expires_at || isQuoteExpired(q, now)) return false;
  return new Date(q.expires_at).getTime() - now < 24 * 60 * 60 * 1000;
}
