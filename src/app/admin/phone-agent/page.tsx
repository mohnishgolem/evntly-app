import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/data/user";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/config";
import { missingConfig, phoneAgentConfig } from "@/lib/phone-agent/config";
import { formatAu, maskPhone } from "@/lib/phone-agent/phone";
import { costPer, rate } from "@/lib/growth";
import {
  completePhoneFollowup,
  recordDncrCheck,
  recordPhoneConsent,
  reviewPhoneCall,
  startPhoneAgentCall,
  suppressPhone,
  updatePhoneAgentSettings,
} from "@/lib/actions/admin-phone-agent";

export const metadata: Metadata = { title: "Phone agent", robots: { index: false, follow: false } };

type Settings = {
  mode: "off" | "prototype" | "pilot";
  prototype_numbers: string[];
  owner_name: string;
  owner_transfer_number: string | null;
  call_start: string;
  call_end: string;
  transfer_start: string;
  transfer_end: string;
  pilot_max_calls: number;
  daily_call_cap: number;
  budget_aud_cents: number;
  recording_enabled: boolean;
};
type Call = {
  id: string; ref: string; mode: string; prospect_id: string | null; phone_e164: string; vendor_name: string | null; category: string | null;
  status: string; created_at: string; duration_seconds: number | null; outcome: string | null; interest: string | null; objections: string[];
  summary: string | null; link_channel: string | null; cost_aud_cents: number | null; quality_score: number | null;
};
type Followup = { id: number; call_id: string; kind: string; due_at: string | null; email: string | null; notes: string | null };
type Prospect = { id: string; business_name: string; category: string | null; phone: string | null; stage: string };
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
type Table = { from: (t: string) => { select: (c: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> } } } };

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
const aud = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
const OUTCOME_LABEL: Record<string, string> = {
  interested: "Interested", link_sent: "Link sent", assisted_requested: "Wants assisted listing", callback_booked: "Callback booked",
  transferred: "Transferred to you", busy_call_later: "Busy, later", not_interested: "Not interested", already_registered: "Already on Evntly",
  opted_out: "Opted out (permanent)", voicemail: "Voicemail (hung up)", no_answer: "No answer", wrong_number: "Wrong number", other: "Other",
};

async function load() {
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const db = supabase as unknown as Table;
  const [settings, summary, calls, followups, prospects, suppressed] = await Promise.all([
    db.from("phone_agent_settings").select("*").order("id", { ascending: true }).limit(1),
    rpc("admin_phone_agent_summary"),
    db.from("phone_calls").select("id, ref, mode, prospect_id, phone_e164, vendor_name, category, status, created_at, duration_seconds, outcome, interest, objections, summary, link_channel, cost_aud_cents, quality_score").order("created_at", { ascending: false }).limit(50),
    db.from("phone_followups").select("id, call_id, kind, due_at, email, notes, status").order("due_at", { ascending: true }).limit(100),
    db.from("vendor_prospects").select("id, business_name, category, phone, stage, do_not_contact").order("updated_at", { ascending: false }).limit(200),
    db.from("phone_suppression").select("phone_e164").order("created_at", { ascending: false }).limit(1000),
  ]);
  const s = (settings.data?.[0] ?? null) as Settings | null;
  const prototypeBlockers = s?.prototype_numbers?.[0]
    ? (((await rpc("admin_phone_call_blockers", { p_prospect_id: null, p_phone: s.prototype_numbers[0] })).data as string[] | null) ?? [])
    : ["Add your own number to the prototype allow-list first."];
  return {
    notMigrated: !!settings.error,
    s,
    summary: Object.fromEntries(((summary.data ?? []) as { measure: string; value: number }[]).map((r) => [r.measure, Number(r.value)])),
    calls: (calls.data ?? []) as Call[],
    followups: ((followups.data ?? []) as (Followup & { status: string })[]).filter((f) => f.status === "open"),
    prospects: ((prospects.data ?? []) as (Prospect & { do_not_contact: boolean })[]).filter((p) => !p.do_not_contact),
    suppressedCount: (suppressed.data ?? []).length,
    prototypeBlockers,
  };
}

