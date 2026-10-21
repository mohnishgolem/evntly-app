import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { MilestoneAdminActions, PaymentsSwitch } from "@/components/payments/admin-payment-actions";
import { getPaymentsStatus } from "@/lib/payments/server";
import { commissionCents, formatAud } from "@/lib/payments/money";
import { milestoneStage } from "@/lib/payments/status";

export const metadata: Metadata = {
  title: "Payments",
  robots: { index: false, follow: false },
};

export default async function AdminPaymentsPage() {
  const { needsEnrol } = await requireAdminPage("/admin/payments");
  if (needsEnrol) return <AdminMfaRequired />;

  // Admin reads go through RLS (is_admin() with aal2), not the service role.
  const supabase = await createClient();
  const [status, { data: plans }, { data: milestones }] = await Promise.all([
    getPaymentsStatus(),
    supabase.from("payment_plans").select("id, booking_id, status, commission_bps"),
    supabase
      .from("payment_milestones")
      .select("id, plan_id, kind, name, amount_cents, work_status, funding_status, payout_status, last_error, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);
  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  const all = milestones ?? [];

  const attention = all.filter(
    (m) => m.work_status === "disputed" || m.payout_status === "failed" || m.funding_status === "failed"
  );
  const held = all.filter((m) => m.funding_status === "funded" && m.payout_status !== "paid");
  const heldCents = held.reduce((s, m) => s + m.amount_cents, 0);
  const commission = all
    .filter((m) => m.payout_status === "paid")
    .reduce((s, m) => s + commissionCents(m.amount_cents, planById.get(m.plan_id)?.commission_bps ?? 700), 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading title="Payments" description="Stripe Connect milestone payments." />

      <section className="mb-6 rounded-2xl border border-border p-5">
        <p className="mb-1 font-semibold">
          Online payments are {status.enabled ? "on" : "off"}
          {status.testMode && <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">Test mode</span>}
        </p>
        <p className="mb-3 text-sm text-muted-foreground">
          Commission {status.commissionBps / 100}% · Stripe card fees come out of Evntly&apos;s share.
        </p>
        <PaymentsSwitch
          enabled={status.enabled}
          canEnable={!!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET}
          reason={status.reason}
        />
      </section>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border p-4">
          <p className="text-2xl font-bold tabular-nums">{formatAud(heldCents)}</p>
          <p className="text-sm text-muted-foreground">Held, awaiting release ({held.length})</p>
        </div>
        <div className="rounded-2xl border border-border p-4">
          <p className="text-2xl font-bold tabular-nums">{formatAud(commission)}</p>
          <p className="text-sm text-muted-foreground">Commission earned (before Stripe fees)</p>
        </div>
        <div className="rounded-2xl border border-border p-4">
          <p className="text-2xl font-bold tabular-nums">{attention.length}</p>
          <p className="text-sm text-muted-foreground">Need attention</p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Needs attention</h2>
        {attention.length === 0 ? (
          <p className="text-sm text-muted-foreground">No disputes or failed payments.</p>
        ) : (
          <ul className="space-y-3">
            {attention.map((m) => (
              <li key={m.id} className="rounded-2xl border border-border p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <Link href={`/bookings/${planById.get(m.plan_id)?.booking_id}`} className="font-medium underline-offset-2 hover:underline">
                    {m.name}
                  </Link>
                  <span className="tabular-nums">{formatAud(m.amount_cents)}</span>
                </div>
                <p className="text-muted-foreground">{milestoneStage(m, "admin").label}</p>
                {m.last_error && <p className="mt-1 text-xs text-destructive">{m.last_error}</p>}
                <MilestoneAdminActions
                  milestoneId={m.id}
                  disputed={m.work_status === "disputed"}
                  payoutFailed={m.payout_status === "failed"}
                  refundable={m.funding_status === "funded" && m.payout_status !== "processing"}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent payments</h2>
        {all.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Milestone</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {all.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2">
                      <Link href={`/bookings/${planById.get(m.plan_id)?.booking_id}`} className="hover:underline">
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{milestoneStage(m, "admin").label}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatAud(m.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
