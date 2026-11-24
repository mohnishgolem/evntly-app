"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Search, SlidersHorizontal } from "lucide-react";
import { EVENT_TYPES, LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";
import { cn } from "@/lib/utils";
import { CategoryArt } from "@/components/category-art";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

/** Builds a clean /explore URL (no empty params) from a form. */
function exploreUrl(form: HTMLFormElement) {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    const v = String(value).trim();
    if (v) params.set(key, v);
  }
  return params.size ? `/explore?${params}` : "/explore";
}

// The homepage search: what, where/keyword, which event. Real GET forms to
// /explore, so they work before (and without) JavaScript; with JS empty
// fields are dropped. Uses /explore's existing params (category, q, event).
export function HeroSearch({ className }: { className?: string }) {
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(exploreUrl(e.currentTarget));
  }

  const segment = "flex min-w-0 flex-1 flex-col justify-center rounded-full px-6 py-2.5 transition-colors hover:bg-foreground/[0.04] focus-within:bg-foreground/[0.04]";
  const label = "text-xs font-semibold text-foreground";
  const control =
    "h-7 w-full min-w-0 appearance-none truncate bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground";

  return (
    <div role="search" aria-label="Find event vendors" className={cn("w-full", className)}>
      {/* Wide screens: one floating capsule with three segments. Each layout is
          its own form: hidden fields still submit, so a shared form would send both. */}
      <form action="/explore" method="get" onSubmit={onSubmit} className="surface-float hidden items-center rounded-full p-2 text-left md:flex">
        <label className={segment}>
          <span className={label}>Service</span>
          <select name="category" defaultValue="" className={cn(control, "cursor-pointer")}>
            <option value="">Any vendor</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <span aria-hidden className="h-8 w-px bg-border" />
        <label className={segment}>
          <span className={label}>Name or suburb</span>
          <input name="q" type="search" placeholder="e.g. Parramatta" className={control} autoComplete="off" />
        </label>
        <span aria-hidden className="h-8 w-px bg-border" />
        <label className={segment}>
          <span className={label}>Event</span>
          <select name="event" defaultValue="" className={cn(control, "cursor-pointer")}>
            <option value="">Any event</option>
            {EVENT_TYPES.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-coral ml-1 flex h-14 shrink-0 items-center gap-2 rounded-full px-6 text-[15px] font-semibold">
          <Search className="size-5" strokeWidth={2.25} aria-hidden />
          Search
        </button>
      </form>

      <MobileSearch onSubmit={onSubmit} />
    </div>
  );
}

// Phones: one compact floating pill (works without JS), plus a bottom sheet
// for service and event when you want to narrow it down first.
function MobileSearch({ onSubmit }: { onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");

  return (
    <div className="flex items-center gap-2 md:hidden">
      <form action="/explore" method="get" onSubmit={onSubmit} className="surface-float flex h-14 min-w-0 flex-1 items-center gap-2 rounded-full py-1.5 pr-1.5 pl-5">
        <Search className="size-5 shrink-0 text-foreground" strokeWidth={2.25} aria-hidden />
        <input
          name="q"
          type="search"
          enterKeyHint="search"
          aria-label="Search vendors by name or suburb"
          placeholder="Search vendors"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button type="submit" className="btn-coral flex h-11 shrink-0 items-center rounded-full px-4 text-[15px] font-semibold">
          Search
        </button>
      </form>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button type="button" aria-label="Search by service and event" className="btn-raised flex size-14 shrink-0 items-center justify-center rounded-full text-foreground" />
          }
        >
          <SlidersHorizontal className="size-5" aria-hidden />
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[88dvh] gap-0 overflow-y-auto pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div aria-hidden className="mx-auto mt-1 mb-2 h-1.5 w-10 rounded-full bg-border" />
          <SheetHeader className="px-0">
            <SheetTitle className="text-headline">Find vendors</SheetTitle>
            <SheetDescription>Pick a service and event, or leave them open.</SheetDescription>
          </SheetHeader>
          <form
            action="/explore"
            method="get"
            onSubmit={(e) => {
              setOpen(false);
              onSubmit(e);
            }}
          >
            <fieldset className="mt-3">
              <legend className="text-[15px] font-semibold">Service</legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <ServiceChoice value="" label="Any" selected={!category} onSelect={setCategory} />
                {categories.map((c) => (
                  <ServiceChoice key={c.value} value={c.value} label={c.label} selected={category === c.value} onSelect={setCategory} />
                ))}
              </div>
              <input type="hidden" name="category" value={category} />
            </fieldset>
            <label className="mt-6 block">
              <span className="text-[15px] font-semibold">Event</span>
              <select name="event" defaultValue="" className="btn-raised mt-2 h-12 w-full appearance-none rounded-2xl px-4 text-base">
                <option value="">Any event</option>
                {EVENT_TYPES.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="text-[15px] font-semibold">Name or suburb</span>
              <input name="q" type="search" placeholder="Anywhere in Sydney" autoComplete="off" className="surface-pressed mt-2 h-12 w-full rounded-2xl px-4 text-base outline-none placeholder:text-muted-foreground" />
            </label>
            {/* Stays reachable above the keyboard while typing. */}
            <div className="sticky bottom-0 -mx-1 mt-6 bg-popover px-1 pt-2 pb-1">
              <button type="submit" className="btn-coral flex h-13 w-full items-center justify-center gap-2 rounded-full py-3.5 text-base font-semibold">
                <Search className="size-5" strokeWidth={2.25} aria-hidden />
                Show vendors
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ServiceChoice({ value, label, selected, onSelect }: { value: string; label: string; selected: boolean; onSelect: (v: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-1 rounded-tile px-1 pt-2 pb-2.5 text-center text-xs leading-tight font-semibold",
        selected ? "surface-pressed text-foreground" : "btn-raised"
      )}
    >
      {value ? <CategoryArt value={value} className="size-10" /> : <LayoutGrid className="size-10 p-2 text-foreground/70" strokeWidth={1.5} aria-hidden />}
      {label}
    </button>
  );
}
