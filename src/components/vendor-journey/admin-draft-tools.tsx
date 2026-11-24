"use client";

import { useState, useTransition } from "react";
import { Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PricingFields } from "@/components/pricing-fields";
import { ListingPreview } from "@/components/vendor-journey/listing-preview";
import { EVENT_TYPES, LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";
import { adminCreateAssistedDraft, adminMarkLinkSent, adminNewClaimLink, adminRevokeDraft, type AdminDraftState } from "@/lib/actions/admin-vendor-drafts";
import { EMPTY_DRAFT, type ListingDraft } from "@/lib/vendor-journey/draft";

const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

/** The claim link, shown once. The admin sends it themselves. */
function OneTimeLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="rounded-2xl bg-secondary p-4">
      <p className="text-sm font-semibold">Claim link (shown once — copy it now)</p>
      <div className="mt-2 flex gap-2">
        <Input readOnly value={link} className="h-10 rounded-xl font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="raised"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          <Copy aria-hidden /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Nothing has been sent. Send it to the owner yourself (DM, text or email), then press &quot;Mark sent&quot;. It works for 30 days and only their verified email
        can save it.
      </p>
    </div>
  );
}

export function AdminDraftForm() {
  const [draft, setDraft] = useState<ListingDraft>(EMPTY_DRAFT);
  const [email, setEmail] = useState("");
  const [permissionNote, setPermissionNote] = useState("");
  const [permissionDate, setPermissionDate] = useState(new Date().toISOString().slice(0, 10));
  const [confirm, setConfirm] = useState(false);
  const [state, setState] = useState<AdminDraftState>(null);
  const [pending, start] = useTransition();
  const update = (p: Partial<ListingDraft>) => setDraft((d) => ({ ...d, ...p }));

  if (state?.link) {
    return (
      <div className="space-y-3">
        <OneTimeLink link={state.link} />
        <Button
          type="button"
          variant="raised"
          onClick={() => {
            setDraft(EMPTY_DRAFT);
            setState(null);
            setConfirm(false);
            setPermissionNote("");
            setEmail("");
          }}
        >
          Prepare another
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setState(await adminCreateAssistedDraft({ draft, email, permissionNote, permissionDate, confirmPermission: confirm })));
        }}
      >
        <fieldset className="space-y-3 rounded-2xl border border-border p-4">
          <legend className="px-1 text-sm font-semibold">Owner&apos;s permission (required)</legend>
          <div className="space-y-1.5">
            <Label htmlFor="ad-email">Owner&apos;s email (only this verified address can save it)</Label>
            <Input id="ad-email" type="email" required className="h-10 rounded-xl" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-perm">How they gave permission</Label>
            <Textarea
              id="ad-perm"
              rows={2}
              required
              className="rounded-xl"
              placeholder="e.g. Instagram DM reply, 24 Nov: 'yes please set it up, use my IG photos'"
              value={permissionNote}
              onChange={(e) => setPermissionNote(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-date">Date</Label>
            <Input id="ad-date" type="date" required className="h-10 w-44 rounded-xl" value={permissionDate} onChange={(e) => setPermissionDate(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={confirm} onCheckedChange={(v) => setConfirm(v === true)} className="mt-0.5" />
            The business owner said yes to Evntly preparing a private draft for them to review. Everything below comes from them or their own public pages.
          </label>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ad-cat">Category</Label>
            <select
              id="ad-cat"
              required
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={draft.serviceType}
              onChange={(e) => update({ serviceType: e.target.value })}
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-name">Business name</Label>
            <Input id="ad-name" required className="h-10 rounded-xl" value={draft.businessName} onChange={(e) => update({ businessName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-city">Base suburb</Label>
            <Input id="ad-city" className="h-10 rounded-xl" value={draft.city} onChange={(e) => update({ city: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-ig">Instagram or website</Label>
            <Input id="ad-ig" className="h-10 rounded-xl" value={draft.instagram} onChange={(e) => update({ instagram: e.target.value })} />
          </div>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Events</legend>
          <div className="flex flex-wrap gap-3">
            {EVENT_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={draft.eventTypes.includes(t)}
                  onCheckedChange={(v) => update({ eventTypes: v ? [...draft.eventTypes, t] : draft.eventTypes.filter((x) => x !== t) })}
                />
                {t}
              </label>
            ))}
          </div>
        </fieldset>
        <PricingFields idPrefix="ad" value={draft} onChange={(p) => update(p)} />
        <div className="space-y-1.5">
          <Label htmlFor="ad-bio">About (their words; the owner reviews it)</Label>
          <Textarea id="ad-bio" rows={5} className="rounded-xl" value={draft.bio} onChange={(e) => update({ bio: e.target.value, bioSource: "assisted" })} />
        </div>
        <p className="text-xs text-muted-foreground">
          Packages and photos are added by the owner (or by us after they ask, via Setup requests). Prices always come from the owner.
        </p>
        {state?.error && (
          <p role="alert" className="text-sm text-destructive-text">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending || !confirm}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />} Save private draft and get claim link
        </Button>
      </form>
      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">What the owner will see</p>
        <ListingPreview draft={draft} compact />
      </div>
    </div>
  );
}

export function AdminDraftActions({ id, canRelink }: { id: string; canRelink: boolean }) {
  const [state, setState] = useState<AdminDraftState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canRelink && (
          <Button size="sm" variant="raised" disabled={pending} onClick={() => start(async () => setState(await adminNewClaimLink(id)))}>
            New link
          </Button>
        )}
        <Button size="sm" variant="raised" disabled={pending} onClick={() => start(async () => setState(await adminMarkLinkSent(id)))}>
          Mark sent
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (confirm("Revoke this draft? The claim link stops working.")) start(async () => setState(await adminRevokeDraft(id)));
          }}
        >
          Revoke
        </Button>
      </div>
      {state?.link && <OneTimeLink link={state.link} />}
      {state?.error && <p className="text-xs text-destructive-text">{state.error}</p>}
    </div>
  );
}
