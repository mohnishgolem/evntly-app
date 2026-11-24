"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PRICING_MODEL_OPTIONS, isPricingModel, type PricingDraft, type PricingModel } from "@/lib/pricing-model";

/**
 * "How do you price?" — four options, then the one amount that option needs
 * (none for Custom quote). Shared by the sign-up wizard and the edit form.
 */
export function PricingFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: PricingDraft;
  onChange: (next: PricingDraft) => void;
}) {
  const model: PricingModel = isPricingModel(value.pricingModel) ? value.pricingModel : "hourly";
  const amountField = model === "hourly" ? "hourlyRate" : "basePrice";
  const amount = model === "hourly" ? value.hourlyRate : value.basePrice;
  const amountId = `${idPrefix}-price`;
  const amountLabel =
    model === "hourly" ? "Hourly rate (AUD)" : model === "fixed" ? "Price per event (AUD)" : "Starting price (AUD)";

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">How do you price?</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {PRICING_MODEL_OPTIONS.map((o) => {
            const selected = o.value === model;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ ...value, pricingModel: o.value })}
                className={cn(
                  "min-h-14 rounded-2xl px-4 py-2.5 text-left",
                  selected ? "surface-pressed ring-1 ring-primary/40" : "btn-raised"
                )}
              >
                <span className="block text-sm font-semibold text-foreground">{o.label}</span>
                <span className="block text-xs text-foreground/70">{o.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {model === "quote" ? (
        <p className="text-sm text-muted-foreground">
          Your listing shows &ldquo;Contact for pricing&rdquo;. Customers send you their event details and you reply
          with a quote.
        </p>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={amountId}>
            {amountLabel} <span className="text-destructive">*</span>
          </Label>
          <Input
            id={amountId}
            type="number"
            inputMode="decimal"
            min={0}
            value={amount || ""}
            onChange={(e) => onChange({ ...value, [amountField]: Number(e.target.value) })}
          />
          {!(Number(amount) > 0) && <p className="text-xs text-muted-foreground">Enter an amount to continue.</p>}
          {model === "from" && (
            <p className="text-xs text-muted-foreground">Shown as &ldquo;From $X&rdquo;. You quote the final price.</p>
          )}
        </div>
      )}
    </div>
  );
}
