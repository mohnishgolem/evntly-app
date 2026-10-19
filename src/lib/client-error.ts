// Browser side of error monitoring: posts to /api/client-errors with
// sendBeacon (survives page unloads), falling back to fetch. Deduplicated per
// page load and capped so a render loop can't flood the endpoint.

const sent = new Set<string>();
const MAX_PER_PAGE = 5;

// Noise that isn't ours: browser extensions, cross-origin script errors with
// no detail, and the harmless ResizeObserver warning.
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /extension:\/\//i];

export function reportClientError(error: unknown, extra: { digest?: string } = {}) {
  try {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
    const stack = error instanceof Error ? error.stack ?? "" : "";
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
