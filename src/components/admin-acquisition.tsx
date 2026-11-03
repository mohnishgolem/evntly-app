"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { importProspects, prospectAction, setProspectConsent, type AcquisitionState } from "@/lib/actions/admin-acquisition";
import { actionsFor, CONSENT_BASES, PROSPECT_STAGES, stageLabel, VENDOR_STAGES } from "@/lib/acquisition/pipeline";
import type { AcquisitionData } from "@/lib/data/admin-acquisition";
import { cn } from "@/lib/utils";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }) : "—";

function Notice({ state }: { state: AcquisitionState }) {
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

// Funnel from discovery to active vendor. The first six stages are research
// prospects; the last four count every founding applicant (waitlist,
// Instagram, referrals and prospects alike).
export function AcquisitionFunnel({ funnel }: { funnel: AcquisitionData["funnel"] }) {
  const max = Math.max(1, ...funnel.map((f) => f.count));
  return (
    <ol className="grid gap-1.5">
      {funnel.map((f) => (
        <li key={f.stage} className="grid grid-cols-[9.5rem_1fr_3rem] items-center gap-2 text-sm">
          <span className={cn("truncate", f.scope === "all" && "font-medium")}>{f.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className={cn("block h-full rounded-full", f.scope === "all" ? "bg-success" : "bg-primary")} style={{ width: `${(f.count / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">{f.count}</span>
        </li>
      ))}
    </ol>
  );
}

export function ProspectImport() {
  const [state, action, pending] = useActionState<AcquisitionState, FormData>(importProspects, null);
  return (
    <form action={action} className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        CSV with a header row: <code>business_name</code> (required), <code>category</code>, <code>location</code>, <code>website</code>,{" "}
        <code>public_email</code>, <code>instagram</code>, <code>phone</code>, <code>source_url</code>, <code>lead_quality</code> (A/B/C) and{" "}
        <code>contact_eligibility</code> or <code>consent_basis</code>. A business email only counts as contactable when the file says it&apos;s
        published on their own site (&quot;Email OK…&quot;). <strong>Check file</strong> changes nothing. Imports skip existing prospects, the waitlist,
        Evntly accounts and existing listings. Nobody is contacted.
      </p>
      <Input name="file" type="file" accept=".csv,text/csv" className="h-11 py-2" />
      <Textarea name="csv" rows={3} placeholder={"…or paste rows:\nbusiness_name,category,location,public_email,contact_eligibility\nJane Photo,Photographer,Parramatta,hello@janephoto.com.au,Email OK (published)"} />
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
            if (!window.confirm("Import these prospects? Nobody is contacted.")) e.preventDefault();
          }}
        >
          Import prospects
        </Button>
      </div>
      <Notice state={state} />
    </form>
  );
}

type Prospect = AcquisitionData["prospects"][number];

function ProspectRow({ p }: { p: Prospect }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AcquisitionState>(null);
  const actions = p.do_not_contact ? [] : actionsFor(p.pipelineStage);
  const consentEditable = !p.do_not_contact && (p.stage === "discovered" || p.stage === "verified");

  const run = (fn: () => Promise<AcquisitionState>) =>
    startTransition(async () => {
      const res = await fn();
      setResult(res?.error ? res : null);
      router.refresh();
    });

  return (
    <tr className={cn(p.do_not_contact && "text-muted-foreground")}>
      <td className="px-3 py-2 align-top">
        <span className="font-medium">{p.business_name}</span>
        <span className="block text-xs text-muted-foreground">
          {[p.category, p.suburb, `Lead ${p.lead_quality}`].filter(Boolean).join(" · ")}
        </span>
      </td>
      <td className="px-3 py-2 align-top text-xs">
        {p.email && <span className="block">{p.email}</span>}
        {p.instagram && <span className="block">{p.instagram}</span>}
        {p.phone && <span className="block">{p.phone}</span>}
        {p.website && <span className="block text-muted-foreground">{p.website}</span>}
      </td>
      <td className="px-3 py-2 align-top text-xs">
        {consentEditable ? (
          <select
            aria-label={`Consent basis for ${p.business_name}`}
            defaultValue={p.consent_basis}
            disabled={pending}
            onChange={(e) => {
              const basis = e.target.value;
              const note = basis === "none" ? undefined : (window.prompt("Note (e.g. 'Said yes on a call 4 Nov'):") ?? undefined);
              run(() => setProspectConsent(p.id, basis, note));
            }}
            className="h-8 max-w-44 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            {CONSENT_BASES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          CONSENT_BASES.find((c) => c.value === p.consent_basis)?.label
        )}
      </td>
      <td className="px-3 py-2 align-top text-xs">
        {p.do_not_contact ? (
          <span className="font-medium text-destructive">Do not contact</span>
        ) : (
          <span className="font-medium">{stageLabel(p.pipelineStage)}</span>
        )}
        {p.do_not_contact_reason && <span className="block">{p.do_not_contact_reason}</span>}
        {p.contacted_at && <span className="block text-muted-foreground">Contacted {fmt(p.contacted_at)}</span>}
        {p.replied_at && <span className="block text-muted-foreground">Replied {fmt(p.replied_at)}</span>}
        {!p.do_not_contact && p.follow_up_count === 0 && p.next_follow_up_at && !p.replied_at && (
          <span className="block text-muted-foreground">Follow-up from {fmt(p.next_follow_up_at)}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {actions.length > 0 && (
          <select
            aria-label={`Next step for ${p.business_name}`}
            value=""
            disabled={pending}
            onChange={(e) => {
              const action = e.target.value;
              if (!action) return;
              const permanent = action === "declined" || action === "do_not_contact";
              if (permanent && !window.confirm(`Never contact ${p.business_name} again? This can't be undone.`)) return;
              const note = permanent ? (window.prompt("Reason (optional):") ?? undefined) : undefined;
              run(() => prospectAction(p.id, action, note));
            }}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="">Next step…</option>
            {actions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        )}
        {result?.error && (
          <p role="alert" className="mt-1 max-w-48 text-xs text-destructive">
            {result.error}
          </p>
        )}
      </td>
    </tr>
  );
}

export function ProspectsTable({ prospects }: { prospects: AcquisitionData["prospects"] }) {
  const [filter, setFilter] = useState("open");
  const shown = useMemo(
    () =>
      prospects.filter((p) =>
        filter === "all" ? true : filter === "open" ? !p.do_not_contact : filter === "do_not_contact" ? p.do_not_contact : !p.do_not_contact && p.pipelineStage === filter,
      ),
    [prospects, filter],
  );
  if (prospects.length === 0) return <p className="text-sm text-muted-foreground">No prospects yet. Import a research batch above.</p>;
  return (
    <div className="grid gap-2">
      <label className="flex items-center gap-2 text-sm">
        Show
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="open">All open ({prospects.filter((p) => !p.do_not_contact).length})</option>
          {[...PROSPECT_STAGES, ...VENDOR_STAGES].map((s) => (
            <option key={s.value} value={s.value}>
              {s.label} ({prospects.filter((p) => !p.do_not_contact && p.pipelineStage === s.value).length})
            </option>
          ))}
          <option value="do_not_contact">Do not contact ({prospects.filter((p) => p.do_not_contact).length})</option>
          <option value="all">Everything ({prospects.length})</option>
        </select>
      </label>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Why we may contact</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Next step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((p) => (
              <ProspectRow key={p.id} p={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
