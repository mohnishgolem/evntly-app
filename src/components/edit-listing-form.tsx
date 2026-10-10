"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EVENT_TYPES, LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";
import { updateVendorListing, type VendorSignupDraft } from "@/lib/actions/vendor-signup";

const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

export function EditListingForm({
  listingId,
  initial,
}: {
  listingId: string;
  initial: VendorSignupDraft;
}) {
  const [draft, setDraft] = useState<VendorSignupDraft>(initial);
  const [locationInput, setLocationInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      const res = await updateVendorListing(listingId, draft);
      if (res?.error) setError(res.error);
    });
  }

  const canSubmit =
    !!draft.businessName &&
    !!draft.serviceType &&
    draft.eventTypes.length > 0 &&
    draft.hourlyRate > 0 &&
    !!draft.city &&
    draft.locationsServiced.length > 0;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="edit-name">Business name</Label>
        <Input
          id="edit-name"
          value={draft.businessName}
          onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-bio">Bio</Label>
        <Textarea
          id="edit-bio"
          rows={4}
          value={draft.bio}
          onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-phone">Phone (optional)</Label>
        <Input
          id="edit-phone"
          value={draft.phone ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Category</p>
        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, serviceType: c.value }))}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                draft.serviceType === c.value
                  ? "border-highlight bg-highlight-light text-highlight"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              )}
            >
              <c.icon className="size-4" /> {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Event types you cover</p>
        <div className="grid grid-cols-2 gap-2">
          {EVENT_TYPES.map((t) => {
            const selected = draft.eventTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
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

      <div className="space-y-1.5">
        <Label htmlFor="edit-rate">
          Hourly rate (AUD) <span className="text-destructive">*</span>
        </Label>
        <Input
          id="edit-rate"
          type="number"
          min={0}
          value={draft.hourlyRate || ""}
          onChange={(e) => setDraft((d) => ({ ...d, hourlyRate: Number(e.target.value) }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-city">Base city</Label>
        <Input
          id="edit-city"
          placeholder="Sydney"
          value={draft.city}
          onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-location">Suburbs / areas you service</Label>
        <div className="flex gap-2">
          <Input
            id="edit-location"
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
                  type="button"
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" disabled={!canSubmit || pending} onClick={submit}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
