import { categoryLabel } from "@/lib/config";
import type { ExplainedCategory } from "@/lib/data/admin-matching";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; className: string }> = {
  eligible: { label: "Matched", className: "bg-success/10 text-success" },
  unconfirmed: { label: "Pending", className: "bg-muted text-muted-foreground" },
  excluded: { label: "Excluded", className: "bg-destructive/10 text-destructive" },
};
const PARTS = ["suitability", "budget", "quality", "location", "reliability"] as const;
const aud = (cents: number) => `$${(cents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;

// Why each listing was matched or left out for this event, as matching runs
// right now. Admin-only, read-only.
export function AdminMatchExplainer({ enabled, categories }: { enabled: boolean; categories: ExplainedCategory[] }) {
  if (categories.length === 0) return <p className="text-sm text-muted-foreground">No vendor categories chosen.</p>;
  return (
    <div className="space-y-3">
      {!enabled && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm">
          Smart matching is switched off — customers see simple suggestions. This shows what it would do.
        </p>
      )}
      {categories.map((c) => (
        <details key={c.service} className="rounded-2xl border border-border" open={categories.length === 1}>
          <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium">{categoryLabel(c.service)}</span>
            <span className="text-xs text-muted-foreground">
              {c.vendors.filter((v) => v.status === "eligible").length} matched ·{" "}
              {c.vendors.filter((v) => v.status === "unconfirmed").length} pending ·{" "}
              {c.vendors.filter((v) => v.status === "excluded").length} excluded
              {c.budgetCents != null ? ` · budget ${aud(c.budgetCents)}` : ""}
              {c.widened ? " · area widened" : ""}
            </span>
          </summary>
          {c.vendors.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No listings in this category at all.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border text-sm">
              {c.vendors.map((v) => (
                <li key={v.id} className="space-y-1 px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[v.status].className)}>
                      {STATUS[v.status].label}
                    </span>
                    <span className="font-medium">{v.name}</span>
                    {v.isDemo && <span className="text-xs text-muted-foreground">(sample)</span>}
                    {v.score != null && <span className="ml-auto font-semibold">{v.score}/100</span>}
                  </p>
                  {v.exclusions.length > 0 && <p className="text-destructive">{v.exclusions.join(" · ")}</p>}
                  {v.pending.length > 0 && <p className="text-muted-foreground">Pending: {v.pending.join(" · ")}</p>}
                  {v.reason && <p className="text-muted-foreground">{v.reason}</p>}
                  {v.parts && (
                    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {PARTS.map((p) => (
                        <span key={p}>
                          {p} {Math.round(v.parts![p] * 100)}%
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {v.estimateCents != null ? `Estimate ${aud(v.estimateCents)}` : "No price"}
                    {v.distanceKm != null ? ` · ${v.distanceKm} km` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </div>
  );
}
