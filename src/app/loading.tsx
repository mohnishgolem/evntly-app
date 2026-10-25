// Shown the instant someone taps through to a page that's still loading on
// the server (dashboards, messages, profile…). The header and phone tab bar
// stay put — this only fills the page area — and Next prefetches it with
// each link, so navigation responds immediately instead of freezing until
// the whole page is ready.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 lg:max-w-4xl" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-7 w-48 animate-pulse rounded-md bg-muted" />
      <div className="mb-8 h-4 w-72 max-w-full animate-pulse rounded-md bg-muted/60" />
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/70" />
        ))}
      </div>
    </div>
  );
}
