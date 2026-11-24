"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Images, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PublicPortfolioItem } from "@/lib/public-columns";

type PortfolioItem = PublicPortfolioItem;

// Horizontal drag past this many px (and more horizontal than vertical)
// counts as a swipe rather than a scroll/tap.
const SWIPE_THRESHOLD = 50;
// Dragging down this far (mostly vertically) closes the viewer, as in the
// iOS Photos app.
const DISMISS_THRESHOLD = 80;

/** What a finished touch drag does in the viewer. */
export function swipeAction(dx: number, dy: number): "next" | "previous" | "close" | null {
  if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "next" : "previous";
  if (dy > DISMISS_THRESHOLD && dy > Math.abs(dx)) return "close";
  return null;
}

export function PortfolioGallery({
  items,
  vendorName,
  layout = "grid",
}: {
  items: PortfolioItem[];
  vendorName: string;
  /** "hero": the profile's opening gallery (mosaic on desktop, swipeable on phones). */
  layout?: "grid" | "hero";
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
    const action = swipeAction(t.clientX - start.x, t.clientY - start.y);
    if (action === "next") show((openIndex ?? 0) + 1);
    if (action === "previous") show((openIndex ?? 0) - 1);
    if (action === "close") setOpenIndex(null);
  }

  return (
    <>
      {layout === "hero" ? (
        <HeroGallery items={items} vendorName={vendorName} onOpen={setOpenIndex} />
      ) : (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            aria-label={item.media_type === "video" ? `Play video${item.caption ? `: ${item.caption}` : ""}` : undefined}
            className="relative aspect-square overflow-hidden rounded-xl transition-opacity hover:opacity-90"
          >
            {item.media_type === "video" ? (
              <>
                {/* First frame as the tile; "#t=0.1" makes Safari paint it. */}
                <video
                  src={`${item.media_url}#t=0.1`}
                  muted
                  playsInline
                  preload="metadata"
                  className="pointer-events-none h-full w-full bg-black object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-black/60 text-white">
                    <Play className="size-5 translate-x-0.5 fill-current" />
                  </span>
                </span>
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnail_url ?? item.media_url}
                alt={item.caption ?? vendorName}
                className="h-full w-full object-cover"
              />
            )}
          </button>
        ))}
      </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && setOpenIndex(null)}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center gap-0 rounded-none bg-black/95 px-4 pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(3.5rem,calc(env(safe-area-inset-bottom)+3rem))] ring-0 sm:max-w-none"
          // Tapping the dark area around the photo closes the viewer.
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenIndex(null);
          }}
        >
          <DialogClose
            render={
              // Clear of the notch / Dynamic Island and the status bar (the app
              // draws edge to edge), 44px, and on a frosted disc so it shows
              // over bright photos too.
              <Button
                variant="ghost"
                size="icon-lg"
                className="frost absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-20 text-white ring-1 ring-white/20 [--frost-bg:rgb(255_255_255/0.15)] hover:bg-transparent hover:text-white hover:[--frost-bg:rgb(255_255_255/0.25)]"
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
              aria-label="Previous"
              className="frost absolute left-[max(0.5rem,env(safe-area-inset-left))] z-10 flex size-11 items-center justify-center rounded-full text-white [--frost-bg:rgb(0_0_0/0.3)] [--frost-blur:6px] hover:[--frost-bg:rgb(255_255_255/0.15)] sm:left-4"
            >
              <ChevronLeft className="size-7" />
            </button>
          )}

          {current && (
            <div
              className="flex h-full max-h-full max-w-full items-center justify-center"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpenIndex(null);
              }}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {current.media_type === "video" ? (
                <video
                  key={current.id}
                  src={current.media_url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-full max-w-full rounded-lg"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={current.id}
                  src={current.media_url}
                  alt={current.caption ?? vendorName}
                  className="max-h-full max-w-full rounded-lg object-contain select-none"
                  draggable={false}
                />
              )}
            </div>
          )}

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => show((openIndex ?? 0) + 1)}
              aria-label="Next"
              className="frost absolute right-[max(0.5rem,env(safe-area-inset-right))] z-10 flex size-11 items-center justify-center rounded-full text-white [--frost-bg:rgb(0_0_0/0.3)] [--frost-blur:6px] hover:[--frost-bg:rgb(255_255_255/0.15)] sm:right-4"
            >
              <ChevronRight className="size-7" />
            </button>
          )}

          {items.length > 1 && (
            <div className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-sm font-medium text-white/80">
              {(openIndex ?? 0) + 1} / {items.length}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Thumb({ item, vendorName, eager = false, className }: { item: PortfolioItem; vendorName: string; eager?: boolean; className?: string }) {
  return item.media_type === "video" ? (
    <>
      {/* First frame as the tile; "#t=0.1" makes Safari paint it. */}
      <video src={`${item.media_url}#t=0.1`} muted playsInline preload="metadata" className={cn("pointer-events-none h-full w-full bg-black object-cover", className)} />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white">
          <Play className="size-5 translate-x-0.5 fill-current" />
        </span>
      </span>
    </>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.thumbnail_url ?? item.media_url}
      alt={item.caption ?? vendorName}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("h-full w-full object-cover transition-transform duration-500 ease-standard", className)}
    />
  );
}

// The profile opens with the work. Desktop: one large photo and up to four
// smaller ones in a rounded mosaic. Phones: full-width swipeable photos with
// a counter. Either way "Show all" opens the same full-screen viewer.
function HeroGallery({ items, vendorName, onOpen }: { items: PortfolioItem[]; vendorName: string; onOpen: (i: number) => void }) {
  const [slide, setSlide] = useState(0);
  // 5+: one large + four; 3-4: one large + two stacked; 2: halves; 1: full.
  const n = items.length >= 5 ? 5 : items.length >= 3 ? 3 : items.length;
  const mosaic = items.slice(0, n);
  const cols = n === 5 ? "md:grid-cols-4" : n === 3 ? "md:grid-cols-3" : n === 2 ? "md:grid-cols-2" : "md:grid-cols-1";
  return (
    <div className="relative">
      {/* Phones */}
      <div
        className="rail -mx-4 auto-cols-[100%] md:hidden"
        onScroll={(e) => {
          const el = e.currentTarget;
          setSlide(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {items.map((item, i) => (
          <button key={item.id} type="button" onClick={() => onOpen(i)} aria-label={`Open photo ${i + 1} of ${items.length}`} className="relative aspect-[4/3] overflow-hidden bg-muted">
            <Thumb item={item} vendorName={vendorName} eager={i === 0} />
          </button>
        ))}
      </div>
      {items.length > 1 && (
        <span aria-hidden className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white tabular-nums md:hidden">
          {slide + 1} / {items.length}
        </span>
      )}

      {/* Desktop */}
      <div className={cn("hidden h-[26rem] gap-2 overflow-hidden rounded-card shadow-[var(--shadow-surface)] md:grid md:grid-rows-2", cols)}>
        {mosaic.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`Open photo ${i + 1} of ${items.length}`}
            className={cn(
              "group relative overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              i === 0 && n >= 3 ? "col-span-2 row-span-2" : n <= 2 ? "row-span-2" : ""
            )}
          >
            <Thumb item={item} vendorName={vendorName} eager={i === 0} className="group-hover:scale-[1.02]" />
          </button>
        ))}
      </div>
      {items.length > 1 && (
        <button
          type="button"
          onClick={() => onOpen(0)}
          className="btn-raised absolute right-4 bottom-4 hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold md:flex"
        >
          <Images className="size-4" aria-hidden /> Show all {items.length} photos
        </button>
      )}
    </div>
  );
}
