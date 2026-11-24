"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
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
    const action = swipeAction(t.clientX - start.x, t.clientY - start.y);
    if (action === "next") show((openIndex ?? 0) + 1);
    if (action === "previous") show((openIndex ?? 0) - 1);
    if (action === "close") setOpenIndex(null);
  }

  return (
    <>
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
                className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-20 bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-md hover:bg-white/25 hover:text-white"
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
              className="absolute left-[max(0.5rem,env(safe-area-inset-left))] z-10 flex size-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-white/15 sm:left-4"
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
              className="absolute right-[max(0.5rem,env(safe-area-inset-right))] z-10 flex size-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-white/15 sm:right-4"
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
