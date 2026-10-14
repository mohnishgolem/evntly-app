"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type EarningsMonth = {
  key: string; // YYYY-MM
  label: string; // "Oct"
  fullLabel: string; // "October 2026"
  earned: number; // completed bookings
  confirmed: number; // confirmed, not yet completed
  isFuture: boolean;
};

// Categorical pair validated (dataviz validate_palette.js) against both
// surfaces: brand coral for money already earned, blue for confirmed work.
const EARNED = "bg-[#e8604a]";
const CONFIRMED = "bg-[#2a78d6] dark:bg-[#3987e5]";

const aud = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

function niceMax(value: number) {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

export function EarningsChart({ months }: { months: EarningsMonth[] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = niceMax(Math.max(...months.map((m) => m.earned + m.confirmed)));
  const ticks = [max, max / 2, 0];
  const activeIndex = months.findIndex((m) => m.key === active);
  const activeMonth = activeIndex >= 0 ? months[activeIndex] : null;
  // Anchor the tooltip over the hovered bar, kept inside the plot.
  const tooltipLeft = activeIndex >= 0 ? ((activeIndex + 0.5) / months.length) * 100 : 50;

  return (
    <figure className="rounded-2xl border border-border p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Booking value by month</span>
        <span className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", EARNED)} /> Earned
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", CONFIRMED)} /> Confirmed
          </span>
        </span>
      </figcaption>

      <div className="relative flex h-48 gap-2">
        {/* Y axis */}
        <div className="flex w-12 shrink-0 flex-col justify-between text-right text-[10px] text-muted-foreground tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {t >= 1000 ? `$${t / 1000}k` : `$${t}`}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* Recessive gridlines */}
          {ticks.map((t, i) => (
            <span
              key={t}
              className={cn(
                "pointer-events-none absolute inset-x-0 border-t",
                i === ticks.length - 1 ? "border-border" : "border-dashed border-border/60"
              )}
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-1 sm:gap-1.5">
            {months.map((m) => {
              const total = m.earned + m.confirmed;
              const isActive = m.key === active;
              return (
                <button
                  key={m.key}
                  type="button"
                  onMouseEnter={() => setActive(m.key)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(m.key)}
                  onBlur={() => setActive(null)}
                  aria-label={`${m.fullLabel}: earned ${aud(m.earned)}, confirmed ${aud(m.confirmed)}`}
                  // Full-height hit target, bigger than the bar itself.
                  className="group flex h-full flex-1 flex-col justify-end"
                >
                  <span
                    className={cn(
                      "flex w-full flex-col justify-end gap-[2px] transition-opacity",
                      active && !isActive && "opacity-50"
                    )}
                    style={{ height: `${(total / max) * 100}%` }}
                  >
                    {m.confirmed > 0 && (
                      <span
                        className={cn("w-full rounded-t-[4px]", CONFIRMED)}
                        style={{ flexGrow: m.confirmed }}
                      />
                    )}
                    {m.earned > 0 && (
                      <span
                        className={cn("w-full", EARNED, m.confirmed === 0 && "rounded-t-[4px]")}
                        style={{ flexGrow: m.earned }}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {activeMonth && (
            <div
              className={cn(
                "pointer-events-none absolute -top-2 z-10 rounded-xl border border-border bg-popover px-3 py-2 text-xs whitespace-nowrap shadow-lg",
                tooltipLeft < 25 ? "translate-x-0" : tooltipLeft > 75 ? "-translate-x-full" : "-translate-x-1/2"
              )}
              style={{ left: `${tooltipLeft}%` }}
            >
              <p className="mb-1 font-semibold">{activeMonth.fullLabel}</p>
              <p className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className={cn("size-2 rounded-sm", EARNED)} /> Earned
                </span>
                <span className="font-medium tabular-nums">{aud(activeMonth.earned)}</span>
              </p>
              <p className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className={cn("size-2 rounded-sm", CONFIRMED)} /> Confirmed
                </span>
                <span className="font-medium tabular-nums">{aud(activeMonth.confirmed)}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* X axis */}
      <div className="mt-1.5 flex gap-2">
        <span className="w-12 shrink-0" />
        <div className="flex flex-1 gap-1 sm:gap-1.5">
          {months.map((m, i) => (
            <span
              key={m.key}
              className={cn(
                "flex-1 text-center text-[10px] text-muted-foreground",
                m.isFuture && "italic",
                // On phones, label every other month so labels don't collide.
                i % 2 === 1 && "max-sm:invisible"
              )}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">View as table</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Month</th>
              <th className="py-1 text-right font-medium">Earned</th>
              <th className="py-1 text-right font-medium">Confirmed</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {months.map((m) => (
              <tr key={m.key} className="border-t border-border">
                <td className="py-1">{m.fullLabel}</td>
                <td className="py-1 text-right">{aud(m.earned)}</td>
                <td className="py-1 text-right">{aud(m.confirmed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
