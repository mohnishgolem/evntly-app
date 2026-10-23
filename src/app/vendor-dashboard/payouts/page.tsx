import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, Clock, ShieldCheck } from "lucide-react";
import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { PayoutActions } from "@/components/payments/payout-actions";
import { formatAud } from "@/lib/payments/money";
import { milestoneStage } from "@/lib/payments/status";
import { getPaymentsStatus } from "@/lib/payments/server";

export const metadata: Metadata = {
  title: "Payouts",
  robots: { index: false, follow: false },
};

export default async function VendorPayoutsPage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const session = await requireVendor("/vendor-dashboard/payouts");
  const { return: returned } = await searchParams;
  const supabase = await createClient();

  const [{ data: account }, { data: plans }, status] = await Promise.all([
    supabase.from("stripe_accounts").select("*").eq("user_id", session.user.id).maybeSingle(),
    supabase.from("payment_plans").select("id, booking_id").eq("vendor_user_id", session.user.id),
    getPaymentsStatus(),
  ]);
  const { data: milestones } = plans?.length
    ? await supabase
        .from("payment_milestones")
        .select("id, plan_id, kind, name, amount_cents, payout_cents, work_status, funding_status, payout_status, paid_out_at")
        .in("plan_id", plans.map((p) => p.id))
        .order("updated_at", { ascending: false })
        .limit(50)
    : { data: [] };
  const bookingFor = new Map((plans ?? []).map((p) => [p.id, p.booking_id]));

  const ready = !!account?.transfers_active;
  const paidTotal = (milestones ?? []).reduce((sum, m) => sum + (m.payout_status === "paid" ? m.payout_cents ?? 0 : 0), 0);
  const heldTotal = (milestones ?? []).reduce(
    (sum, m) => sum + (m.funding_status === "funded" && m.payout_status !== "paid" ? m.amount_cents : 0),
    0
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Payouts</h1>
      <p className="mb-6 text-sm text-muted-foreground">How customers&apos; payments reach your bank account.</p>
      <Link href="/vendor-dashboard/profile" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Profile
      </Link>

      <section className="mb-6 rounded-2xl border border-border p-5">
        <div className="mb-3 flex items-center gap-2">
          {ready ? (
            <CheckCircle2 className="size-5 text-success" aria-hidden />
          ) : (
            <Clock className="size-5 text-warning" aria-hidden />
          )}
          <h2 className="font-semibold">{ready ? "Payouts are set up" : account ? "Payout setup isn't finished" : "Set up payouts"}</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {ready
            ? "Released payments go to your Stripe account and then to your bank on Stripe's payout schedule."
            : "Evntly uses Stripe to verify your identity and pay you. It takes about 5 minutes — have your ABN (if you have one) and bank details ready. Customers can't pay online until this is done."}
        </p>
        {!!account?.requirements_due?.length && !ready && (
          <p className="mb-4 rounded-xl bg-warning/10 px-3 py-2 text-sm">Stripe still needs a few details from you.</p>
        )}
        {status.reason === "Stripe isn't connected yet" ? (
          <p className="text-sm text-muted-foreground">Online payments are coming soon.</p>
        ) : (
          <PayoutActions hasAccount={!!account} ready={ready} returned={returned === "1"} />
        )}
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Your bank and identity details are collected and stored by Stripe, not Evntly.
        </p>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border p-4">
          <p className="text-2xl font-bold tabular-nums">{formatAud(heldTotal)}</p>
          <p className="text-sm text-muted-foreground">Paid by customers, awaiting release</p>
        </div>
        <div className="rounded-2xl border border-border p-4">
          <p className="text-2xl font-bold tabular-nums">{formatAud(paidTotal)}</p>
          <p className="text-sm text-muted-foreground">Released to you</p>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Payments</h2>
      {!milestones?.length ? (
        <p className="text-sm text-muted-foreground">No payments yet. Propose a payment plan from a booking to get started.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {milestones.map((m) => {
            const stage = milestoneStage(m, "vendor");
            return (
              <li key={m.id}>
                <Link
                  href={`/bookings/${bookingFor.get(m.plan_id)}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.name}</span>
                    <span className="block text-xs text-muted-foreground">{stage.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatAud(m.payout_status === "paid" ? m.payout_cents ?? m.amount_cents : m.amount_cents)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
