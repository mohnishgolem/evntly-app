import { formatDistanceToNowStrict } from "date-fns";
import type { ErrorSummaryEntry } from "@/lib/data/admin";

export function AdminErrorLog({ errors }: { errors: ErrorSummaryEntry[] }) {
  if (errors.length === 0) {
    return <p className="text-sm text-muted-foreground">No errors in the last 7 days.</p>;
  }

  return (
    <div className="divide-y divide-border rounded-2xl border border-border">
      {errors.map((e) => (
        <details key={e.fingerprint} className="group px-4 py-3">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium break-words">{e.message}</p>
              <p className="mt-0.5 text-xs break-all text-muted-foreground">
                {e.source === "server" ? "Server" : "Browser"} · {e.last_path ?? e.last_route ?? "unknown page"}
              </p>
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">{e.occurrences}×</p>
              <p>{formatDistanceToNowStrict(new Date(e.last_seen), { addSuffix: true })}</p>
            </div>
          </summary>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>First seen {formatDistanceToNowStrict(new Date(e.first_seen), { addSuffix: true })}</p>
            {e.last_route && <p>Route: {e.last_route}</p>}
            {e.last_digest && <p>Digest: {e.last_digest}</p>}
            {e.last_stack && (
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                {e.last_stack}
              </pre>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
