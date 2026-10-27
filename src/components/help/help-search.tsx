"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";
import { searchHelp, type SearchDoc } from "@/lib/help/search";
import { cn } from "@/lib/utils";

const AUDIENCES = [
  { value: "all", label: "Everyone" },
  { value: "customer", label: "Planning an event" },
  { value: "vendor", label: "Vendors" },
] as const;

type Audience = (typeof AUDIENCES)[number]["value"];

const SUGGESTIONS = ["quote expired", "cancel booking", "payment", "contact details", "confirm booking"];

export function HelpSearch({ docs, defaultAudience = "all" }: { docs: SearchDoc[]; defaultAudience?: Audience }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState<Audience>(defaultAudience);
  const results = useMemo(
    () => searchHelp(docs, query, audience === "all" ? undefined : audience),
    [docs, query, audience],
  );
  const searching = query.trim().length > 0;

  return (
    <div role="search" className="w-full">
      <label htmlFor={`${id}-q`} className="sr-only">
        Search help articles
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for help — e.g. “cancel a booking”"
          autoComplete="off"
          enterKeyHint="search"
          aria-controls={`${id}-results`}
          className="h-14 w-full rounded-2xl border border-input bg-background pr-12 pl-12 text-[17px] shadow-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden dark:bg-input/30"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-5" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Show articles for">
        {AUDIENCES.map((a) => (
          <button
            key={a.value}
            type="button"
            aria-pressed={audience === a.value}
            onClick={() => setAudience(a.value)}
            className={cn(
              "min-h-9 rounded-full px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              audience === a.value ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-muted",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div id={`${id}-results`}>
        <p className="sr-only" aria-live="polite">
          {searching ? `${results.length} ${results.length === 1 ? "article" : "articles"} found` : ""}
        </p>
        {searching ? (
          results.length > 0 ? (
            <ul className="mt-5 overflow-hidden rounded-2xl bg-secondary">
              {results.map((r, i) => (
                <li key={r.slug} className={i < results.length - 1 ? "border-b border-border/60" : ""}>
                  <Link href={`/help/articles/${r.slug}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{r.title}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{r.summary}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-5 rounded-2xl bg-secondary px-4 py-6 text-center text-[15px] text-muted-foreground">
              <p className="font-medium text-foreground">No articles match “{query.trim()}”.</p>
              <p className="mt-1">
                Try a shorter word, or email{" "}
                <a href="mailto:hello@evntlyapp.com" className="font-medium text-foreground underline underline-offset-2">
                  hello@evntlyapp.com
                </a>
                .
              </p>
            </div>
          )
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Popular:{" "}
            {SUGGESTIONS.map((s, i) => (
              <span key={s}>
                <button
                  type="button"
                  onClick={() => setQuery(s)}
                  className="font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:underline"
                >
                  {s}
                </button>
                {i < SUGGESTIONS.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
