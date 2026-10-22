"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  deletePackage,
  savePackage,
  updateServiceArea,
  type PackageInput,
  type ServiceAreaInput,
} from "@/lib/actions/vendor-pricing";
import { cn } from "@/lib/utils";

export type VendorPackageRow = {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  included_hours: number | null;
  extra_hour_cents: number | null;
  inclusions: string[];
  delivery_days: number | null;
  deposit_percent: number | null;
  active: boolean;
  sort_order: number;
};

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;

/** "" → null, otherwise a finite number (NaN → undefined = invalid). */
function parseOptional(raw: string): number | null | undefined {
  const clean = raw.replace(/[$,\s]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : undefined;
}

function useSaver() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  function run(action: () => Promise<{ error?: string } | null>, onDone?: () => void) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await action();
      if (res?.error) setError(res.error);
      else {
        setSaved(true);
        onDone?.();
        router.refresh();
      }
    });
  }
  return { pending, error, saved, setError, run };
}

// ── Service area ────────────────────────────────────────────────────────

export function ServiceAreaForm({
  listingId,
  baseSuburb,
  initial,
}: {
  listingId: string;
  baseSuburb: string | null;
  initial: ServiceAreaInput;
}) {
  const { pending, error, saved, setError, run } = useSaver();
  const [form, setForm] = useState({
    radiusKm: String(initial.radiusKm),
    freeTravelKm: String(initial.freeTravelKm),
    travelFeePerKm: initial.travelFeePerKm ? String(initial.travelFeePerKm) : "",
    travelsRegional: initial.travelsRegional,
    minBookingHours: initial.minBookingHours ? String(initial.minBookingHours) : "",
  });

  function save(e: React.FormEvent) {
    e.preventDefault();
    const radiusKm = Number(form.radiusKm);
    const freeTravelKm = Number(form.freeTravelKm || 0);
    const fee = parseOptional(form.travelFeePerKm);
    const minHours = parseOptional(form.minBookingHours);
    if (!Number.isInteger(radiusKm) || radiusKm < 1) return setError("Enter your service radius in whole km.");
    if (!Number.isInteger(freeTravelKm) || freeTravelKm < 0) return setError("Enter free travel in whole km.");
    if (fee === undefined || minHours === undefined) return setError("Check the numbers you entered.");
    run(() =>
      updateServiceArea(listingId, {
        radiusKm,
        freeTravelKm,
        travelFeePerKm: fee ?? 0,
        travelsRegional: form.travelsRegional,
        minBookingHours: minHours,
      })
    );
  }

  const fee = parseOptional(form.travelFeePerKm) ?? 0;
  const free = Number(form.freeTravelKm || 0);
  const example = fee > 0 ? Math.max(0, 30 - free) * 2 * fee : 0;

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 className="font-semibold">Service area & travel</h3>
        <p className="text-sm text-muted-foreground">
          Measured from {baseSuburb || "your base suburb"}. Change your base suburb in Listings.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`radius-${listingId}`}>Service radius (km)</Label>
          <Input
            id={`radius-${listingId}`}
            inputMode="numeric"
            value={form.radiusKm}
            onChange={(e) => setForm((f) => ({ ...f, radiusKm: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`minhrs-${listingId}`}>Minimum booking (hours)</Label>
          <Input
            id={`minhrs-${listingId}`}
            inputMode="decimal"
            placeholder="None"
            value={form.minBookingHours}
            onChange={(e) => setForm((f) => ({ ...f, minBookingHours: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`free-${listingId}`}>Free travel (km)</Label>
          <Input
            id={`free-${listingId}`}
            inputMode="numeric"
            value={form.freeTravelKm}
            onChange={(e) => setForm((f) => ({ ...f, freeTravelKm: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`fee-${listingId}`}>Travel fee per km after that</Label>
          <Input
            id={`fee-${listingId}`}
            inputMode="decimal"
            placeholder="$0"
            value={form.travelFeePerKm}
            onChange={(e) => setForm((f) => ({ ...f, travelFeePerKm: e.target.value }))}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Travel is charged each way.{" "}
        {fee > 0 ? `An event 30 km away adds ${dollars(Math.round(example * 100))} to the estimate.` : "No travel fee is set."}
      </p>
      <label className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
        <span>
          <span className="block text-sm font-medium">I travel to regional NSW</span>
          <span className="block text-xs text-muted-foreground">Match me with events up to 350 km away.</span>
        </span>
        <Switch
          checked={form.travelsRegional}
          onCheckedChange={(v) => setForm((f) => ({ ...f, travelsRegional: v }))}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} Save
        </Button>
        {saved && !pending && <span className="text-sm text-success">Saved</span>}
      </div>
    </form>
  );
}

// ── Packages ────────────────────────────────────────────────────────────

export function PackageList({
  listingId,
  hourlyRate,
  packages,
}: {
  listingId: string;
  hourlyRate: number;
  packages: VendorPackageRow[];
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Packages</h3>
          <p className="text-sm text-muted-foreground">
            {packages.length
              ? "Customers see the cheapest package that covers their event."
              : `Without packages, estimates use your hourly rate${hourlyRate ? ` ($${hourlyRate}/hr)` : ""}.`}
          </p>
        </div>
        {packages.length < 12 && <PackageEditor listingId={listingId} />}
      </div>
      {packages.length > 0 && (
        <ul className="divide-y divide-border">
          {packages.map((p) => (
            <li key={p.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium", !p.active && "text-muted-foreground")}>
                  {p.name} {!p.active && <span className="text-xs font-normal">(hidden)</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {dollars(p.price_cents)}
                  {p.included_hours ? ` · ${Number(p.included_hours)} hrs` : " · flat price"}
                  {p.extra_hour_cents ? ` · extra hours ${dollars(p.extra_hour_cents)}` : ""}
                </p>
                {p.inclusions.length > 0 && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.inclusions.join(" · ")}</p>
                )}
              </div>
              <PackageEditor listingId={listingId} pkg={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PackageEditor({ listingId, pkg }: { listingId: string; pkg?: VendorPackageRow }) {
  const [open, setOpen] = useState(false);
  const { pending, error, setError, run } = useSaver();
  const [form, setForm] = useState(() => ({
    name: pkg?.name ?? "",
    description: pkg?.description ?? "",
    price: pkg ? String(pkg.price_cents / 100) : "",
    includedHours: pkg?.included_hours != null ? String(Number(pkg.included_hours)) : "",
    extraHourPrice: pkg?.extra_hour_cents != null ? String(pkg.extra_hour_cents / 100) : "",
    inclusions: (pkg?.inclusions ?? []).join("\n"),
    deliveryDays: pkg?.delivery_days != null ? String(pkg.delivery_days) : "",
    depositPercent: pkg?.deposit_percent != null ? String(pkg.deposit_percent) : "",
    active: pkg?.active ?? true,
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const price = parseOptional(form.price);
    const includedHours = parseOptional(form.includedHours);
    const extraHourPrice = parseOptional(form.extraHourPrice);
    const deliveryDays = parseOptional(form.deliveryDays);
    const depositPercent = parseOptional(form.depositPercent);
    if (price == null) return setError("Enter a price.");
    if ([includedHours, extraHourPrice, deliveryDays, depositPercent].includes(undefined)) {
      return setError("Check the numbers you entered.");
    }
    const input: PackageInput = {
      name: form.name,
      description: form.description,
      price,
      includedHours: includedHours ?? null,
      extraHourPrice: extraHourPrice ?? null,
      inclusions: form.inclusions
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      deliveryDays: deliveryDays == null ? null : Math.round(deliveryDays),
      depositPercent: depositPercent == null ? null : Math.round(depositPercent),
      active: form.active,
    };
    run(() => savePackage(listingId, input, pkg?.id), () => setOpen(false));
  }

  const field = (key: keyof typeof form) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });
  const id = (k: string) => `${pkg?.id ?? "new"}-${k}`;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          pkg ? (
            <Button variant="ghost" size="icon-lg" aria-label={`Edit ${pkg.name}`} />
          ) : (
            <Button variant="outline" size="lg" />
          )
        }
      >
        {pkg ? <Pencil aria-hidden /> : (<><Plus aria-hidden /> Add package</>)}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="max-h-dvh overflow-y-auto px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{pkg ? "Edit package" : "New package"}</SheetTitle>
          <SheetDescription>Prices include GST if you charge it.</SheetDescription>
        </SheetHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={id("name")}>Name</Label>
            <Input id={id("name")} maxLength={80} placeholder="e.g. 4 hour party coverage" required {...field("name")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={id("price")}>Price (AUD)</Label>
              <Input id={id("price")} inputMode="decimal" required {...field("price")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("hours")}>Hours included</Label>
              <Input id={id("hours")} inputMode="decimal" placeholder="Flat price" {...field("includedHours")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("extra")}>Each extra hour</Label>
              <Input id={id("extra")} inputMode="decimal" placeholder="Not offered" {...field("extraHourPrice")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("deposit")}>Deposit (%)</Label>
              <Input id={id("deposit")} inputMode="numeric" placeholder="—" {...field("depositPercent")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("delivery")}>Delivery (days)</Label>
              <Input id={id("delivery")} inputMode="numeric" placeholder="—" {...field("deliveryDays")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("incl")}>What&apos;s included (one per line)</Label>
            <Textarea id={id("incl")} rows={4} placeholder={"Edited online gallery\n200+ photos"} {...field("inclusions")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("desc")}>Description (optional)</Label>
            <Textarea id={id("desc")} rows={3} maxLength={1000} {...field("description")} />
          </div>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3 text-sm font-medium">
            Show to customers
            <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} Save package
          </Button>
          {pkg &&
            (confirmDelete ? (
              <div className="flex items-center justify-end gap-2">
                <span className="text-sm">Delete this package?</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  disabled={pending}
                  onClick={() => run(() => deletePackage(listingId, pkg.id), () => setOpen(false))}
                >
                  Delete
                </Button>
                <Button type="button" variant="ghost" size="lg" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="ml-auto flex h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden /> Delete package
              </button>
            ))}
        </form>
      </SheetContent>
    </Sheet>
  );
}
