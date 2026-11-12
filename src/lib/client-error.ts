// Browser side of error monitoring: posts to /api/client-errors with
// sendBeacon (survives page unloads), falling back to fetch. Deduplicated per
// page load and capped so a render loop can't flood the endpoint.

const sent = new Set<string>();
const MAX_PER_PAGE = 5;

// Noise that isn't ours: browser extensions, cross-origin script errors with
// no detail, and the harmless ResizeObserver warning.
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /extension:\/\//i];

/**
 * Message + stack from anything thrown. Errors from another JS realm (an
 * iframe, or a script an in-app browser such as Instagram's injects) fail
 * `instanceof Error`, and in Safari JSON.stringify of one keeps only
 * {line, column, sourceURL} — so read the fields directly. The only thing
 * skipped that wasn't before is that location-only shape with no message and
 * no stack: nothing in it says what failed. Everything else is still reported.
 */
const LOCATION_ONLY = new Set(["line", "column", "sourceURL"]);

export function describeError(error: unknown): { message: string; stack: string } | null {
  if (error === undefined) return null;
  if (typeof error === "string") return error ? { message: error, stack: "" } : null;
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; stack?: unknown };
    const message = typeof e.message === "string" ? e.message : "";
    const stack = typeof e.stack === "string" ? e.stack : "";
    if (message || stack) return { message: message || stack.split("\n")[0], stack };
    const keys = Object.keys(error);
    if (keys.length > 0 && keys.every((k) => LOCATION_ONLY.has(k))) return null;
  }
  const json = JSON.stringify(error);
  return { message: json ?? String(error), stack: "" };
}

export function reportClientError(error: unknown, extra: { digest?: string } = {}) {
  try {
    const described = describeError(error);
    if (!described) return;
    const { message, stack } = described;
    if (!message || IGNORED.some((re) => re.test(message) || re.test(stack))) return;
    if (sent.has(message) || sent.size >= MAX_PER_PAGE) return;
    sent.add(message);

    const body = JSON.stringify({
      message: message.slice(0, 1000),
      stack: stack.slice(0, 4000),
      digest: extra.digest,
      path: window.location.pathname,
    });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/client-errors", blob)) {
      void fetch("/api/client-errors", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Reporting must never throw.
  }
}