export default async function AdminPhoneAgentPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { needsEnrol } = await requireAdminPage("/admin/phone-agent");
  if (needsEnrol) return <AdminMfaRequired />;
  const { msg } = await searchParams;
  const { notMigrated, s, summary, calls, followups, prospects, suppressedCount, prototypeBlockers } = await load();
  const cfg = phoneAgentConfig();
  const missing = missingConfig(cfg);
  const m = (k: string) => summary[k] ?? 0;
  const spent = m("cost_aud_cents");
  const budget = s?.budget_aud_cents ?? 5000;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AdminHeading
        title="Phone agent"
        description="Evntly's AI assistant calls vendors who agreed to a call, explains Evntly, and logs the outcome. It always says it's an AI."
      />
      {msg && <p role="status" className="mb-6 rounded-2xl bg-muted p-4 text-sm">{msg}</p>}
      {notMigrated && (
        <p className="mb-6 rounded-2xl bg-warning/15 p-4 text-sm">
          The phone agent migration (20261202090000) isn&apos;t applied yet. Nothing on this page works until it is.
        </p>
      )}

      <section aria-label="Status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Mode" value={s?.mode ?? "off"} note={s?.mode === "pilot" ? `Up to ${s.pilot_max_calls} consenting vendors` : s?.mode === "prototype" ? "Only your approved numbers" : "No calls can be made"} />
        <Stat label="Spent / budget" value={`${aud(spent)} / ${aud(budget)}`} note="Provider cost per call, converted to AUD" />
        <Stat label="Recording" value={s?.recording_enabled ? "On" : "Off"} note="Off until legal review (NSW SDA)" />
        <Stat label="Do-not-call list" value={String(suppressedCount)} note="Permanent; numbers never removed" />
      </section>

      {missing.length > 0 && (
        <p className="mt-4 rounded-2xl border border-border p-4 text-sm">
          <span className="font-semibold">Not connected to Retell yet.</span> Set {missing.join(", ")} in the server environment. See{" "}
          <code>docs/phone-agent/README.md</code>. Nothing is purchased or deployed until you approve it.
        </p>
      )}

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border p-4">
          <h2 className="text-lg font-semibold">Prototype call to your phone</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only numbers on the prototype allow-list can be called in prototype mode.</p>
          <form action={startPhoneAgentCall} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              Number
              <select name="phone" className="h-10 rounded-xl border border-input bg-background px-3 text-sm" defaultValue={s?.prototype_numbers?.[0] ?? ""}>
                {(s?.prototype_numbers ?? []).map((n) => <option key={n} value={n}>{formatAu(n)}</option>)}
              </select>
            </label>
            <Button type="submit" disabled={missing.length > 0 || prototypeBlockers.length > 0 || !s?.prototype_numbers?.length}>Call me now</Button>
          </form>
          {prototypeBlockers.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{prototypeBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
          )}
        </div>

        <div className="rounded-2xl border border-border p-4">
          <h2 className="text-lg font-semibold">Pilot call to a vendor</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Needs pilot mode, the vendor&apos;s express consent to a call, a Do Not Call Register check in the last 30 days, and calling hours. The database refuses otherwise.
          </p>
          <form action={startPhoneAgentCall} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <ProspectSelect prospects={prospects} />
            <Input name="phone" placeholder="0411 222 333" className="h-10 rounded-xl" aria-label="Phone number" />
            <Button type="submit" disabled={missing.length > 0 || s?.mode !== "pilot"}>Call vendor</Button>
          </form>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Results</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
          <Metric k="Calls (pilot / prototype)" v={`${m("calls")} (${m("pilot_calls")} / ${m("prototype_calls")})`} />
          <Metric k="Answered and talked" v={`${m("connected")} (${rate(m("connected"), m("calls"))})`} />
          <Metric k="Interested" v={`${m("interested")} (${rate(m("interested"), m("connected"))})`} />
          <Metric k="Links sent" v={String(m("links_sent"))} />
          <Metric k="Assisted listing requests" v={String(m("assisted_requested"))} />
          <Metric k="Callbacks / transfers" v={`${m("callbacks")} / ${m("transfers")}`} />
          <Metric k="Opted out" v={String(m("opted_out"))} />
          <Metric k="Avg talk time" v={m("calls") ? `${Math.round(m("talk_seconds") / Math.max(m("calls"), 1))}s` : "—"} />
          <Metric k="Registrations from calls" v={String(m("registrations"))} />
          <Metric k="Completed listings from calls" v={String(m("listings_completed"))} />
          <Metric k="Cost per registration" v={costPer(spent, m("registrations"))} />
          <Metric k="Cost per completed listing" v={costPer(spent, m("listings_completed"))} />
          <Metric k="Conversation quality (your reviews)" v={m("reviewed_calls") ? `${(m("avg_quality_x10") / 10).toFixed(1)} / 5 (${m("reviewed_calls")} reviewed)` : "—"} />
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Registrations: a vendor account created after the call with the vendor&apos;s or the emailed address, or a sign-up through the call&apos;s link (?c=aicall-…). Test accounts excluded. Costs also appear in{" "}
          <Link href="/admin/growth" className="underline">Growth</Link> as &ldquo;AI phone calls&rdquo; spend.
        </p>
      </section>

      {followups.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Your follow-ups</h2>
          <ul className="space-y-2 text-sm">
            {followups.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border p-3">
                <span className="font-semibold">{f.kind === "callback" ? "Call back" : "Prepare assisted listing"}</span>
                <span className="tabular-nums">{fmt(f.due_at)}</span>
                {f.email && <span className="text-muted-foreground">{f.email}</span>}
                {f.notes && <span className="text-muted-foreground">{f.notes}</span>}
                {f.kind === "assisted_listing" && <Link className="underline" href="/admin/vendor-drafts">Open vendor drafts</Link>}
                <form action={completePhoneFollowup} className="ml-auto flex gap-1">
                  <input type="hidden" name="id" value={f.id} />
                  <Button size="sm" variant="outline" name="status" value="done">Done</Button>
                  <Button size="sm" variant="ghost" name="status" value="cancelled">Cancel</Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Calls</h2>
        {calls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {calls.map((c) => (
              <li key={c.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold">{c.vendor_name ?? "—"}</span>
                  <span className="text-muted-foreground">{c.category ? categoryLabel(c.category) : ""}</span>
                  <span className="text-muted-foreground">{maskPhone(c.phone_e164)}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{c.mode}</span>
                  <span>{c.outcome ? OUTCOME_LABEL[c.outcome] ?? c.outcome : c.status}</span>
                  {c.interest && <span className="text-muted-foreground">interest: {c.interest}</span>}
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {fmt(c.created_at)} · {c.duration_seconds != null ? `${c.duration_seconds}s` : "—"} · {c.cost_aud_cents != null ? aud(c.cost_aud_cents) : "—"}
                  </span>
                </div>
                {c.summary && <p className="mt-1">{c.summary}</p>}
                {c.objections?.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Objections: {c.objections.join(", ")}</p>}
                <form action={reviewPhoneCall} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <input type="hidden" name="call_id" value={c.id} />
                  <label className="flex items-center gap-1">
                    Quality
                    <select name="score" defaultValue={c.quality_score ?? ""} className="h-8 rounded-lg border border-input bg-background px-2">
                      <option value="" disabled>–</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <Input name="note" placeholder="What to improve" className="h-8 max-w-xs rounded-lg text-xs" />
                  <Button size="sm" variant="outline" type="submit">Save review</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-3">
        <form action={recordPhoneConsent} className="grid gap-2 rounded-2xl border border-border p-4">
          <h2 className="font-semibold">Record consent to a call</h2>
          <p className="text-xs text-muted-foreground">Express consent only (they said yes in writing, a form or a DM). A published number isn&apos;t consent. Lasts 3 months.</p>
          <ProspectSelect prospects={prospects} />
          <Input name="phone" placeholder="Their number" className="h-10 rounded-xl" aria-label="Their number" required />
          <select name="basis" className="h-10 rounded-xl border border-input bg-background px-3 text-sm" aria-label="How they agreed">
            <option value="express_dm_reply">Replied yes to a DM</option>
            <option value="express_written">Said yes by email / in writing</option>
            <option value="express_web_form">Ticked yes on a form</option>
          </select>
          <Input name="evidence" placeholder='Quote and date, e.g. IG DM 1 Dec: "yes call me"' className="h-10 rounded-xl" aria-label="Evidence" required minLength={10} />
          <Button type="submit" variant="outline">Save consent</Button>
        </form>

        <form action={recordDncrCheck} className="grid gap-2 rounded-2xl border border-border p-4">
          <h2 className="font-semibold">Do Not Call Register check</h2>
          <p className="text-xs text-muted-foreground">
            Check at <a className="underline" href="https://www.donotcall.gov.au/industry/" target="_blank" rel="noreferrer">donotcall.gov.au</a> (Quick check, under 10 numbers). Valid 30 days. Registered numbers go on the permanent list.
          </p>
          <Input name="phone" placeholder="Number checked" className="h-10 rounded-xl" aria-label="Number checked" required />
          <select name="on_register" className="h-10 rounded-xl border border-input bg-background px-3 text-sm" aria-label="Result">
            <option value="no">Not on the register</option>
            <option value="yes">On the register</option>
          </select>
          <Input name="reference" placeholder="Reference (optional)" className="h-10 rounded-xl" aria-label="Reference" />
          <input type="hidden" name="method" value="quick_check" />
          <Button type="submit" variant="outline">Save check</Button>
        </form>

        <form action={suppressPhone} className="grid gap-2 rounded-2xl border border-border p-4">
          <h2 className="font-semibold">Add to do-not-call list</h2>
          <p className="text-xs text-muted-foreground">Permanent. For anyone who asked not to be contacted in any channel.</p>
          <Input name="phone" placeholder="Number" className="h-10 rounded-xl" aria-label="Number" required />
          <Input name="reason" placeholder="Reason" className="h-10 rounded-xl" aria-label="Reason" />
          <Button type="submit" variant="outline">Add permanently</Button>
        </form>
      </section>

      {s && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Settings</h2>
          <form action={updatePhoneAgentSettings} className="grid gap-3 sm:grid-cols-3">
            <Field label="Mode">
              <select name="mode" defaultValue={s.mode} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
                <option value="off">Off</option>
                <option value="prototype">Prototype (your numbers only)</option>
                <option value="pilot">Pilot (consenting vendors)</option>
              </select>
            </Field>
            <Field label="Prototype numbers (comma-separated)"><Input name="prototype_numbers" defaultValue={s.prototype_numbers.map(formatAu).join(", ")} className="h-10 rounded-xl" /></Field>
            <Field label="Your name (the agent says it)"><Input name="owner_name" defaultValue={s.owner_name} className="h-10 rounded-xl" /></Field>
            <Field label="Transfer calls to"><Input name="owner_transfer_number" defaultValue={s.owner_transfer_number ? formatAu(s.owner_transfer_number) : ""} className="h-10 rounded-xl" /></Field>
            <Field label="Transfers from"><Input type="time" name="transfer_start" defaultValue={s.transfer_start.slice(0, 5)} className="h-10 rounded-xl" /></Field>
            <Field label="Transfers until"><Input type="time" name="transfer_end" defaultValue={s.transfer_end.slice(0, 5)} className="h-10 rounded-xl" /></Field>
            <Field label="Call vendors from (Mon–Fri)"><Input type="time" name="call_start" defaultValue={s.call_start.slice(0, 5)} className="h-10 rounded-xl" /></Field>
            <Field label="Call vendors until"><Input type="time" name="call_end" defaultValue={s.call_end.slice(0, 5)} className="h-10 rounded-xl" /></Field>
            <Field label="Pilot vendor limit"><Input type="number" name="pilot_max_calls" min={0} max={200} defaultValue={s.pilot_max_calls} className="h-10 rounded-xl" /></Field>
            <Field label="Calls per day"><Input type="number" name="daily_call_cap" min={0} max={100} defaultValue={s.daily_call_cap} className="h-10 rounded-xl" /></Field>
            <Field label="Testing budget (A$)"><Input type="number" name="budget_aud" min={0} step="1" defaultValue={s.budget_aud_cents / 100} className="h-10 rounded-xl" /></Field>
            <div className="flex items-end"><Button type="submit">Save settings</Button></div>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Legal hours are always enforced on top of these: weekdays 9am–8pm, Saturday 9am–5pm, never Sundays or national public holidays (Telemarketing Standard 2017 s8). Recording stays off; turning it on needs a recorded legal review.
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold capitalize tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/60 py-1 sm:block sm:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm">{label}{children}</label>;
}

function ProspectSelect({ prospects }: { prospects: Prospect[] }) {
  return (
    <select name="prospect_id" required className="h-10 rounded-xl border border-input bg-background px-3 text-sm" aria-label="Prospect" defaultValue="">
      <option value="" disabled>Choose a prospect</option>
      {prospects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.business_name}{p.category ? ` (${categoryLabel(p.category)})` : ""}
        </option>
      ))}
    </select>
  );
}
