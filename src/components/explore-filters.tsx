"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAUNCH_CATEGORIES, VENDOR_CATEGORIES, EVENT_TYPES, PRICE_BUCKETS } from "@/lib/config";

export function ExploreFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const category = searchParams.get("category") ?? "";
  const event = searchParams.get("event") ?? "";
  const q = searchParams.get("q") ?? "";
  const price = searchParams.get("price") ?? "";
  const [draftQ, setDraftQ] = useState(q);

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

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(paramsRef.current.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    paramsRef.current = params;
    router.push(`${pathname}?${params.toString()}`);
  }

  const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

  return (
    <div className="space-y-5">
      {/* Search pill — a single rounded capsule with a trailing circular
          submit button, echoing Airbnb's signature search bar. */}
      <div className="flex max-w-xl items-center gap-2 rounded-full border border-border bg-background py-1.5 pr-1.5 pl-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-shadow focus-within:shadow-[0_2px_12px_rgba(0,0,0,0.12)]">
        <input
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", draftQ);
          }}
          placeholder="Search vendors by name, city..."
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => setParam("q", draftQ)}
          aria-label="Search"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <Search className="size-4" />
        </button>
      </div>

      {/* Category tabs — icon above label, selected state shown with an
          underline sitting on the row's divider, matching Airbnb's
          category nav rather than a row of filled pill buttons. */}
      <div className="scrollbar-hide -mx-4 flex gap-7 overflow-x-auto border-b border-border px-4">
        <button
          onClick={() => setParam("category", "")}
          className={cn(
            "-mb-px flex shrink-0 flex-col items-center gap-2 border-b-2 pt-1 pb-3 transition-colors",
            !category
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="text-2xl">🎉</span>
          <span className="text-xs font-medium whitespace-nowrap">All</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.value}
            onClick={() => setParam("category", c.value)}
            className={cn(
              "-mb-px flex shrink-0 flex-col items-center gap-2 border-b-2 pt-1 pb-3 transition-colors",
              category === c.value
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="text-2xl">{c.icon}</span>
            <span className="text-xs font-medium whitespace-nowrap">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setParam("event", "")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
            !event
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          )}
        >
          Any event
        </button>
        {EVENT_TYPES.map((ev) => (
          <button
            key={ev}
            onClick={() => setParam("event", ev)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
              event === ev
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            )}
          >
            {ev}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setParam("price", "")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
            !price
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          )}
        >
          Any price
        </button>
        {PRICE_BUCKETS.map((b) => (
          <button
            key={b.value}
            onClick={() => setParam("price", b.value)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
              price === b.value
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
