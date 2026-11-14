"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  decideApplication,
  cancelScheduledSends,
  importWaitlist,
  scheduleInvitationCampaign,
  sendDueReminders,
  sendInvitations,
  sendReminders,
  sendNextBatch,
  sendTestInvitation,
  setBetaProgram,
  setFeedbackStatus,
  setReferralSpotlight,
  type AdminFoundingState,
} from "@/lib/actions/admin-founding";
import type { BetaAdminData, RecruitmentRow } from "@/lib/data/admin-founding";
import { VERDICT_LABEL, type ImportReport, type RowVerdict } from "@/lib/founding/import-check";
import { formatSydney, formatSydneyDay, planBatches, planProblem, sydneyToUtc } from "@/lib/founding/schedule";
import { categoryLabel, isVendorCategory } from "@/lib/config";
import { sourceLabel } from "@/lib/founding/sources";
import { cn } from "@/lib/utils";

function Result({ state }: { state: AdminFoundingState }) {
  if (!state) return null;
  return (
    <div role={state.error ? "alert" : "status"} className="text-sm">
      {state.error && <p className="text-destructive">{state.error}</p>}
      {state.message && <p className={state.success ? "text-success" : ""}>{state.message}</p>}
      {!!state.details?.length && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {state.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const fmt = (iso: string | null) =>
  formatSydneyDay(iso);

export function BetaProgramSettings({
  program,
}: {
  program: { capacity: number; invite_expiry_days: number; daily_send_limit: number; batch_size_limit: number };
}) {
  const [state, action, pending] = useActionState<AdminFoundingState, FormData>(setBetaProgram, null);
  const fields = [
    { name: "capacity", label: "Approved places", value: program.capacity, max: 1000 },
    { name: "invite_expiry_days", label: "Invite link expiry (days)", value: program.invite_expiry_days, max: 90 },
    { name: "daily_send_limit", label: "Max invitations per 24h", value: program.daily_send_limit, max: 1000 },
    { name: "batch_size_limit", label: "Max per batch", value: program.batch_size_limit, max: 100 },
  ];
  return (
    <form action={action} className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {fields.map((f) => (
          <div key={f.name} className="grid gap-1.5">
            <Label htmlFor={`bp-${f.name}`} className="text-xs">
              {f.label}
            </Label>
            <Input id={`bp-${f.name}`} name={f.name} type="number" min={f.name === "capacity" ? 0 : 1} max={f.max} defaultValue={f.value} required className="h-11" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function BetaSendingControls({
  live,
  maxBatch,
  invitable,
  remindersDue,
  scheduled,
}: {
  live: boolean;
  maxBatch: number;
  invitable: number;
  remindersDue: number;
  scheduled: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<AdminFoundingState>(null);
  const [count, setCount] = useState(Math.min(5, maxBatch));

  const run = (fn: () => Promise<AdminFoundingState>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      setState(null);
      setState(await fn());
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => sendTestInvitation("invitation"))}>
          Send test invitation to me
        </Button>
        <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => sendTestInvitation("reminder"))}>
          Send test reminder to me
        </Button>
        <Button size="lg" variant="ghost" nativeButton={false} render={<a href="/admin/beta-vendors/email-preview" target="_blank" rel="noopener noreferrer">Preview invitation</a>} />
        <Button size="lg" variant="ghost" nativeButton={false} render={<a href="/admin/beta-vendors/email-preview?kind=reminder" target="_blank" rel="noopener noreferrer">Preview reminder</a>} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="batch-count" className="text-xs">
            Contacts in next batch
          </Label>
          <Input
            id="batch-count"
            type="number"
            min={1}
            max={maxBatch}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(maxBatch, Number(e.target.value) || 1)))}
            className="h-11 w-28"
          />
        </div>
        <Button
          size="lg"
          disabled={pending || !live || invitable === 0}
          onClick={() =>
            run(
              () => sendNextBatch(count),
              `Send real invitations to the next ${count} waitlist contact${count === 1 ? "" : "s"}? This emails real people.`,
            )
          }
        >
          {pending ? "Working…" : `Send next ${count}`}
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={pending || !live || remindersDue === 0}
          onClick={() =>
            run(
              () => sendDueReminders(count),
              `Send a reminder to up to ${count} vendor${count === 1 ? "" : "s"} invited 3+ days ago who haven't signed up? This emails real people, once each.`,
            )
          }
        >
          {`Remind ${Math.min(count, remindersDue)} due`}
        </Button>
      </div>
      <ScheduleCampaign live={live} maxBatch={maxBatch} invitable={invitable} scheduled={scheduled} onRun={run} pending={pending} />
      <p className="text-xs text-muted-foreground">
        Reminders are never automatic: one per invitation, 3+ days after it, only to vendors who haven&apos;t signed up. Each
        reminder sends a fresh link.
      </p>
      {!live && (
        <p className="text-xs text-muted-foreground">
          Real sending is off. After you approve the campaign, set <code>BETA_INVITES_LIVE=true</code> in Vercel and redeploy.
        </p>
      )}
      <Result state={state} />
    </div>
  );
}

function tomorrowInSydney() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + 86_400_000),
  );
  return parts; // YYYY-MM-DD
}

