"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CloudCheck, Eye, Loader2, Mail, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategoryArt } from "@/components/category-art";
import { PricingFields } from "@/components/pricing-fields";
import { SuburbPicker } from "@/components/suburb-picker";
import { ListingPreview } from "@/components/vendor-journey/listing-preview";
import { cn } from "@/lib/utils";
import { EVENT_TYPES, LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";
import { packageTemplatesFor } from "@/lib/package-templates";
import { analyticsVisitorId, trackVendorJourney } from "@/lib/track-client";
import { emailDraftLink, forgetDraft, saveListingDraft, suggestListingCopy } from "@/lib/actions/vendor-journey";
import {
  BIO_MAX,
  BUILDER_STEPS,
  EMPTY_DRAFT,
  MAX_PACKAGES,
  draftProgress,
  firstOpenStep,
  parseDraft,
  readyToSave,
  stepComplete,
  type DraftPackage,
  type ListingDraft,
} from "@/lib/vendor-journey/draft";

// One question per screen. Answers are kept on this device as they're typed
// and on our server (private, behind a secret cookie) each time a step is
// finished, so a vendor can stop, switch devices via an emailed link, or
// create their account and carry on. No account is needed until "Save".

const LOCAL_KEY = "evntly_vendor_draft_v1";
const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

type Local = { draft: ListingDraft; step: number; updatedAt: string };

function readLocal(): Local | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null");
    if (!raw?.draft) return null;
    const step = Number.isInteger(raw.step) && raw.step >= 0 && raw.step < BUILDER_STEPS.length ? raw.step : 0;
    return { draft: parseDraft(raw.draft), step, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "" };
  } catch {
    return null;
  }
}

const noSubscribe = () => () => {};

export type BuilderProps = {
  server: { draft: ListingDraft; updatedAt: string; origin: "self" | "assisted" } | null;
  signedIn: boolean;
  startOnReview?: boolean;
};

export function ListingBuilder(props: BuilderProps) {
  const onClient = useSyncExternalStore(noSubscribe, () => true, () => false);
  const initial = useMemo(() => {
    if (!onClient) return null;
    const local = readLocal();
    const server = props.server;
    // A draft our team prepared, or a newer copy from another device, wins.
    if (server && (server.origin === "assisted" || !local || server.updatedAt > local.updatedAt)) {
      return { draft: server.draft, step: props.startOnReview ? BUILDER_STEPS.length - 1 : firstOpenStep(server.draft) };
    }
    if (local) return { draft: local.draft, step: local.step };
    return null;
  }, [onClient, props.server, props.startOnReview]);
  return <Builder key={onClient ? "client" : "server"} {...props} initial={initial} persist={onClient} />;
}

