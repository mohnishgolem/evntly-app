"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EVENT_TYPES, LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";
import { submitVendorListing, type VendorSignupDraft } from "@/lib/actions/vendor-signup";
import { CheckCircle2, Clock } from "lucide-react";

const STEPS = ["Business", "Services", "Pricing", "Locations"] as const;
const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

export default function VendorSignupPage() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<VendorSignupDraft>({
    businessName: "",
    bio: "",
    serviceType: "",
    hourlyRate: 0,
    city: "",
    locationsServiced: [],
    eventTypes: [],
    phone: "",
  });
  const [locationInput, setLocationInput] = useState("");

  const canAdvance = [
    !!draft.businessName,
    !!draft.serviceType && draft.eventTypes.length > 0,
    draft.hourlyRate > 0,
    !!draft.city && draft.locationsServiced.length > 0,
  ][step];

  function addLocation() {
    const v = locationInput.trim();
    if (v && !draft.locationsServiced.includes(v)) {
      setDraft((d) => ({ ...d, locationsServiced: [...d.locationsServiced, v] }));
    }
    setLocationInput("");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitVendorListing(draft);
      if (res?.error) setError(res.error);
      else setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Clock className="mx-auto mb-4 h-12 w-12 text-warning" />
        <h1 className="mb-2 text-2xl font-bold">Profile submitted for review</h1>
        <p className="text-muted-foreground">
          Thanks for signing up! We review new listings within 24–48 hours — you&apos;ll appear in
          search once approved.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={cn(
                "h-1.5 w-full rounded-full transition-colors",
                i <= step ? "bg-primary" : "bg-muted"
              )}
            />
            <span className="text-[11px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <h1 className="mb-4 text-xl font-bold">Tell us about your business</h1>
          <div className="space-y-1.5">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              value={draft.businessName}
              onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              rows={4}
              value={draft.bio}
              onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h1 className="mb-4 text-xl font-bold">What do you offer?</h1>
          <p className="mb-2 text-sm font-medium">Category</p>
          <div className="mb-5 grid grid-cols-2 gap-2">
            {categories.map((c) => (
              <button
                key={c.value}
                onClick={() => setDraft((d) => ({ ...d, serviceType: c.value }))}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  draft.serviceType === c.value
                    ? "border-highlight bg-highlight-light text-highlight"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                )}
              >
                {c.icon} {c.label}
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
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      eventTypes: selected
                        ? d.eventTypes.filter((v) => v !== t)
                        : [...d.eventTypes, t],
                    }))
                  }
                  className={cn(
                    "rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                    selected
                      ? "border-highlight bg-highlight-light text-highlight"
                      : "border-border text-muted-foreground hover:border-foreground/30"
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
          <h1 className="mb-4 text-xl font-bold">Set your rate</h1>
          <div className="space-y-1.5">
            <Label htmlFor="hourlyRate">
              Hourly rate (AUD) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="hourlyRate"
              type="number"
              min={0}
              value={draft.hourlyRate || ""}
              onChange={(e) => setDraft((d) => ({ ...d, hourlyRate: Number(e.target.value) }))}
            />
            {draft.hourlyRate <= 0 && (
              <p className="text-xs text-muted-foreground">Enter a rate to continue.</p>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <h1 className="mb-1 text-xl font-bold">Where do you service?</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            This helps us match you with nearby events.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="city">Base city</Label>
            <Input
              id="city"
              placeholder="Sydney"
              value={draft.city}
              onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Suburbs / areas you service</Label>
            <div className="flex gap-2">
              <Input
                id="location"
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
              <Button type="button" variant="outline" onClick={addLocation}>
                Add
              </Button>
            </div>
            {draft.locationsServiced.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {draft.locationsServiced.map((loc) => (
                  <span
                    key={loc}
                    className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
                  >
                    {loc}
                    <button
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          locationsServiced: d.locationsServiced.filter((l) => l !== loc),
                        }))
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button className="flex-1" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button className="flex-1" disabled={!canAdvance || pending} onClick={submit}>
            {pending ? "Submitting…" : (
              <>
                <CheckCircle2 /> Submit for review
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
