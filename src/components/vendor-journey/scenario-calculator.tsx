"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { trackVendorJourney } from "@/lib/track-client";
import { formatAud, runScenario, SCENARIO_DISCLAIMER, SCENARIO_LIMITS } from "@/lib/vendor-journey/scenario";

// "What would a few extra bookings be worth to you?" Both inputs are the
// vendor's own; Evntly's only figure is its current $0 fee. See scenario.ts.

export function ScenarioCalculator() {
  const id = useId();
  const [price, setPrice] = useState<number>(SCENARIO_LIMITS.price.initial);
  const [bookings, setBookings] = useState<number>(SCENARIO_LIMITS.bookings.initial);
  const result = runScenario({ pricePerBooking: price, extraBookingsPerMonth: bookings });
  const touched = () => trackVendorJourney("calculator_used");

  return (
    <div className="surface-raised rounded-card p-5 sm:p-6">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold tracking-wide uppercase">
        Hypothetical scenario
      </p>
      <h3 className="mt-3 text-[20px] font-bold">What would a few extra bookings be worth to you?</h3>
      <p className="mt-1 text-[15px] text-muted-foreground">Use your own numbers. We don&apos;t guess your demand.</p>

      <div className="mt-5 space-y-5">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor={`${id}-price`} className="text-sm font-medium">
              Your typical booking
            </label>
            <span className="text-[17px] font-semibold tabular-nums">{formatAud(price)}</span>
          </div>
          <input
            id={`${id}-price`}
            type="range"
            min={SCENARIO_LIMITS.price.min}
            max={5000}
            step={SCENARIO_LIMITS.price.step}
            value={Math.min(price, 5000)}
            onChange={(e) => {
              setPrice(Number(e.target.value));
              touched();
            }}
            className="mt-2 h-11 w-full accent-[var(--primary)]"
          />
          <input
            aria-label="Typical booking amount in dollars"
            type="number"
            inputMode="numeric"
            min={SCENARIO_LIMITS.price.min}
            max={SCENARIO_LIMITS.price.max}
            value={price}
            onChange={(e) => {
              setPrice(Number(e.target.value) || SCENARIO_LIMITS.price.min);
              touched();
            }}
            className="mt-1 h-10 w-32 rounded-xl border border-input bg-background px-3 text-[15px]"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Extra bookings a month you&apos;d like</legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={bookings === n}
                onClick={() => {
                  setBookings(n);
                  touched();
                }}
                className={
                  bookings === n
                    ? "min-h-11 rounded-full [background:var(--gradient-coral-strong)] font-semibold text-primary-foreground"
                    : "btn-raised min-h-11 rounded-full font-medium"
                }
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3" aria-live="polite">
        <div className="rounded-2xl bg-secondary p-4">
          <dt className="text-xs text-muted-foreground">A month, before your costs</dt>
          <dd className="mt-1 text-[24px] font-bold tabular-nums">{formatAud(result.monthly)}</dd>
        </div>
        <div className="rounded-2xl bg-secondary p-4">
          <dt className="text-xs text-muted-foreground">Evntly fees on that today</dt>
          <dd className="mt-1 text-[24px] font-bold tabular-nums">{formatAud(result.evntlyFees)}</dd>
        </div>
      </dl>
      <p className="mt-3 flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {SCENARIO_DISCLAIMER}
      </p>
    </div>
  );
}
