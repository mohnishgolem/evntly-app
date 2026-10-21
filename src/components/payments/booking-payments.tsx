"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PlanEditor } from "@/components/payments/plan-editor";
import {
  disputeMilestone,
  payMilestone,
  respondToPaymentPlan,
  reviewMilestone,
  updateMilestoneWork,
} from "@/lib/actions/payments";
import { formatAud } from "@/lib/payments/money";
import { eventLabel, fundingLabel, milestoneStage, type StageTone } from "@/lib/payments/status";
import { createClient } from "@/lib/supabase/client";

export type PaymentMilestone = {
  id: string;
  position: number;
  kind: string;
  name: string;
  deliverables: string | null;
  amount_cents: number;
  due_date: string | null;
  work_status: string;
  funding_status: string;
  payout_status: string;
  vendor_note: string | null;
  customer_note: string | null;
  evidence: { path: string; url: string | null; name: string }[];
};

export type PaymentPlanView = {
  id: string;
  plan_type: string;
  status: string;
  total_cents: number;
  commission_bps: number;
  change_note: string | null;
};

export type PaymentEventView = { id: number; event: string; actor_role: string; created_at: string; milestone_name: string | null };

const TONE: Record<StageTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  attention: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
  danger: "bg-destructive/10 text-destructive",
};

const PLAN_TITLE: Record<string, string> = {
  deposit_milestones: "Deposit + milestones",
  full: "Full payment",
  milestones: "Milestone payments",
};

export function BookingPayments({
  role,
  bookingId,
  bookingStatus,
  eventDate,
  totalCents,
  commissionBps,
  plan,
  milestones,
  events,
  paymentsEnabled,
  vendorReady,
}: {
  role: "vendor" | "customer" | "admin";
  bookingId: string;
  bookingStatus: string;
  eventDate: string | null;
  totalCents: number;
  commissionBps: number;
  plan: PaymentPlanView | null;
  milestones: PaymentMilestone[];
  events: PaymentEventView[];
  paymentsEnabled: boolean;
  vendorReady: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const closed = bookingStatus === "cancelled";

  return (
    <section aria-labelledby="payments-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="payments-heading" className="text-lg font-semibold">
          Payments
        </h2>
        {plan && <span className="text-sm text-muted-foreground">{PLAN_TITLE[plan.plan_type]}</span>}
      </div>

      <p className="flex items-start gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>
          Payments go to Evntly and are held until the work is approved, then released to the vendor. Card details are
          handled by Stripe — Evntly never sees them.
        </span>
      </p>

      {!plan || editing || (role === "vendor" && plan.status === "changes_requested") ? (
        role === "vendor" && !closed ? (
          <div className="rounded-2xl border border-border p-4 sm:p-5">
            {plan?.status === "changes_requested" && plan.change_note && (
              <p className="mb-4 rounded-xl bg-warning/10 px-3 py-2 text-sm">
                <span className="font-medium">Customer asked:</span> {plan.change_note}
              </p>
            )}
            <h3 className="mb-1 font-semibold">{plan ? "Update the payment plan" : "Propose a payment plan"}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Split the {formatAud(totalCents)} booking into payments. The customer agrees before anything is charged.
            </p>
            <PlanEditor
              bookingId={bookingId}
              totalCents={totalCents}
              eventDate={eventDate}
              commissionBps={commissionBps}
              onDone={() => setEditing(false)}
            />
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {closed ? "This booking was cancelled." : "Waiting for the vendor to propose how this booking will be paid."}
          </p>
        )
      ) : (
        <>
          {plan.status === "proposed" && role === "customer" && <PlanReview plan={plan} />}
          {plan.status === "proposed" && role === "vendor" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 text-sm">
              <span>Waiting for the customer to agree to this plan.</span>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit plan
              </Button>
            </div>
          )}
          {plan.status === "changes_requested" && role === "customer" && (
            <p className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
              You asked for changes. The vendor will send an updated plan.
            </p>
          )}

          <ol className="space-y-3">
            {milestones.map((m) => (
              <MilestoneCard
                key={m.id}
                m={m}
                role={role}
                planId={plan.id}
                planLive={plan.status === "agreed" || plan.status === "active"}
                paymentsEnabled={paymentsEnabled}
                vendorReady={vendorReady}
                commissionBps={plan.commission_bps}
              />
            ))}
          </ol>

          {events.length > 0 && <Activity events={events} />}
        </>
      )}
    </section>
  );
}

