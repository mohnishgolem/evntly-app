"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LayoutGrid, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAUNCH_CATEGORIES, VENDOR_CATEGORIES, EVENT_TYPES, PRICE_BUCKETS } from "@/lib/config";
import { useSheetSide } from "@/lib/use-sheet-side";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CategoryArt } from "@/components/category-art";
import { categoryShortLabel } from "@/lib/category-art";

const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

// Search bar, category tabs and a Filters sheet (event type, price). Same URL
// params as before (q, category, event, price), so search logic is unchanged.
export function ExploreFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const side = useSheetSide();

  const category = searchParams.get("category") ?? "";
  const event = searchParams.get("event") ?? "";
  const q = searchParams.get("q") ?? "";
  const price = searchParams.get("price") ?? "";
  const [draftQ, setDraftQ] = useState(q);
  const [open, setOpen] = useState(false);
  const [draft, setDraftState] = useState({ event, price });
  // The sheet's choices, readable synchronously: "Show vendors" must apply the
  // latest tap even if it lands before React re-renders (fast taps, slow phones).
  const draftRef = useRef(draft);
  function setDraft(next: { event: string; price: string } | ((d: { event: string; price: string }) => { event: string; price: string })) {
    draftRef.current = typeof next === "function" ? next(draftRef.current) : next;
    setDraftState(draftRef.current);
  }

  // Neither the `searchParams` hook value nor `window.location.search` are
  // guaranteed to reflect a router.push until that navigation has actually
  // resolved, so two filter clicks in quick succession would otherwise race
  // and the second one would drop the first's param. This ref is mutated
  // synchronously on every call so each click always builds on the latest
  // *intended* params, independent of how fast the navigation itself is.
  const paramsRef = useRef(new URLSearchParams(searchParams.toString()));
  useEffect(() => {
    paramsRef.current = new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  function setParams(changes: Record<string, string>) {
    const params = new URLSearchParams(paramsRef.current.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    paramsRef.current = params;
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }

  const activeCount = (event ? 1 : 0) + (price ? 1 : 0);
  const priceLabel = PRICE_BUCKETS.find((b) => b.value === price)?.label;

  return (
    <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 frost border-b border-border/60 px-4 pt-3 [--frost-bg:color-mix(in_oklab,var(--canvas)_85%,transparent)] [--frost-blur:24px] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex items-center gap-2">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ q: draftQ.trim() });
          }}
          className="surface-float flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full py-1.5 pr-1.5 pl-5 md:max-w-lg"
        >
          <input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            type="search"
            enterKeyHint="search"
            aria-label="Search vendors by name or suburb"
            placeholder="Search by name or suburb"
            className="h-9 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-[15px]"
          />
          <button
            type="submit"
            aria-label="Search"
            className="btn-coral flex size-9 shrink-0 items-center justify-center rounded-full"
          >
            <Search className="size-4" strokeWidth={2.25} />
          </button>
        </form>

        <Sheet
          open={open}
          onOpenChange={(next) => {
            if (next) setDraft({ event, price });
            setOpen(next);
          }}
        >
          <SheetTrigger
            render={
              <button
                type="button"
                className={cn(
                  "relative flex h-12 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold",
                  activeCount ? "surface-pressed text-foreground ring-1 ring-primary/40" : "btn-raised"
                )}
              />
            }
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            <span className="hidden sm:inline">Filters</span>
            {activeCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary-strong text-xs text-primary-foreground tabular-nums">
                {activeCount}
              </span>
            )}
            <span className="sr-only sm:hidden">Filters</span>
          </SheetTrigger>
          <SheetContent
            side={side}
            className="max-h-[88dvh] gap-0 overflow-y-auto px-6 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-dvh sm:max-w-md sm:rounded-none"
          >
            {side === "bottom" && <div aria-hidden className="mx-auto mt-1 mb-2 h-1.5 w-10 rounded-full bg-border" />}
            <SheetHeader className="px-0">
              <SheetTitle className="text-headline">Filters</SheetTitle>
              <SheetDescription>Narrow vendors by the event and your budget.</SheetDescription>
            </SheetHeader>

            <FilterGroup label="Event type">
              <Choice selected={!draft.event} onClick={() => setDraft((d) => ({ ...d, event: "" }))}>
                Any event
              </Choice>
              {EVENT_TYPES.map((ev) => (
                <Choice key={ev} selected={draft.event === ev} onClick={() => setDraft((d) => ({ ...d, event: ev }))}>
                  {ev}
                </Choice>
              ))}
            </FilterGroup>

            <FilterGroup label="Hourly rate" hint="Matches vendors who charge by the hour.">
              <Choice selected={!draft.price} onClick={() => setDraft((d) => ({ ...d, price: "" }))}>
                Any price
              </Choice>
              {PRICE_BUCKETS.map((b) => (
                <Choice key={b.value} selected={draft.price === b.value} onClick={() => setDraft((d) => ({ ...d, price: b.value }))}>
                  {b.label}
                </Choice>
              ))}
            </FilterGroup>

            <SheetFooter className="sticky bottom-0 mt-6 flex-row items-center justify-between gap-3 border-t border-border bg-popover px-0 pt-4 pb-1">
              <button
                type="button"
                onClick={() => setDraft({ event: "", price: "" })}
                className="rounded-lg px-1 text-[15px] font-semibold underline underline-offset-4"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => {
                  setParams({ event: draftRef.current.event, price: draftRef.current.price });
                  setOpen(false);
                }}
                className="btn-coral h-12 rounded-full px-7 text-[15px] font-semibold"
              >
                Show vendors
              </button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {/* Category tabs: icon over label, underline on the selected one. */}
      <nav aria-label="Categories" className="scrollbar-hide -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto sm:mt-3 sm:gap-2 overflow-y-hidden overscroll-x-contain px-4 pt-0.5 pb-3 sm:mx-0 sm:px-0">
        <CategoryTab selected={!category} onClick={() => setParams({ category: "" })} label="All" />
        {categories.map((c) => (
          <CategoryTab key={c.value} selected={category === c.value} onClick={() => setParams({ category: c.value })} value={c.value} label={c.label} />
        ))}
      </nav>

      {(event || price || q) && (
        <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          {q && <ActiveChip label={`“${q}”`} onRemove={() => { setDraftQ(""); setParams({ q: "" }); }} />}
          {event && <ActiveChip label={event} onRemove={() => setParams({ event: "" })} />}
          {price && priceLabel && <ActiveChip label={priceLabel} onRemove={() => setParams({ price: "" })} />}
        </div>
      )}
    </div>
  );
}

