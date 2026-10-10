"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/database.types";

type PortfolioItem = Database["public"]["Tables"]["portfolio_items"]["Row"];

// Horizontal drag past this many px (and more horizontal than vertical)
// counts as a swipe rather than a scroll/tap.
const SWIPE_THRESHOLD = 50;

export function PortfolioGallery({
  items,
  vendorName,
}: {
  items: PortfolioItem[];
  vendorName: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const open = openIndex !== null;
  const current = openIndex !== null ? items[openIndex] : null;

  function show(index: number) {
    setOpenIndex(((index % items.length) + items.length) % items.length);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") show((openIndex ?? 0) - 1);
      if (e.key === "ArrowRight") show((openIndex ?? 0) + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, openIndex]);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      show((openIndex ?? 0) + (dx < 0 ? 1 : -1));
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="aspect-square overflow-hidden rounded-xl transition-opacity hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnail_url ?? item.media_url}
              alt={item.caption ?? vendorName}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(v) => !v && setOpenIndex(null)}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 flex h-screen w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center gap-0 rounded-none bg-black/95 p-4 ring-0 sm:max-w-none"
        >
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-10 text-white hover:bg-white/10 hover:text-white"
              />
            }
          >
            <X className="size-6" />
            <span className="sr-only">Close</span>
          </DialogClose>

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => show((openIndex ?? 0) - 1)}
              aria-label="Previous photo"
              className="absolute left-2 z-10 flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10 sm:left-4"
            >
              <ChevronLeft className="size-7" />
            </button>
          )}

          {current && (
            <div
              className="flex max-h-full max-w-full items-center justify-center"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={current.id}
                src={current.media_url}
                alt={current.caption ?? vendorName}
                className="max-h-[85vh] max-w-full rounded-lg object-contain select-none"
                draggable={false}
              />
            </div>
          )}

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => show((openIndex ?? 0) + 1)}
              aria-label="Next photo"
              className="absolute right-2 z-10 flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10 sm:right-4"
            >
              <ChevronRight className="size-7" />
            </button>
          )}

          {items.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm font-medium text-white/80">
              {(openIndex ?? 0) + 1} / {items.length}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
