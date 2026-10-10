"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categoryLabel, categoryIcon } from "@/lib/config";
import { requestQuotesForEvent } from "@/lib/actions/event-vendors";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type Vendor = Database["public"]["Tables"]["service_providers"]["Row"];

export function VendorSelectionGrid({ eventId, vendors }: { eventId: string; vendors: Vendor[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function requestSelected() {
    setError(null);
    startTransition(async () => {
      const res = await requestQuotesForEvent(eventId, [...selected]);
      if (res?.error) setError(res.error);
      else router.push(`/dashboard/events/${eventId}`);
    });
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {vendors.map((vendor) => {
          const isSelected = selected.has(vendor.id);
          const CategoryIcon = categoryIcon(vendor.service_type);
          return (
            <button
              type="button"
              key={vendor.id}
              onClick={() => toggle(vendor.id)}
              className={cn(
                "rounded-xl border-2 p-3 text-left transition-colors",
                isSelected ? "border-primary bg-primary/5" : "border-border"
              )}
            >
              <div className="relative mb-2 aspect-square overflow-hidden rounded-lg bg-muted">
                {vendor.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={vendor.avatar_url}
                    alt={vendor.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                    <CategoryIcon className="size-8 text-primary" />
                  </div>
                )}
                {isSelected && (
                  <div className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3.5" />
                  </div>
                )}
              </div>
              <p className="truncate text-sm font-semibold">{vendor.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {categoryLabel(vendor.service_type)}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs font-semibold">${vendor.hourly_rate}/hr</span>
                {!!vendor.rating && vendor.rating > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Star className="size-3 fill-foreground text-foreground" />
                    {vendor.rating.toFixed(1)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button disabled={selected.size === 0 || pending} onClick={requestSelected}>
          {pending ? "Sending…" : `Request quotes from ${selected.size} selected`}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => router.push(`/dashboard/events/${eventId}`)}
        >
          Skip for now
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
