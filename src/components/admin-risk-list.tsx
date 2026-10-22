import Link from "next/link";
import { AdminRiskReview } from "@/components/admin-risk-review";
import { AdminVendorActions } from "@/components/admin-vendor-actions";
import { signalLabel, type RiskAccount } from "@/lib/risk";
import { cn } from "@/lib/utils";

const LEVEL_STYLE = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-champagne/15 text-warning",
  low: "bg-muted text-muted-foreground",
} as const;
const date = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });

export function AdminRiskList({ accounts }: { accounts: RiskAccount[] }) {
  return (
    <ul className="space-y-3">
      {accounts.map((a) => (
        <li key={a.user_id} className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", LEVEL_STYLE[a.level])}>
              {a.level} · {a.score}
            </span>
            <span className="min-w-0 font-medium break-all">{a.email ?? a.user_id}</span>
            <span className="text-xs text-muted-foreground capitalize">{a.role ?? "unknown"}</span>
            <span className="ml-auto text-xs text-muted-foreground">latest {date(a.latest_at)}</span>
          </div>
          <p className="flex flex-wrap gap-2 text-xs">
            {Object.entries(a.counts ?? {}).map(([k, n]) => (
              <span key={k} className="rounded-full bg-muted px-2.5 py-1">
                {signalLabel(k)}: {n}
              </span>
            ))}
          </p>
          <details className="text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">Evidence</summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {(a.evidence ?? []).map((e, i) => (
                <li key={i}>
                  {date(e.at)} · {signalLabel(e.kind)}
                  {e.detail ? ` · ${e.kind === "quick_cancel" ? "booking " : ""}${e.detail}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              <Link href="/admin/support" className="underline underline-offset-2">
                Reports and contact-attempt log
              </Link>
            </p>
          </details>
          {a.review_note && (
            <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs">
              Last review {a.reviewed_at ? date(a.reviewed_at) : ""}: {a.review_note}
            </p>
          )}
          {a.listings.length > 0 && (
            <ul className="space-y-2">
              {a.listings.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/vendor/${l.id}`} className="font-medium underline underline-offset-2">
                    {l.name}
                  </Link>
                  <span className="text-xs text-muted-foreground capitalize">{l.status.replace("_", " ")}</span>
                  {(l.status === "approved" || l.status === "suspended" || l.status === "rejected") && (
                    <AdminVendorActions vendorId={l.id} currentStatus={l.status} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {!a.reviewed && <AdminRiskReview userId={a.user_id} />}
        </li>
      ))}
    </ul>
  );
}