function Builder({
  server,
  signedIn,
  initial,
  persist,
}: BuilderProps & { initial: { draft: ListingDraft; step: number } | null; persist: boolean }) {
  const [draft, setDraft] = useState<ListingDraft>(initial?.draft ?? EMPTY_DRAFT);
  const [step, setStep] = useState(initial?.step ?? 0);
  const [saveNote, setSaveNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(
    initial ? { tone: "ok", text: "Welcome back. Your answers are here." } : null
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const current = BUILDER_STEPS[step];
  const progress = draftProgress(draft);
  const assisted = server?.origin === "assisted";
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The latest answers, for steps that advance on a timer (category tiles).
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Every change is kept on this device straight away.
  useEffect(() => {
    if (!persist) return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ draft, step, updatedAt: new Date().toISOString() }));
    } catch {
      // Storage blocked: the server copy (after step 2) still works.
    }
  }, [draft, step, persist]);

  // Move focus to the new question (screen readers, and phones scroll to it).
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: false });
  }, [step]);

  const update = (patch: Partial<ListingDraft>) => {
    setDraft((d) => {
      if (!d.serviceType && patch.serviceType) trackVendorJourney("builder_started");
      return { ...d, ...patch };
    });
  };

  function saveToServer(next: ListingDraft) {
    startSaving(async () => {
      const res = await saveListingDraft(next, analyticsVisitorId() ?? undefined);
      if (!res.ok) setSaveNote({ tone: "warn", text: res.error });
      else if (res.onServer) setSaveNote({ tone: "ok", text: "Saved privately. Only you can see it." });
    });
  }

  function go(to: number) {
    const latest = draftRef.current;
    if (stepComplete(current.id, latest)) trackVendorJourney("builder_step", current.id);
    const target = Math.max(0, Math.min(BUILDER_STEPS.length - 1, to));
    if (BUILDER_STEPS[target].id === "review") trackVendorJourney("builder_preview");
    if (target > step) saveToServer(latest);
    setStep(target);
    window.scrollTo({ top: 0 });
  }

  const canContinue = !current.required || stepComplete(current.id, draft);
  const isReview = current.id === "review";

  return (
    // Fills the screen so the site footer stays below the fold: one question, nothing else.
    <div className="min-h-[100dvh] bg-canvas">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-5 pb-32 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:pt-10">
        <div className="min-w-0">
          {/* Progress */}
          <div className="flex items-center gap-3">
            {step > 0 ? (
              <button type="button" onClick={() => go(step - 1)} aria-label="Back" className="btn-raised flex size-10 shrink-0 items-center justify-center rounded-full">
                <ArrowLeft className="size-5" aria-hidden />
              </button>
            ) : (
              <Link href="/become-a-vendor" aria-label="Back to become a vendor" className="btn-raised flex size-10 shrink-0 items-center justify-center rounded-full">
                <ArrowLeft className="size-5" aria-hidden />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <div
                className="h-1.5 overflow-hidden rounded-full surface-pressed"
                role="progressbar"
                aria-label="Listing progress"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full rounded-full [background:var(--gradient-coral)] transition-[width] duration-300" style={{ width: `${Math.max(progress, 4)}%` }} />
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <CloudCheck className="size-3.5" aria-hidden />}
                {saving ? "Saving…" : (saveNote?.text ?? "Saved on this device as you go. No account needed yet.")}
              </p>
            </div>
          </div>

          {assisted && (
            <p className="mt-4 rounded-2xl bg-secondary p-4 text-[15px] leading-relaxed">
              <span className="font-semibold">Our team prepared this draft with you.</span> Check every answer, change anything that isn&apos;t
              right, then save it as your listing. It stays private until you submit it and we approve it.
            </p>
          )}

          <section className="mt-6" aria-labelledby="step-heading">
            <p className="text-eyebrow text-primary-text">
              {isReview ? "Preview" : `Question ${step + 1} of ${BUILDER_STEPS.length - 1}${current.required ? "" : " · optional"}`}
            </p>
            <h1 id="step-heading" ref={headingRef} tabIndex={-1} className="mt-2 text-[28px] leading-tight font-bold tracking-tight outline-none sm:text-[34px]">
              {isReview ? (readyToSave(draft) ? "Looking good. Here's your listing." : "Almost there") : current.title}
            </h1>

            <div className="mt-6">
              <StepBody
                id={current.id}
                draft={draft}
                update={update}
                onPicked={() => setTimeout(() => go(step + 1), 180)}
                signedIn={signedIn}
                goTo={go}
              />
            </div>
          </section>
        </div>

        {/* Desktop: the preview sits beside the questions and updates live. */}
        <aside className="hidden lg:block" aria-label="Live preview">
          <div className="sticky top-24">
            <p className="mb-2 text-sm font-semibold text-muted-foreground">Live preview</p>
            <ListingPreview draft={draft} compact />
          </div>
        </aside>
      </div>

      {/* Phones: one thumb-reach bar. */}
      {!isReview && (
        <div className="frost fixed inset-x-0 bottom-[calc(var(--tabbar-height,0px)+var(--consent-h,0px))] z-30 border-t border-border/60 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [--frost-bg:color-mix(in_oklab,var(--background)_92%,transparent)]">
          <div className="mx-auto flex max-w-6xl gap-3">
            <Button
              type="button"
              variant="raised"
              size="lg"
              className="lg:hidden"
              onClick={() => {
                setPreviewOpen(true);
                trackVendorJourney("builder_preview");
              }}
            >
              <Eye aria-hidden /> Preview
            </Button>
            <Button type="button" size="lg" className="flex-1 lg:max-w-xs" disabled={!canContinue} onClick={() => go(step + 1)}>
              {current.required ? "Continue" : stepComplete(current.id, draft) ? "Continue" : "Skip for now"}
            </Button>
          </div>
        </div>
      )}

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-4 pb-8">
          <SheetHeader className="px-0">
            <SheetTitle>Your listing preview</SheetTitle>
            <SheetDescription>This is how customers will see it once it&apos;s approved. Only you can see it now.</SheetDescription>
          </SheetHeader>
          <ListingPreview draft={draft} compact />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[16px] font-medium",
        selected ? "surface-pressed font-semibold ring-2 ring-primary/50" : "btn-raised"
      )}
    >
      {selected && <Check className="size-4 text-primary" aria-hidden />}
      {children}
    </button>
  );
}