function PlanReview({ plan }: { plan: PaymentPlanView }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function respond(agree: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await respondToPaymentPlan(plan.id, agree, note);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p className="font-semibold">Review your payment plan</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Check the payments below. Nothing is charged until you pay each one, and work payments are only released when you
        approve them.
      </p>
      {asking ? (
        <div className="mt-3 space-y-2">
          <Textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What would you like changed?" />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !note.trim()} onClick={() => respond(false)}>
              Send request
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => respond(true)}>
            Agree to plan
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => setAsking(true)}>
            Ask for changes
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function MilestoneCard({
  m,
  role,
  planId,
  planLive,
  paymentsEnabled,
  vendorReady,
  commissionBps,
}: {
  m: PaymentMilestone;
  role: "vendor" | "customer" | "admin";
  planId: string;
  planLive: boolean;
  paymentsEnabled: boolean;
  vendorReady: boolean;
  commissionBps: number;
}) {
  const router = useRouter();
  const stage = milestoneStage(m, role);
  const [mode, setMode] = useState<null | "submit" | "reject" | "dispute">(null);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unpaid = m.funding_status === "unfunded" || m.funding_status === "failed";
  const closed = ["cancelled", "disputed"].includes(m.work_status) || m.payout_status === "paid";
  const canPay = role === "customer" && planLive && unpaid && !closed;
  const canWork = role === "vendor" && planLive && m.kind !== "deposit" && ["pending", "in_progress", "rejected"].includes(m.work_status);
  const canReview = role === "customer" && m.work_status === "submitted";
  const canDispute = role !== "admin" && planLive && !closed && m.payout_status !== "processing" && m.funding_status === "funded";
  const vendorGets = m.amount_cents - Math.round((m.amount_cents * commissionBps) / 10_000);

  function run(fn: () => Promise<{ error?: string; url?: string } | null>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else if (res?.url) window.location.assign(res.url);
      else {
        setMode(null);
        setNote("");
        setFiles([]);
        router.refresh();
      }
    });
  }

  async function uploadEvidence() {
    const supabase = createClient();
    const paths: string[] = [];
    for (const file of files.slice(0, 5)) {
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is over 10 MB.`);
      const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${planId}/${crypto.randomUUID()}-${safe}`;
      const { error: uploadError } = await supabase.storage.from("milestone-evidence").upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(`Couldn't upload ${file.name}.`);
      paths.push(path);
    }
    return paths;
  }

  return (
    <li className="rounded-2xl border border-border p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{m.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{formatAud(m.amount_cents)}</span>
            {m.due_date && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden /> Due {m.due_date}
              </span>
            )}
            {role === "vendor" && <span>You receive {formatAud(vendorGets)}</span>}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", TONE[stage.tone])}>{stage.label}</span>
      </div>

      {m.deliverables && <p className="mt-2 text-sm whitespace-pre-line">{m.deliverables}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {stage.detail} · {fundingLabel(m.funding_status)}
      </p>

      {m.vendor_note && (
        <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-sm">
          <span className="font-medium">Vendor:</span> {m.vendor_note}
        </p>
      )}
      {m.customer_note && (
        <p className="mt-2 rounded-xl bg-secondary px-3 py-2 text-sm">
          <span className="font-medium">Customer:</span> {m.customer_note}
        </p>
      )}
      {m.evidence.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {m.evidence.map((e) => (
            <li key={e.path}>
              <a
                href={e.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
              >
                <FileText className="size-3.5" aria-hidden /> {e.name}
              </a>
            </li>
          ))}
        </ul>
      )}

      {mode ? (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              mode === "submit"
                ? "What did you deliver? (optional)"
                : mode === "reject"
                  ? "What still needs doing?"
                  : "Describe the problem for Evntly support"
            }
          />
          {mode === "submit" && (
            <label className="block text-sm">
              <span className="text-muted-foreground">Evidence (photos or PDF, up to 5 files, 10 MB each)</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="mt-1 block w-full text-sm"
              />
            </label>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || ((mode === "reject" || mode === "dispute") && !note.trim())}
              onClick={() =>
                run(async () => {
                  if (mode === "submit") {
                    const paths = files.length ? await uploadEvidence().catch((e: Error) => e) : [];
                    if (paths instanceof Error) return { error: paths.message };
                    return updateMilestoneWork(m.id, "submitted", note, paths);
                  }
                  if (mode === "reject") return reviewMilestone(m.id, false, note);
                  return disputeMilestone(m.id, note);
                })
              }
            >
              {mode === "submit" ? "Mark complete" : mode === "reject" ? "Send to vendor" : "Raise dispute"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {canPay &&
            (paymentsEnabled && vendorReady ? (
              <Button size="sm" disabled={pending} onClick={() => run(() => payMilestone(m.id))}>
                <Lock /> Pay {formatAud(m.amount_cents)}
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">
                {paymentsEnabled ? "Payment opens once the vendor finishes payout setup." : "Online payment isn't switched on yet."}
              </span>
            ))}
          {canReview && (
            <>
              <Button size="sm" disabled={pending} onClick={() => run(() => reviewMilestone(m.id, true))}>
                Approve{m.funding_status === "funded" ? " & release" : ""}
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("reject")}>
                Request changes
              </Button>
            </>
          )}
          {canWork && m.work_status === "pending" && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateMilestoneWork(m.id, "in_progress"))}>
              Start
            </Button>
          )}
          {canWork && (
            <Button size="sm" disabled={pending} onClick={() => setMode("submit")}>
              Mark complete
            </Button>
          )}
          {canDispute && (
            <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setMode("dispute")}>
              Report a problem
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

function Activity({ events }: { events: PaymentEventView[] }) {
  return (
    <details className="rounded-2xl border border-border px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">Payment history</summary>
      <ol className="mt-3 space-y-2">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap justify-between gap-x-3 text-sm">
            <span>
              {eventLabel(e.event)}
              {e.milestone_name && <span className="text-muted-foreground"> · {e.milestone_name}</span>}
            </span>
            <time dateTime={e.created_at} className="text-xs text-muted-foreground tabular-nums">
              {new Date(e.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" })}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}
