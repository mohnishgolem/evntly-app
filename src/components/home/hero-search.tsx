"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { EVENT_TYPES, LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";
import { cn } from "@/lib/utils";

const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

// The homepage search: what, where/keyword, which event. A real GET form to
// /explore, so it works before (and without) JavaScript; with JS it drops
// empty fields so the URL stays clean. Uses /explore's existing params
// (category, q, event): no new search logic.
export function HeroSearch({ className }: { className?: string }) {
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(e.currentTarget)) {
      const v = String(value).trim();
      if (v) params.set(key, v);
    }
    router.push(params.size ? `/explore?${params}` : "/explore");
  }

  const segment = "flex min-w-0 flex-1 flex-col justify-center rounded-full px-6 py-2.5 transition-colors hover:bg-muted focus-within:bg-muted";
  const label = "text-xs font-semibold text-foreground";
  const control =
    "h-7 w-full min-w-0 appearance-none truncate bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground";

  return (
    <div role="search" aria-label="Find event vendors" className={cn("w-full", className)}>
      {/* Wide screens: one capsule with three segments. Each layout is its own
          form: hidden fields still submit, so one shared form would send both. */}
      <form action="/explore" method="get" onSubmit={onSubmit} className="hidden items-center rounded-full bg-background p-2 text-left shadow-search md:flex">
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
        <button
          type="submit"
          className="press ml-1 flex h-14 shrink-0 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <Search className="size-5" strokeWidth={2.25} aria-hidden />
          Search
        </button>
      </form>

      {/* Phones: a stacked card, large touch targets. */}
      <form action="/explore" method="get" onSubmit={onSubmit} className="rounded-3xl bg-background p-2 text-left shadow-search md:hidden">
        <label className="flex flex-col rounded-2xl px-4 py-3 focus-within:bg-muted">
          <span className={label}>Service</span>
          <select name="category" defaultValue="" className={cn(control, "mt-0.5 text-base")}>
            <option value="">Any vendor</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mx-4 h-px bg-border" />
        <div className="grid grid-cols-2">
          <label className="flex flex-col rounded-2xl px-4 py-3 focus-within:bg-muted">
            <span className={label}>Name or suburb</span>
            <input name="q" type="search" placeholder="Anywhere" className={cn(control, "mt-0.5 text-base")} autoComplete="off" />
          </label>
          <label className="flex flex-col rounded-2xl px-4 py-3 focus-within:bg-muted">
            <span className={label}>Event</span>
            <select name="event" defaultValue="" className={cn(control, "mt-0.5 text-base")}>
              <option value="">Any event</option>
              {EVENT_TYPES.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          className="press mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <Search className="size-5" strokeWidth={2.25} aria-hidden />
          Search vendors
        </button>
      </form>
    </div>
  );
}