function ScheduleCampaign({
  live,
  maxBatch,
  invitable,
  scheduled,
  onRun,
  pending,
}: {
  live: boolean;
  maxBatch: number;
  invitable: number;
  scheduled: number;
  onRun: (fn: () => Promise<AdminFoundingState>, confirmText?: string) => void;
  pending: boolean;
}) {
  const [date, setDate] = useState(tomorrowInSydney);
  const [time, setTime] = useState("10:00");
  const [count, setCount] = useState(Math.max(1, invitable));
  const [size, setSize] = useState(Math.min(10, maxBatch));
  const [interval, setIntervalMinutes] = useState(10);

  const start = sydneyToUtc(date, time);
  const n = Math.min(count, invitable);
  const plan = start ? planBatches(Array.from({ length: n }, (_, i) => String(i)), start, Math.max(1, size), Math.max(1, interval)) : [];
  const problem = !start ? "Enter a valid Sydney date and time." : planProblem(plan);
  const summary = plan.map((b) => `${formatSydney(b.at)}: ${b.ids.length}`).join("\n");

  return (
    <fieldset className="grid gap-3 rounded-2xl border border-border p-4">
      <legend className="px-1 text-sm font-semibold">Schedule invitations (Sydney time)</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="grid gap-1.5">
          <Label htmlFor="sch-date" className="text-xs">Date</Label>
          <Input id="sch-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sch-time" className="text-xs">First batch</Label>
          <Input id="sch-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sch-count" className="text-xs">Contacts (max {invitable})</Label>
          <Input id="sch-count" type="number" min={1} max={invitable} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sch-size" className="text-xs">Per batch (max {maxBatch})</Label>
          <Input id="sch-size" type="number" min={1} max={maxBatch} value={size} onChange={(e) => setSize(Math.max(1, Math.min(maxBatch, Number(e.target.value) || 1)))} className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sch-int" className="text-xs">Minutes apart</Label>
          <Input id="sch-int" type="number" min={1} max={240} value={interval} onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value) || 1))} className="h-11" />
        </div>
      </div>
      {n > 0 && !problem ? (
        <ul className="grid gap-0.5 text-xs text-muted-foreground">
          {plan.map((b) => (
            <li key={b.index}>
              Batch {b.index + 1}: {formatSydney(b.at)} · {b.ids.length} vendor{b.ids.length === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-destructive">{n === 0 ? "No eligible contacts to schedule." : problem}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          disabled={pending || !live || n === 0 || !!problem}
          onClick={() =>
            onRun(
              () => scheduleInvitationCampaign({ date, time, count: n, batchSize: size, intervalMinutes: interval }),
              `Book ${n} real invitation${n === 1 ? "" : "s"} with Resend?\n\n${summary}\n\nResend will send them at these times even if nobody is online. You can cancel any that haven't gone out yet.`,
            )
          }
        >
          {pending ? "Working…" : `Schedule ${n} invitation${n === 1 ? "" : "s"}`}
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={pending || scheduled === 0}
          onClick={() => onRun(() => cancelScheduledSends(), `Cancel all ${scheduled} scheduled email${scheduled === 1 ? "" : "s"} that haven't gone out yet?`)}
        >
          Cancel all scheduled ({scheduled})
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Booking happens now; Resend holds each email and sends it at its time (up to 30 days ahead), so it doesn&apos;t depend on
        Evntly&apos;s servers or your computer. Each contact gets one booking with its own link and duplicate protection.
      </p>
    </fieldset>
  );
}

export function WaitlistImport() {
  const [state, action, pending] = useActionState<AdminFoundingState, FormData>(importWaitlist, null);
  const report = state?.report;
  return (
    <form action={action} className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        CSV with a header row. Columns: <code>email</code> (required), <code>first_name</code>, <code>business_name</code>,{" "}
        <code>category</code>, <code>invite_consent</code> (yes/no) and <code>consent_note</code> (where they opted in);{" "}
        <code>suburb</code> and <code>consent_at</code> (when they signed up, Sydney time) are optional. Only rows with <code>invite_consent</code> = yes can be invited. <strong>Check file</strong>{" "}
        changes nothing. Imports skip registered vendors and undeliverable addresses, and never re-subscribe anyone.
      </p>
      <Input name="file" type="file" accept=".csv,text/csv" className="h-11 py-2" />
      <Textarea name="csv" rows={4} placeholder={"…or paste rows:\nemail,first_name,business_name,category,invite_consent,consent_note\njane@example.com,Jane,Jane Photo,photographer,yes,Waitlist form Sept 2026"} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="mode" value="check" size="lg" variant="outline" disabled={pending}>
          {pending ? "Working…" : "Check file"}
        </Button>
        <Button
          type="submit"
          name="mode"
          value="import"
          size="lg"
          variant="ghost"
          disabled={pending}
          onClick={(e) => {
            if (!window.confirm("Import these contacts into the waitlist? Nobody is emailed.")) e.preventDefault();
          }}
        >
          Import contacts
        </Button>
      </div>
      <Result state={state ? { ...state, details: report ? [] : state.details } : null} />
      {report && <ImportReportView report={report} />}
    </form>
  );
}

function ImportReportView({ report }: { report: ImportReport }) {
  const order: RowVerdict[] = ["eligible", "no_consent", "unsubscribed", "suppressed", "registered_vendor", "already_applied", "already_invited"];
  return (
    <div className="grid gap-3 rounded-2xl border border-border p-4 text-sm">
      <p>
        <strong>{report.rowsInFile}</strong> valid rows · {report.alreadyOnWaitlist} already on the waitlist · {report.withAccount} already
        have an Evntly account
      </p>
      <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {order.map((v) => (
          <div key={v} className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className={v === "eligible" ? "font-semibold" : "text-muted-foreground"}>{VERDICT_LABEL[v]}</dt>
            <dd className="tabular-nums">{report.counts[v]}</dd>
          </div>
        ))}
      </dl>
      {!!report.notes.length && (
        <details>
          <summary className="cursor-pointer text-xs font-medium">Row notes ({report.notes.length}), addresses masked</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {report.notes.slice(0, 200).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        Resend&apos;s own suppression list isn&apos;t checked here; Resend refuses those sends itself, and they show as failed.
      </p>
    </div>
  );
}

const INVITE_LABEL: Record<string, string> = {
  pending: "Not sent",
  sending: "Sending…",
  sent: "Sent",
  failed: "Failed",
  claimed: "Claimed",
  revoked: "Revoked",
};

function canSend(r: RecruitmentRow) {
  if (!r.waitlistId || !r.consent || r.unsubscribed || r.applicationId || r.scheduledFor) return false;
  if (r.inviteStatus === "claimed" || r.inviteStatus === "revoked" || r.inviteStatus === "sending") return false;
  if (r.inviteStatus === "sent" && r.lastSentAt && Date.now() - new Date(r.lastSentAt).getTime() < 86_400_000) return false;
  return true;
}

export function ContactsTable({ rows, live, maxBatch }: { rows: RecruitmentRow[]; live: boolean; maxBatch: number }) {
  const router = useRouter();
  const contacts = useMemo(() => rows.filter((r) => r.onWaitlist), [rows]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "invitable" | "invited" | "reminder" | "no-consent">("all");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<AdminFoundingState>(null);

  const visible = contacts.filter((r) =>
    filter === "invitable"
      ? canSend(r)
      : filter === "invited"
        ? r.sendCount > 0
        : filter === "reminder"
          ? r.reminderDue
          : filter === "no-consent"
            ? !r.consent || r.unsubscribed
            : true,
  );

  const send = (ids: string[]) => {
    if (!window.confirm(`Send ${ids.length} real invitation${ids.length === 1 ? "" : "s"}? This emails real people.`)) return;
    startTransition(async () => {
      setState(null);
      setState(await sendInvitations(ids));
      setSelected(new Set());
      router.refresh();
    });
  };
  const remind = (id: string) => {
    if (!window.confirm("Send this vendor a reminder with a fresh link? This emails a real person.")) return;
    startTransition(async () => {
      setState(null);
      setState(await sendReminders([id]));
      router.refresh();
    });
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (next.size < maxBatch) next.add(id);
      return next;
    });

  if (contacts.length === 0) return <p className="text-sm text-muted-foreground">No waitlist contacts yet. Import your list above.</p>;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "invitable", "invited", "reminder", "no-consent"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn("min-h-9 rounded-full border px-3 text-sm", filter === f ? "border-foreground bg-foreground text-background" : "border-border")}
          >
            {f === "all" ? "All" : f === "invitable" ? "Can invite" : f === "invited" ? "Invited" : f === "reminder" ? "Reminder due" : "No consent"}
          </button>
        ))}
        <Button size="sm" disabled={!live || pending || selected.size === 0} onClick={() => send([...selected])} className="ml-auto">
          Send to selected ({selected.size})
        </Button>
      </div>
      <Result state={state} />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2">
                <span className="sr-only">Select</span>
              </th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Consent</th>
              <th className="px-3 py-2">Invitation</th>
              <th className="px-3 py-2">Opened / clicked</th>
              <th className="px-3 py-2">Application</th>
              <th className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r) => {
              const sendable = canSend(r);
              return (
                <tr key={r.waitlistId}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.email}`}
                      disabled={!sendable || !live}
                      checked={selected.has(r.waitlistId!)}
                      onChange={() => toggle(r.waitlistId!)}
                      className="size-4 accent-primary"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="block font-medium">{r.firstName ?? "—"}</span>
                    <span className="block break-all text-xs text-muted-foreground">{r.email}</span>
                    {r.businessName && <span className="block text-xs text-muted-foreground">{r.businessName}</span>}
                    {r.wantsHelp && (
                      <span className="mt-1 block text-xs font-medium text-primary">
                        Wants help setting up{r.instagram ? ` · ${r.instagram}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.unsubscribed ? "Unsubscribed" : r.consent ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="block">{r.inviteStatus ? INVITE_LABEL[r.inviteStatus] : "—"}{r.sendCount > 1 ? ` (×${r.sendCount})` : ""}</span>
                    {r.delivery && r.delivery !== "sent" && <span className="block text-muted-foreground">{r.delivery.replace("_", " ")}</span>}
                    {r.lastSentAt && <span className="block text-muted-foreground">{fmt(r.lastSentAt)}</span>}
                    {r.scheduledFor && <span className="block font-medium">Scheduled {formatSydney(new Date(r.scheduledFor))}</span>}
                    {r.reminderSentAt && !r.scheduledFor && <span className="block text-muted-foreground">Reminded {fmt(r.reminderSentAt)}</span>}
                    {r.reminderDue && <span className="block font-medium text-primary">Reminder due</span>}
                    {r.inviteError && <span className="block text-destructive">{r.inviteError}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {fmt(r.openedAt)} / {fmt(r.clickedAt)}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.applicationStatus ? r.applicationStatus.replace("_", " ") : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {sendable && !r.reminderDue && (
                      <Button size="sm" variant="outline" disabled={!live || pending} onClick={() => send([r.waitlistId!])}>
                        {r.sendCount > 0 ? "Resend" : "Send"}
                      </Button>
                    )}
                    {r.reminderDue && (
                      <Button size="sm" variant="outline" disabled={!live || pending} onClick={() => remind(r.waitlistId!)}>
                        Remind
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const APP_LABEL: Record<string, string> = {
  started: "Started (no listing yet)",
  submitted: "Pending review",
  approved: "Approved",
  needs_changes: "Needs changes",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function ApplicationsList({ rows, full }: { rows: RecruitmentRow[]; full: boolean }) {
  const apps = rows.filter((r) => r.applicationId);
  const order = ["submitted", "needs_changes", "started", "approved", "rejected", "withdrawn"];
  apps.sort((a, b) => order.indexOf(a.applicationStatus!) - order.indexOf(b.applicationStatus!));
  if (apps.length === 0) return <p className="text-sm text-muted-foreground">No applications yet.</p>;
  return (
    <ul className="grid gap-3">
      {apps.map((r) => (
        <ApplicationCard key={r.applicationId} row={r} full={full} />
      ))}
    </ul>
  );
}

function ApplicationCard({ row: r, full }: { row: RecruitmentRow; full: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteFor, setNoteFor] = useState<"needs_changes" | "rejected" | null>(null);

  const decide = (decision: "approved" | "needs_changes" | "rejected") =>
    startTransition(async () => {
      setError(null);
      const res = await decideApplication(r.applicationId!, decision, note);
      if (res?.error) setError(res.error);
      else {
        setNoteFor(null);
        setNote("");
        router.refresh();
      }
    });

  const open = r.applicationStatus === "submitted" || r.applicationStatus === "needs_changes";
  return (
    <li className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{r.listingName ?? r.businessName ?? r.email}</p>
          <p className="break-all text-xs text-muted-foreground">
            {r.email}
            {r.category ? ` · ${isVendorCategory(r.category) ? categoryLabel(r.category) : r.category}` : ""} · {sourceLabel(r.source ?? "direct")}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{APP_LABEL[r.applicationStatus!] ?? r.applicationStatus}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Listing: {r.listingName ? `${r.listingName} (${r.listingStatus ?? "?"})` : "not created yet"}
        {r.onboardingPercent != null ? ` · Profile ${r.onboardingPercent}% complete` : ""}
        {r.submittedAt ? ` · Submitted ${fmt(r.submittedAt)}` : ""}
      </p>
      {!!r.onboardingTodo.length && <p className="mt-1 text-xs text-muted-foreground">To do: {r.onboardingTodo.join("; ")}</p>}
      {r.adminNote && <p className="mt-1 text-xs">Note: {r.adminNote}</p>}
      {r.listingId && (
        <a href={`/vendor/${r.listingId}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-medium underline underline-offset-2">
          View listing
        </a>
      )}

      {noteFor && (
        <div className="mt-3 grid gap-2">
          <Label htmlFor={`note-${r.applicationId}`} className="text-xs">
            {noteFor === "needs_changes" ? "What should they change? (emailed to the vendor)" : "Reason (optional, emailed to the vendor)"}
          </Label>
          <Textarea id={`note-${r.applicationId}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => decide(noteFor)}>
              {noteFor === "needs_changes" ? "Send request" : "Reject application"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNoteFor(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!noteFor && r.applicationStatus !== "withdrawn" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {open && (
            <Button
              size="sm"
              disabled={pending || !r.listingId || full}
              title={full ? "All places are filled — raise the capacity first" : undefined}
              onClick={() => {
                if (window.confirm("Approve? This approves the listing (it goes live on Explore), marks it Founding and emails the vendor.")) decide("approved");
              }}
            >
              Approve listing + place
            </Button>
          )}
          {r.applicationStatus !== "needs_changes" && r.applicationStatus !== "rejected" && r.applicationStatus !== "started" && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setNoteFor("needs_changes")}>
              Needs changes
            </Button>
          )}
          {r.applicationStatus !== "rejected" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setNoteFor("rejected")}>
              Reject
            </Button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </li>
  );
}

type FeedbackItem = { id: string; kind: string; area: string; message: string; status: string; created_at: string; email: string | null; rating: number | null; page: string | null };

export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No feedback yet.</p>;
  return (
    <ul className="grid gap-3">
      {items.map((f) => (
        <li key={f.id} className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              <span className={cn("mr-2 rounded-full px-2 py-0.5 font-semibold", f.kind === "bug" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground")}>
                {f.kind === "bug" ? "Bug" : "Feedback"}
              </span>
              {f.area} · {f.email ?? "unknown"} · {fmt(f.created_at)}
              {f.rating ? ` · ${f.rating}/5` : ""}
            </span>
            <select
              aria-label="Feedback status"
              defaultValue={f.status}
              disabled={pending}
              onChange={(e) =>
                startTransition(async () => {
                  await setFeedbackStatus(f.id, e.target.value as "new" | "reviewed" | "resolved");
                  router.refresh();
                })
              }
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <p className="mt-2 text-sm whitespace-pre-wrap">{f.message}</p>
          {f.page && <p className="mt-1 text-xs text-muted-foreground">Page: {f.page}</p>}
        </li>
      ))}
    </ul>
  );
}

export function ReferralsList({ items }: { items: BetaAdminData["referrals"] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No founding vendor has opened their invite link yet.</p>;
  const toggle = (id: string, posted: boolean) =>
    startTransition(async () => {
      const res = await setReferralSpotlight(id, posted);
      setError(res?.error ?? null);
      router.refresh();
    });
  return (
    <>
      {error && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Founding vendor</th>
              <th className="px-3 py-2 text-right">Joined</th>
              <th className="px-3 py-2 text-right">Submitted</th>
              <th className="px-3 py-2 text-right">Approved</th>
              <th className="px-3 py-2">Instagram spotlight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((r) => (
              <tr key={r.applicationId}>
                <td className="px-3 py-2">
                  <span className="font-medium">{r.name}</span>
                  <code className="ml-2 text-xs text-muted-foreground">{r.code}</code>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.joined}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.submitted}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.approved}</td>
                <td className="px-3 py-2">
                  {r.spotlightPostedAt ? (
                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-success">Posted {fmt(r.spotlightPostedAt)}</span>
                      <Button size="xs" variant="ghost" disabled={pending} onClick={() => toggle(r.applicationId, false)}>
                        Undo
                      </Button>
                    </span>
                  ) : r.spotlightDue ? (
                    <Button size="sm" disabled={pending} onClick={() => toggle(r.applicationId, true)}>
                      Mark spotlight posted
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Due after their first approved invitee</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("Copy this link", url);
        }
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted/60"
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
