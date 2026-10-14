"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { suggestSuburbs } from "@/lib/actions/places";
import type { Place } from "@/lib/geocode";

export type SuburbValue = {
  city: string;
  latitude?: number | null;
  longitude?: number | null;
};

// Base-suburb field with autocomplete. Picking a suggestion stores its
// coordinates for the map pin; free-typed text is still accepted and the
// server geocodes it on save. Editing the text drops stale coordinates.
export function SuburbPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: SuburbValue;
  onChange: (value: SuburbValue) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState(value.city);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const results = await suggestSuburbs(q).catch(() => []);
      // Ignore responses that arrive after a newer keystroke.
      if (id !== requestId.current) return;
      setSuggestions(results);
      setActive(results.length ? 0 : -1);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  function pick(place: Place) {
    setQuery(place.label);
    setOpen(false);
    setSuggestions([]);
    onChange({
      city: place.label,
      latitude: place.latitude,
      longitude: place.longitude,
    });
  }

  const showList =
    open && query.trim().length >= 2 && (loading || suggestions.length > 0);
  const located = value.latitude != null && value.longitude != null;

  return (
    <div>
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `${listId}-${active}` : undefined
          }
          autoComplete="off"
          placeholder="Start typing a suburb or postcode"
          className="pl-9"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onChange({ city: e.target.value, latitude: null, longitude: null });
          }}
          onFocus={() => setOpen(true)}
          // Delay so a click on a suggestion lands before the list unmounts.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (
              e.key === "Enter" &&
              active >= 0 &&
              suggestions[active]
            ) {
              e.preventDefault();
              pick(suggestions[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {loading && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}

        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-2xl border border-border bg-popover p-1 shadow-[0_12px_32px_rgba(0,0,0,0.16)]"
          >
            {suggestions.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-muted-foreground">
                Searching…
              </li>
            ) : (
              suggestions.map((place, i) => (
                <li
                  key={place.label}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(place)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm",
                    i === active && "bg-accent",
                  )}
                >
                  <MapPin className="size-4 shrink-0 text-muted-foreground" />
                  {place.label}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {located
          ? "Customers see your approximate area on the map, never your address."
          : "Pick a suggestion so customers can find you on the map."}
      </p>
    </div>
  );
}