function StepBody({
  id,
  draft,
  update,
  onPicked,
  signedIn,
  goTo,
}: {
  id: (typeof BUILDER_STEPS)[number]["id"];
  draft: ListingDraft;
  update: (p: Partial<ListingDraft>) => void;
  onPicked: () => void;
  signedIn: boolean;
  goTo: (step: number) => void;
}) {
  switch (id) {
    case "category":
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {categories.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={draft.serviceType === c.value}
              onClick={() => {
                // A new category gets its own starter packages.
                update({ serviceType: c.value, packages: draft.serviceType === c.value ? draft.packages : [] });
                onPicked();
              }}
              className={cn(
                "flex min-h-28 flex-col items-start justify-between gap-2 rounded-2xl p-4 text-left text-[16px] font-semibold",
                draft.serviceType === c.value ? "surface-pressed ring-2 ring-primary/50" : "btn-raised"
              )}
            >
              <CategoryArt value={c.value} className="size-10" />
              {c.label}
            </button>
          ))}
        </div>
      );

    case "name":
      return (
        <div className="max-w-md space-y-2">
          <Label htmlFor="vj-name" className="sr-only">
            Business name
          </Label>
          <Input
            id="vj-name"
            autoFocus
            autoComplete="organization"
            className="h-14 rounded-2xl px-4 text-[20px]"
            placeholder="e.g. Harbourlight Photography"
            value={draft.businessName}
            maxLength={120}
            onChange={(e) => update({ businessName: e.target.value })}
          />
          <p className="text-sm text-muted-foreground">As customers know you. You can change it later.</p>
        </div>
      );

    case "location":
      return (
        <div className="max-w-md space-y-2">
          <Label htmlFor="vj-city">Your base suburb</Label>
          <SuburbPicker id="vj-city" value={draft} onChange={(loc) => update(loc)} />
          <p className="text-sm text-muted-foreground">We use it to show you to customers planning events nearby. Only the suburb is shown.</p>
        </div>
      );

    case "events":
      return (
        <div>
          <p className="mb-4 text-[15px] text-muted-foreground">Pick all that apply.</p>
          <div className="flex flex-wrap gap-2.5">
            {EVENT_TYPES.map((t) => {
              const selected = draft.eventTypes.includes(t);
              return (
                <Chip
                  key={t}
                  selected={selected}
                  onClick={() => update({ eventTypes: selected ? draft.eventTypes.filter((v) => v !== t) : [...draft.eventTypes, t] })}
                >
                  {t}
                </Chip>
              );
            })}
          </div>
        </div>
      );

    case "pricing":
      return (
        <div className="max-w-md">
          <p className="mb-4 text-[15px] text-muted-foreground">A starting point for customers. You&apos;ll always quote each event yourself.</p>
          <PricingFields idPrefix="vj" value={draft} onChange={(p) => update(p)} />
        </div>
      );

    case "about":
      return <AboutStep draft={draft} update={update} />;

    case "packages":
      return <PackagesStep draft={draft} update={update} />;

    case "review":
      return <ReviewStep draft={draft} signedIn={signedIn} goTo={goTo} />;
  }
}

