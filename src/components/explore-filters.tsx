"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LAUNCH_CATEGORIES, VENDOR_CATEGORIES, EVENT_TYPES } from "@/lib/config";

export function ExploreFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const category = searchParams.get("category") ?? "";
  const event = searchParams.get("event") ?? "";
  const q = searchParams.get("q") ?? "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          defaultValue={q}
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", e.currentTarget.value);
          }}
          onBlur={(e) => setParam("q", e.currentTarget.value)}
          placeholder="Search vendors by name, city..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setParam("category", "")}
          className={cn(
            "shrink-0 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-all",
            !category
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          )}
        >
          All categories
        </button>
        {categories.map((c) => (
          <button
            key={c.value}
            onClick={() => setParam("category", c.value)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-all",
              category === c.value
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            )}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setParam("event", "")}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
            !event
              ? "border-coral bg-coral-light text-coral"
              : "border-border text-muted-foreground hover:border-coral/40"
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
                ? "border-coral bg-coral-light text-coral"
                : "border-border text-muted-foreground hover:border-coral/40"
            )}
          >
            {ev}
          </button>
        ))}
      </div>
    </div>
  );
}
