"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuburbPicker } from "@/components/suburb-picker";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EVENT_TYPES, LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";
import { submitVendorListing, type VendorSignupDraft } from "@/lib/actions/vendor-signup";
import { CheckCircle2, Clock, X } from "lucide-react";
import { CategoryArt } from "@/components/category-art";
import { isValidAbn } from "@/lib/abn";
import { PricingFields } from "@/components/pricing-fields";
import { trackFunnelEvent } from "@/lib/track-client";
import { pricingComplete } from "@/lib/pricing-model";

const STEPS = ["Business", "Services", "Pricing", "Locations", "Agreement"] as const;
// The unfinished form is kept in this browser only, so a vendor who leaves to
// find their ABN or photos comes back to their answers instead of a blank
// form. Cleared on submit. Never holds anything but the form fields.
const DRAFT_KEY = "evntly_listing_draft_v1";

const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

type SavedDraft = { draft: Partial<VendorSignupDraft>; step: number };

function readSavedDraft(): SavedDraft | null {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (!saved?.draft || typeof saved.draft !== "object") return null;
    const step = Number.isInteger(saved.step) && saved.step >= 0 && saved.step < STEPS.length ? saved.step : 0;
    return { draft: saved.draft, step };
  } catch {
    // No storage (private mode, blocked): the form still works, it just isn't saved.
    return null;
  }
}

const noSubscribe = () => () => {};

export function VendorSignupWizard() {
  // The server can't see this browser's saved answers, so the form mounts
  // fresh once on the client with them (key change), avoiding a mismatch.
  const onClient = useSyncExternalStore(noSubscribe, () => true, () => false);
  const saved = useMemo(() => (onClient ? readSavedDraft() : null), [onClient]);
  return <WizardForm key={onClient ? "client" : "server"} saved={saved} persist={onClient} />;
}