function AboutStep({ draft, update }: { draft: ListingDraft; update: (p: Partial<ListingDraft>) => void }) {
  const [notes, setNotes] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function suggest() {
    setError(null);
    start(async () => {
      const res = await suggestListingCopy(draft, notes);
      if ("error" in res && res.error) setError(res.error);
      else if ("bio" in res && res.bio) setSuggestion(res.bio);
    });
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="vj-bio">About your business</Label>
        <Textarea
          id="vj-bio"
          rows={6}
          maxLength={BIO_MAX}
          className="rounded-2xl text-[16px]"
          placeholder="What you do, your style, and what customers can expect."
          value={draft.bio}
          onChange={(e) => update({ bio: e.target.value, bioSource: "vendor" })}
        />
        <p className="text-right text-xs text-muted-foreground tabular-nums">
          {draft.bio.length}/{BIO_MAX}
        </p>
      </div>

      <div className="rounded-2xl bg-secondary p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden /> Want help writing it?
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Jot down a few words. We&apos;ll suggest a description using only what you tell us. You decide whether to use it.
        </p>
        <Label htmlFor="vj-notes" className="sr-only">
          A few words about your business
        </Label>
        <Textarea
          id="vj-notes"
          rows={3}
          maxLength={1500}
          className="mt-3 rounded-xl bg-background"
          placeholder="e.g. relaxed, candid style; Indian and Sri Lankan weddings; edited gallery in 3 weeks"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <Button type="button" variant="raised" className="mt-3" disabled={pending} onClick={suggest}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Suggest a description
        </Button>
        {error && <p role="alert" className="mt-2 text-sm text-destructive-text">{error}</p>}
        {suggestion && (
          <div className="mt-4 rounded-xl bg-background p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Suggestion: check it&apos;s accurate</p>
            <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line">{suggestion}</p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  update({ bio: suggestion, bioSource: "suggested" });
                  setSuggestion(null);
                }}
              >
                Use this (you can edit it)
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
                No thanks
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="vj-ig">Instagram (optional)</Label>
          <Input id="vj-ig" className="h-11 rounded-xl" placeholder="@yourbusiness" value={draft.instagram} maxLength={120} onChange={(e) => update({ instagram: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vj-web">Website (optional)</Label>
          <Input id="vj-web" className="h-11 rounded-xl" inputMode="url" placeholder="yourbusiness.com.au" value={draft.website} maxLength={200} onChange={(e) => update({ website: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

function PackagesStep({ draft, update }: { draft: ListingDraft; update: (p: Partial<ListingDraft>) => void }) {
  // Starter packages for the category, unpriced and not added until the
  // vendor sets a price and ticks "Add to my listing".
  const packages: DraftPackage[] = draft.packages.length
    ? draft.packages
    : packageTemplatesFor(draft.serviceType).map((t) => ({
        name: t.name,
        description: t.description,
        price: null,
        includedHours: t.includedHours,
        inclusions: [...t.inclusions],
        approved: false,
      }));
  const set = (i: number, patch: Partial<DraftPackage>) => update({ packages: packages.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-[15px] text-muted-foreground">
        Customers book packages. We&apos;ve suggested common ones for your category: set your own price and tick the ones you offer.
      </p>
      {packages.map((p, i) => {
        const priced = p.price != null && p.price >= 1;
        return (
          <div key={i} className={cn("surface-raised rounded-2xl p-4", p.approved && priced && "ring-2 ring-primary/40")}>
            <div className="flex items-start gap-2">
              <Input
                aria-label="Package name"
                className="h-11 flex-1 rounded-xl text-[16px] font-semibold"
                value={p.name}
                maxLength={80}
                onChange={(e) => set(i, { name: e.target.value })}
              />
              <button
                type="button"
                aria-label={`Remove ${p.name || "package"}`}
                onClick={() => update({ packages: packages.filter((_, j) => j !== i) })}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
            {p.description && <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>}
            {p.inclusions.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                {p.inclusions.map((inc) => (
                  <li key={inc}>{inc}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor={`vj-pkg-${i}`} className="text-xs">
                  Your price (AUD)
                </Label>
                <Input
                  id={`vj-pkg-${i}`}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  className="h-11 w-36 rounded-xl"
                  value={p.price ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    set(i, { price: v, approved: v != null && v >= 1 });
                  }}
                />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                <Checkbox checked={p.approved && priced} disabled={!priced} onCheckedChange={(v) => set(i, { approved: v === true })} />
                Add to my listing
              </label>
            </div>
          </div>
        );
      })}
      {packages.length < MAX_PACKAGES && (
        <Button
          type="button"
          variant="raised"
          onClick={() => update({ packages: [...packages, { name: "My package", description: "", price: null, includedHours: null, inclusions: [], approved: false }] })}
        >
          <Plus aria-hidden /> Add your own package
        </Button>
      )}
      <p className="text-sm text-muted-foreground">You&apos;ll need one package before your listing can be reviewed. You can add more from your dashboard.</p>
    </div>
  );
}

function ReviewStep({ draft, signedIn, goTo }: { draft: ListingDraft; signedIn: boolean; goTo: (step: number) => void }) {
  const ready = readyToSave(draft);
  const missing = BUILDER_STEPS.map((s, i) => ({ ...s, i })).filter((s) => s.required && !stepComplete(s.id, draft));
  const saveHref = signedIn ? "/become-a-vendor/save" : "/signup?role=vendor";

  return (
    <div className="space-y-6">
      <div className="lg:hidden">
        <ListingPreview draft={draft} />
      </div>

      {!ready && (
        <div className="rounded-2xl bg-secondary p-4">
          <p className="font-semibold">A couple of answers to go</p>
          <ul className="mt-2 space-y-1">
            {missing.map((m) => (
              <li key={m.id}>
                <button type="button" className="text-[15px] font-medium underline underline-offset-2" onClick={() => goTo(m.i)}>
                  {m.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="surface-raised rounded-card p-5">
        <h2 className="text-[20px] font-bold">Save it as your listing</h2>
        <ol className="mt-3 space-y-2 text-[15px]">
          <li className="flex gap-2.5">
            <span className="font-semibold text-primary-text tabular-nums">1</span>
            {signedIn ? "You're signed in: next we'll ask for your ABN." : "Create a free account. We'll email you a code to confirm it's you."}
          </li>
          <li className="flex gap-2.5">
            <span className="font-semibold text-primary-text tabular-nums">2</span>
            Add your ABN and accept the vendor agreement.
          </li>
          <li className="flex gap-2.5">
            <span className="font-semibold text-primary-text tabular-nums">3</span>
            Add 3 photos of your work, then submit. We check every listing before it goes live.
          </li>
        </ol>
        {ready ? (
          <Button
            size="lg"
            className="mt-5 w-full sm:w-auto"
            nativeButton={false}
            render={
              <Link href={saveHref} onClick={() => trackVendorJourney("save_clicked")}>
                Save my listing{signedIn ? "" : ": create free account"}
              </Link>
            }
          />
        ) : (
          <Button size="lg" className="mt-5 w-full sm:w-auto" disabled>
            Save my listing
          </Button>
        )}
        <p className="mt-2 text-sm text-muted-foreground">Your answers come with you. Nothing is public until we approve it.</p>
      </div>

      <EmailLinkForm />

      <p className="text-[15px] text-muted-foreground">
        Rather do this together?{" "}
        <Link href="/become-a-vendor#help" className="font-medium text-foreground underline underline-offset-2">
          We&apos;ll set it up with you for free
        </Link>
        .{" "}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={async () => {
            if (!confirm("Start again? This clears your answers on this device.")) return;
            try {
              localStorage.removeItem(LOCAL_KEY);
            } catch {}
            await forgetDraft();
            window.location.reload();
          }}
        >
          Start again
        </button>
      </p>
    </div>
  );
}

function EmailLinkForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok) {
    return (
      <p role="status" className="flex gap-2 rounded-2xl bg-secondary p-4 text-[15px]">
        <Mail className="mt-0.5 size-4 shrink-0" aria-hidden /> {result.message}
      </p>
    );
  }
  return (
    <form
      className="rounded-2xl border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await emailDraftLink({ email, consent })));
      }}
    >
      <p className="font-semibold">Not ready to make an account?</p>
      <p className="mt-1 text-sm text-muted-foreground">We&apos;ll email you a private link to finish on any device. One email, nothing else.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Label htmlFor="vj-email" className="sr-only">
          Email
        </Label>
        <Input id="vj-email" type="email" autoComplete="email" required className="h-11 rounded-xl" placeholder="you@business.com.au" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" variant="raised" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />} Email me a link
        </Button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
        <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
        Email me this one link to my draft. Evntly won&apos;t use this address for anything else.
      </label>
      {result && !result.ok && (
        <p role="alert" className="mt-2 text-sm text-destructive-text">
          {result.message}
        </p>
      )}
    </form>
  );
}
