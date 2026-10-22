import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/data/user";
import { loadDisputeQueue, type AdminDisputeRow } from "@/lib/data/disputes";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { DISPUTE_SLA_DAYS, DISPUTE_STATUS_LABEL, disputeAgeDays, outcomeLabel, reasonLabel } from "@/lib/disputes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Disputes",
  robots: { index: false, follow: false },
};

type AgedDispute = AdminDisputeRow & { age: number };

/** Days waiting, computed once per request (outside render). */
function withAges(rows: AdminDisputeRow[], now = Date.now()): AgedDispute[] {
  return rows.map((d) => ({ ...d, age: disputeAgeDays(d.created_at, now) }));
}

function Row({ d }: { d: AgedDispute }) {
  const age = d.age;
  const live = d.status === "open" || d.status === "under_review";
  return (
    <li>
      <Link href={`/admin/disputes/${d.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/60 sm:flex-row sm:items-center sm:gap-4">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            {reasonLabel(d.reason)} <span className="font-normal text-muted-foreground">· raised by the {d.opened_by_role}</span>
          </span>
          <span className="block truncate text-sm text-muted-foreground">{d.description}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs">
          <span className="rounded-full bg-muted px-2 py-0.5">{d.status === "resolved" ? outcomeLabel(d.outcome) : DISPUTE_STATUS_LABEL[d.status]}</span>
          {live && (
            <span className={cn("rounded-full px-2 py-0.5 font-medium", age > DISPUTE_SLA_DAYS ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
              {age === 0 ? "today" : `${age}d`}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

export default async function AdminDisputesPage() {
  const { needsEnrol } = await requireAdminPage("/admin/disputes");
  if (needsEnrol) return <AdminMfaRequired />;
  const queue = await loadDisputeQueue();
  const live = withAges(queue.live);
  const closed = withAges(queue.closed);
  const overdue = live.filter((d) => d.age > DISPUTE_SLA_DAYS).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading
        title="Disputes"
        description={`Problems raised on bookings. Aim to respond within ${DISPUTE_SLA_DAYS} days${overdue ? ` — ${overdue} overdue` : ""}.`}
      />
      <section aria-labelledby="live" className="mb-10">
        <h2 id="live" className="mb-3 text-lg font-semibold">Needs attention ({live.length})</h2>
        {live.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open disputes.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {live.map((d) => (
              <Row key={d.id} d={d} />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="closed">
        <h2 id="closed" className="mb-3 text-lg font-semibold">Recently closed</h2>
        {closed.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {closed.map((d) => (
              <Row key={d.id} d={d} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