function WizardForm({ saved, persist }: { saved: SavedDraft | null; persist: boolean }) {
  const [step, setStep] = useState(saved?.step ?? 0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<VendorSignupDraft>({
    businessName: "",
    bio: "",
    serviceType: "",
    pricingModel: "hourly",
    hourlyRate: 0,
    basePrice: 0,
    city: "",
    locationsServiced: [],
    eventTypes: [],
    phone: "",
    abn: "",
    gstRegistered: false,
    ...saved?.draft,
  });
  const [locationInput, setLocationInput] = useState("");
  const [agreed, setAgreed] = useState(false);
  // Founding funnel: a fresh listing form was opened (not a restored draft).
  useEffect(() => {
    if (persist && !saved) trackFunnelEvent("listing_started");
  }, [persist, saved]);

  useEffect(() => {
    if (!persist) return;
    try {
      // ABN and phone aren't kept: a successful submit redirects before the
      // draft can be cleared, so only low-sensitivity fields stay behind.
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: { ...draft, abn: "", phone: "" }, step }));
    } catch {
      // Ignore: saving is a convenience only.
    }
  }, [draft, step, persist]);

  const canAdvance = [
    !!draft.businessName,
    !!draft.serviceType && draft.eventTypes.length > 0,
    pricingComplete(draft),
    // The base suburb is enough: it becomes the first service area if none
    // were added (Next used to stay disabled until "Add" was tapped).
    !!draft.city,
    isValidAbn(draft.abn) && agreed,
  ][step];

  function addLocation() {
    const v = locationInput.trim();
    if (v && !draft.locationsServiced.includes(v)) {
      setDraft((d) => ({ ...d, locationsServiced: [...d.locationsServiced, v] }));
    }
    setLocationInput("");
  }

  function next() {
    if (STEPS[step] === "Locations") {
      // Keep a typed-but-not-added area, and fall back to the base suburb.
      const typed = locationInput.trim();
      setDraft((d) => {
        const areas = typed && !d.locationsServiced.includes(typed) ? [...d.locationsServiced, typed] : d.locationsServiced;
        return { ...d, locationsServiced: areas.length ? areas : d.city ? [d.city] : areas };
      });
      setLocationInput("");
    }
    setStep((s) => s + 1);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitVendorListing(draft, { acceptedVendorAgreement: agreed });
      if (res?.error) setError(res.error);
      else {
        setSubmitted(true);
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          // Ignore.
        }
      }
    });
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <span className="btn-raised mx-auto mb-5 flex size-20 items-center justify-center rounded-full">
          <Clock className="size-10 text-warning-text" strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="mb-2 text-title">Profile submitted for review</h1>
        <p className="text-muted-foreground">
          Thanks for signing up! We review new listings within 24–48 hours — you&apos;ll appear in
          search once approved.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          While you wait, add photos of your work and your packages — they&apos;re the first thing customers look at.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button size="lg" nativeButton={false} render={<Link href="/vendor-dashboard/portfolio">Add photos</Link>} />
          <Button size="lg" variant="raised" nativeButton={false} render={<Link href="/vendor-dashboard">Go to your dashboard</Link>} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-canvas">
    <div className="mx-auto max-w-lg px-4 pt-8 pb-10">
      <p className="text-eyebrow text-primary-text">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>
      <ol className="mt-3 mb-6 grid grid-cols-5 gap-1.5" aria-label="Listing setup steps">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className="min-w-0">
            <span className={cn("block h-1.5 rounded-full transition-colors", i <= step ? "[background:var(--gradient-coral)]" : "surface-pressed")} />
            <span className={cn("mt-1.5 block truncate text-[11px]", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
              <span className="sr-only">{i < step ? "Done: " : i === step ? "Current: " : ""}</span>
              {label}
            </span>
          </li>
        ))}
      </ol>
      <div className="surface-raised rounded-card p-5 sm:p-6">

      {step === 0 && (
        <div className="space-y-3">
          <h1 className="mb-4 text-headline">Tell us about your business</h1>
          <div className="space-y-1.5">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              className="h-11 rounded-xl sm:h-10"
              value={draft.businessName}
              onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              className="rounded-xl"
              rows={4}
              value={draft.bio}
              onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              className="h-11 rounded-xl sm:h-10"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h1 className="mb-4 text-headline">What do you offer?</h1>
          <p className="mb-2 text-sm font-medium">Category</p>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {categories.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={draft.serviceType === c.value}
                onClick={() => setDraft((d) => ({ ...d, serviceType: c.value }))}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-1.5 pt-2 pb-2.5 text-center text-xs leading-tight font-semibold",
                  draft.serviceType === c.value ? "surface-pressed text-foreground ring-1 ring-primary/40" : "btn-raised"
                )}
              >
                <CategoryArt value={c.value} className="size-10" />
                {c.label}
              </button>
            ))}
          </div>
          <p className="mb-2 text-sm font-medium">Event types you cover</p>
          <div className="grid grid-cols-2 gap-2">
            {EVENT_TYPES.map((t) => {
              const selected = draft.eventTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      eventTypes: selected
                        ? d.eventTypes.filter((v) => v !== t)
                        : [...d.eventTypes, t],
                    }))
                  }
                  className={cn(
                    "min-h-11 rounded-full px-4 py-2 text-sm font-medium",
                    selected ? "surface-pressed font-semibold text-foreground ring-1 ring-primary/40" : "btn-raised"
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <h1 className="mb-1 text-headline">Set your pricing</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            Pick what suits your business. You can change it any time. Packages and photos come after you save,
            and we can add them for you if you&apos;d rather.
          </p>
          <PricingFields
            idPrefix="signup"
            value={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <h1 className="mb-1 text-headline">Where do you service?</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            This helps us match you with nearby events.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="city">Base suburb</Label>
            <SuburbPicker
              id="city"
              value={draft}
              onChange={(loc) => setDraft((d) => ({ ...d, ...loc }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Suburbs / areas you service</Label>
            <div className="flex gap-2">
              <Input
                id="location"
                className="h-11 rounded-xl sm:h-10"
                placeholder="e.g. Bondi"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLocation();
                  }
                }}
              />
              <Button type="button" variant="raised" size="lg" onClick={addLocation}>
                Add
              </Button>
            </div>
            {draft.locationsServiced.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {draft.locationsServiced.map((loc) => (
                  <span
                    key={loc}
                    className="btn-raised flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm"
                  >
                    {loc}
                    <button
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          locationsServiced: d.locationsServiced.filter((l) => l !== loc),
                        }))
                      }
                      type="button"
                      aria-label={`Remove ${loc}`}
                      className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h1 className="mb-1 text-headline">Your business and our agreement</h1>
          <div className="space-y-1.5">
            <Label htmlFor="abn">ABN</Label>
            <Input
              id="abn"
              className="h-11 rounded-xl sm:h-10"
              inputMode="numeric"
              autoComplete="off"
              placeholder="11 digits"
              value={draft.abn ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, abn: e.target.value }))}
              aria-invalid={!!draft.abn && !isValidAbn(draft.abn)}
              aria-describedby="abn-help"
            />
            <p id="abn-help" className="text-xs text-muted-foreground">
              {draft.abn && !isValidAbn(draft.abn)
                ? "That doesn't look like a valid ABN. Check it at abr.business.gov.au."
                : "Required to list on Evntly. It's shown on your listing and on booking invoices. Don't have one? Applying is free at abr.gov.au."}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              aria-labelledby="gst-label"
              id="gst"
              checked={!!draft.gstRegistered}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, gstRegistered: v === true }))}
            />
            <Label id="gst-label" htmlFor="gst" className="text-sm leading-snug font-normal">
              I&apos;m registered for GST
            </Label>
          </div>

          <div className="surface-pressed rounded-2xl p-4 text-sm">
            <p className="mb-2 font-medium">As an Evntly vendor, you agree to:</p>
            <ul className="list-disc space-y-1 pl-5 text-foreground/75">
              <li>keep your listing, photos and prices accurate, and show whether prices include GST;</li>
              <li>hold the licences and permits your services need (public liability insurance is strongly recommended);</li>
              <li>give clear quotes, including your deposit and cancellation terms, and honour accepted bookings;</li>
              <li>take payment directly from customers — Evntly doesn&apos;t hold booking payments;</li>
              <li>use customers&apos; details only for their enquiry or booking.</li>
            </ul>
            <p className="mt-2 text-foreground/75">
              Listing is currently free: no subscription, commission or booking fees.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox aria-labelledby="vendor-agreement-label" id="vendor-agreement" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
            <Label id="vendor-agreement-label" htmlFor="vendor-agreement" className="text-sm leading-snug font-normal text-muted-foreground">
              <span>
                I agree to the{" "}
                <Link href="/vendor-agreement" target="_blank" className="font-medium text-foreground underline underline-offset-2">
                  Vendor Service Agreement
                </Link>{" "}
                and its{" "}
                <Link href="/vendor-agreement#schedule-1" target="_blank" className="font-medium text-foreground underline underline-offset-2">
                  fee schedule
                </Link>
                , and I&apos;m authorised to agree on behalf of this business.
              </span>
            </Label>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-destructive-text">{error}</p>}
      </div>

      {/* Phones: Back / Continue stay in reach above the tab bar. */}
      <div className="frost sticky bottom-[calc(var(--tabbar-height)+0.5rem)] z-20 mt-4 flex gap-3 rounded-full p-1.5 shadow-[var(--shadow-float)] [--frost-bg:color-mix(in_oklab,var(--background)_88%,transparent)] md:static md:bottom-auto md:rounded-none md:bg-transparent md:p-0 md:shadow-none md:[--frost-bg:transparent]">
        {step > 0 && (
          <Button variant="raised" size="lg" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button size="lg" className="flex-1" disabled={!canAdvance} onClick={next}>
            Continue
          </Button>
        ) : (
          <Button size="lg" className="flex-1" disabled={!canAdvance || pending} onClick={submit}>
            {pending ? "Saving…" : (
              <>
                <CheckCircle2 /> Save and add photos
              </>
            )}
          </Button>
        )}
      </div>
    </div>
    </div>
  );
}