// A raised button with the category's 3D illustration; the selected one is
// pressed into the bar.
function CategoryTab({ selected, onClick, value, label }: { selected: boolean; onClick: () => void; value?: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex h-[3.875rem] w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-center sm:h-[5.25rem] sm:w-[6.25rem] sm:gap-1 sm:rounded-tile sm:px-1.5",
        selected ? "surface-pressed text-foreground ring-1 ring-primary/40" : "btn-raised text-muted-foreground hover:text-foreground"
      )}
    >
      {value ? (
        <CategoryArt value={value} eager className={cn("size-7 transition-transform duration-200 ease-standard sm:size-9", selected ? "scale-95" : "drop-shadow-[0_3px_3px_rgba(28,25,23,0.16)]")} />
      ) : (
        <LayoutGrid className="size-7 p-1 sm:size-9 sm:p-1.5" strokeWidth={1.6} aria-hidden />
      )}
      <span className="text-[11px] leading-tight font-semibold whitespace-nowrap sm:hidden">{value ? categoryShortLabel(value, label) : label}</span>
      <span className="hidden line-clamp-2 text-[11.5px] leading-tight font-semibold sm:block">{label}</span>
    </button>
  );
}

function FilterGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-6">
      <legend className="text-[15px] font-semibold">{label}</legend>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "h-10 rounded-full px-4 text-sm font-medium",
        selected ? "surface-pressed font-semibold text-foreground ring-1 ring-primary/40" : "btn-raised"
      )}
    >
      {children}
    </button>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter ${label}`}
      className="btn-raised flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-2.5 pl-3.5 text-[13px] font-medium"
    >
      {label}
      <X className="size-3.5 text-muted-foreground" aria-hidden />
    </button>
  );
}
