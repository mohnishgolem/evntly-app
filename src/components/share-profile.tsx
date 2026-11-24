"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Crop, Download, ImageIcon, Link2, RotateCcw, Share, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSheetSide } from "@/lib/use-sheet-side";
import { copyText } from "@/components/copy-link-field";
import { canvasToFile, drawArtwork, loadArtworkFonts, loadArtworkImage } from "@/lib/share-artwork";
import {
  clampCrop,
  DEFAULT_CROP,
  MAX_ZOOM,
  panCrop,
  SHARE_FORMATS,
  shareFileName,
  shareImageUrl,
  shareProfileUrl,
  STORY_STICKER_ZONE,
  type ShareCrop,
  type SharePreparedAction,
  type ShareFormat,
  type SharePhoto,
} from "@/lib/share-profile";
import { cn } from "@/lib/utils";
import { analyticsVisitorId, sendTrack } from "@/lib/track-client";

type Props = {
  vendorId: string;
  name: string;
  category: string;
  /** Events they cover, for the line under their name. */
  events?: string[];
  founding?: boolean;
  photos: SharePhoto[];
  /** Instagram/Facebook in-app browser: no file sharing or downloads there. */
  inAppBrowser: boolean;
  /** Site origin for the links (the dashboard passes SITE_URL). */
  siteUrl: string;
  /** Signed-in phones show the app's bottom tab bar; the action bar sits above it. */
  hasTabBar?: boolean;
};

type SaveResult = "saved" | "manual" | "cancelled" | "failed";
type Outcome = { saved?: SaveResult; copied?: boolean; shared?: boolean };

// Per-browser memory of the chosen photo and crops, so coming back to Share
// profile shows the same artwork. Never sent anywhere; the listing is unchanged.
type Stored = { photo?: string | null; crops?: Record<string, ShareCrop> };
const storageKey = (vendorId: string) => `evntly_share_${vendorId}`;
function readStored(vendorId: string): Stored {
  try {
    const raw = localStorage.getItem(storageKey(vendorId));
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}
function writeStored(vendorId: string, value: Stored) {
  try {
    localStorage.setItem(storageKey(vendorId), JSON.stringify(value));
  } catch {
    // Private mode etc.: the edits just aren't remembered.
  }
}
const cropKey = (format: ShareFormat, url: string | null) => `${format}:${url ?? "fallback"}`;

function coarsePointer() {
  try {
    return matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export function ShareProfile({ vendorId, name, category, events, founding, photos, inAppBrowser, siteUrl, hasTabBar = true }: Props) {
  const [format, setFormat] = useState<ShareFormat>("story");
  // This browser's last choice, if that photo is still on the listing. Only
  // the canvas (drawn after mount) depends on it, so server and client markup match.
  const [stored] = useState(() => (typeof window === "undefined" ? {} : readStored(vendorId)));
  const [photoUrl, setPhotoUrl] = useState<string | null>(() =>
    stored.photo !== undefined && (stored.photo === null || photos.some((p) => p.url === stored.photo)) ? stored.photo : (photos[0]?.url ?? null)
  );
  const [crops, setCrops] = useState<Record<string, ShareCrop>>(() =>
    Object.fromEntries(Object.entries(stored.crops ?? {}).map(([k, c]) => [k, clampCrop(c)]))
  );
  const [loaded, setLoaded] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [picker, setPicker] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [outcome, setOutcome] = useState<Record<ShareFormat, Outcome>>({ story: {}, card: {} });
  const [manualImage, setManualImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<{ key: string; file: File } | null>(null);
  const filePromise = useRef<Promise<File> | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const sheetSide = useSheetSide();
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(88);

  // Reserve room under the page for the pinned action bar (phones only).
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight + 8));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const storyUrl = shareProfileUrl(vendorId, "share_story", siteUrl);
  const linkUrl = shareProfileUrl(vendorId, "share_link", siteUrl);
  const qrUrl = shareProfileUrl(vendorId, "share_qr", siteUrl);
  const crop = crops[cropKey(format, photoUrl)] ?? DEFAULT_CROP;
  const spec = SHARE_FORMATS[format];

  useEffect(() => {
    void loadArtworkFonts().then(() => setFontsReady(true));
    // The Evntly app icon for the QR code's centre (same origin).
    loadArtworkImage("/icons/icon-512.png").then(setLogo, () => {});
  }, []);

  useEffect(() => {
    writeStored(vendorId, { photo: photoUrl, crops });
  }, [vendorId, photoUrl, crops]);

  // Load the chosen photo (a resized copy, else the original).
  useEffect(() => {
    if (!photoUrl) return;
    let cancelled = false;
    loadArtworkImage(shareImageUrl(photoUrl, 2000))
      .catch(() => loadArtworkImage(photoUrl))
      .then(
        (i) => !cancelled && setLoaded({ url: photoUrl, img: i }),
        () => !cancelled && setFailedUrl(photoUrl)
      );
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  const img = photoUrl && loaded?.url === photoUrl ? loaded.img : null;
  const imgState: "loading" | "ready" | "failed" = !photoUrl || img ? "ready" : failedUrl === photoUrl ? "failed" : "loading";

  const artKey = `${format}|${photoUrl}|${crop.zoom}|${crop.fx}|${crop.fy}|${fontsReady}|${imgState}|${!!logo}`;

  // Draw, then prepare the file in the background so Save can hand it to the
  // share sheet straight from the tap (iOS wants that within the gesture).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || imgState === "loading") return;
    drawArtwork(canvas, format, img, crop, { name, category, events, founding, qrUrl: format === "card" ? qrUrl : undefined, logo });
    fileRef.current = null;
    const key = artKey;
    const t = setTimeout(() => {
      const p = canvasToFile(canvas, shareFileName(name, format));
      filePromise.current = p;
      p.then((file) => {
        if (filePromise.current === p) fileRef.current = { key, file };
      }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artKey, img, name, category, events, founding, qrUrl, logo]);

  const getFile = useCallback(async () => {
    if (fileRef.current?.key === artKey) return fileRef.current.file;
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("no_canvas");
    return canvasToFile(canvas, shareFileName(name, format));
  }, [artKey, name, format]);

  function setCrop(next: ShareCrop) {
    setCrops((c) => ({ ...c, [cropKey(format, photoUrl)]: clampCrop(next) }));
  }

  // --- photo crop: drag to move, pinch to zoom (as in Photos) ---------------
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!adjusting || !img) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety (keeps the drag when the finger leaves the preview).
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = pointers.current.size === 2 ? { dist: distance(), zoom: crop.zoom } : null;
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const last = pointers.current.get(e.pointerId);
    if (!last || !img) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const d = distance();
      if (pinch.current.dist > 0) setCrop({ ...crop, zoom: (pinch.current.zoom * d) / pinch.current.dist });
      return;
    }
    if (pointers.current.size !== 1) return;
    const scale = spec.width / e.currentTarget.getBoundingClientRect().width; // CSS px → artwork px
    const dx = (e.clientX - last.x) * scale;
    const dy = (e.clientY - last.y) * scale;
    setCrop(panCrop(crop, dx, dy, img.width, img.height, spec.photo.w, spec.photo.h));
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  // --- actions --------------------------------------------------------------
  async function saveFile(): Promise<SaveResult> {
    let file: File;
    try {
      file = await getFile();
    } catch {
      return "failed";
    }
    // Instagram's and Facebook's own browsers can't download or share files:
    // show the image so it can be saved with a long-press.
    if (inAppBrowser) {
      setManualImage(URL.createObjectURL(file));
      return "manual";
    }
    if (coarsePointer() && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return "saved";
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
        // Not allowed here (e.g. the tap's permission ran out): download instead.
      }
    }
    try {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return "saved";
    } catch {
      setManualImage(URL.createObjectURL(file));
      return "manual";
    }
  }

  // Counts a share the vendor got ready (saved, copied, shared). That's intent
  // only: nothing here can tell whether they went on to post it.
  function trackPrepared(f: ShareFormat, next: Outcome) {
    if (!analyticsVisitorId()) return; // Do Not Track / Global Privacy Control
    const actions: SharePreparedAction[] = [];
    const saved = next.saved === "saved" || next.saved === "manual";
    if (f === "story") {
      if (saved) actions.push("story_save");
      if (next.copied) actions.push("story_copy");
    } else {
      if (saved) actions.push("card_save");
      if (next.copied) actions.push("card_copy");
      if (next.shared) actions.push("card_share");
    }
    for (const action of actions) sendTrack({ share: { action, vendorId } });
  }

  async function run(f: ShareFormat, fn: () => Promise<Outcome>) {
    setBusy(true);
    try {
      const next = await fn();
      setOutcome((o) => ({ ...o, [f]: { ...o[f], ...next } }));
      trackPrepared(f, next);
    } finally {
      setBusy(false);
    }
  }

  // Copy first: it must happen inside the tap, before the share sheet opens.
  const saveStoryAndCopy = () =>
    run("story", async () => {
      const copied = await copyText(storyUrl);
      const saved = await saveFile();
      return { copied, saved };
    });
  const saveOnly = () => run(format, async () => ({ saved: await saveFile() }));
  const copyOnly = () => run(format, async () => ({ copied: await copyText(format === "story" ? storyUrl : linkUrl) }));

  const shareCard = () =>
    run("card", async () => {
      if (inAppBrowser || !navigator.share) return { copied: await copyText(linkUrl) };
      try {
        const file = await getFile();
        const text = `${name} on Evntly — view my profile & request a quote: ${linkUrl}`;
        if (navigator.canShare?.({ files: [file], text })) await navigator.share({ files: [file], text });
        else await navigator.share({ title: `${name} on Evntly`, text: `${name} on Evntly`, url: linkUrl });
        return { shared: true };
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return {};
        return { copied: await copyText(linkUrl) };
      }
    });

  const current = outcome[format];
  const loading = imgState === "loading";
  const primary =
    format === "story" ? (
      <Button size="lg" className="w-full" disabled={busy || loading} onClick={saveStoryAndCopy}>
        <Download className="size-4" aria-hidden /> Save Story &amp; Copy Link
      </Button>
    ) : (
      <Button size="lg" className="w-full" disabled={busy || loading} onClick={shareCard}>
        <Share className="size-4" aria-hidden /> Share
      </Button>
    );
  const note = (
    <OutcomeNote format={format} outcome={current} onRetrySave={saveOnly} onRetryCopy={copyOnly} link={format === "story" ? storyUrl : linkUrl} />
  );
  const selected = photos.find((p) => p.url === photoUrl);

  return (
    <div className="mx-auto max-w-md">
      {/* A segmented control (Apple HIG): 44 pt tall, the selected segment raised. */}
      <Tabs
        value={format}
        onValueChange={(v) => {
          setFormat(v as ShareFormat);
          setAdjusting(false);
        }}
        className="mb-4"
      >
        <TabsList aria-label="Share format" className="h-12! w-full rounded-xl p-0.5">
          <TabsTrigger value="story" className={SEGMENT_CLASS}>
            Story
          </TabsTrigger>
          <TabsTrigger value="card" className={SEGMENT_CLASS}>
            Profile card
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div
        className="relative mx-auto overflow-hidden rounded-2xl border border-border bg-black shadow-sm"
        // Keep the actions in view on a phone: the preview is at most ~58% of the screen height.
        style={{ aspectRatio: `${spec.width} / ${spec.height}`, width: `min(100%, ${format === "story" ? 340 : 400}px, calc(50dvh * ${spec.width / spec.height}))` }}
      >
        <canvas
          ref={canvasRef}
          width={spec.width}
          height={spec.height}
          data-testid="share-canvas"
          aria-label={`${format === "story" ? "Story" : "Profile card"} preview for ${name}`}
          role="img"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn("block h-full w-full", adjusting && "cursor-grab touch-none active:cursor-grabbing")}
        />
        {format === "story" && !adjusting && (
          // A guide only — never part of the exported image.
          <div
            aria-hidden
            className="pointer-events-none absolute flex items-center justify-center rounded-xl border-2 border-dashed border-white/70 text-[11px] font-semibold text-white/90"
            style={{
              left: `${(STORY_STICKER_ZONE.x / 1080) * 100}%`,
              top: `${(STORY_STICKER_ZONE.y / 1920) * 100}%`,
              width: `${(STORY_STICKER_ZONE.w / 1080) * 100}%`,
              height: `${(STORY_STICKER_ZONE.h / 1920) * 100}%`,
            }}
          >
            Link sticker goes here
          </div>
        )}
        {loading && <div className="absolute inset-0 bg-muted motion-safe:animate-pulse" role="progressbar" aria-label="Loading photo" />}
        {adjusting && (
          <p className="pointer-events-none absolute inset-x-0 top-2 text-center text-xs font-semibold text-white drop-shadow">Drag to move · Pinch to zoom</p>
        )}
      </div>

      {imgState === "failed" && (
        <p role="alert" className="mt-2 text-center text-sm text-destructive">
          That photo couldn&apos;t be loaded. Choose another one.
        </p>
      )}

      {adjusting ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-border p-3">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <ZoomOut className="size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Zoom</span>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={crop.zoom}
              onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })}
              className="h-11 flex-1 accent-primary"
            />
            <ZoomIn className="size-4 text-muted-foreground" aria-hidden />
          </label>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setCrop(DEFAULT_CROP)}>
              <RotateCcw className="size-4" aria-hidden /> Reset
            </Button>
            <Button size="lg" className="flex-1" onClick={() => setAdjusting(false)}>
              <Check className="size-4" aria-hidden /> Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" size="lg" onClick={() => setPicker(true)}>
            <ImageIcon className="size-4" aria-hidden /> Change photo
          </Button>
          {img && (
            <Button variant="ghost" size="lg" onClick={() => setAdjusting(true)}>
              <Crop className="size-4" aria-hidden /> Adjust crop
            </Button>
          )}
        </div>
      )}

      {/* One prominent action per tab; the alternatives sit underneath as
          secondary buttons. On phones the main action is pinned above the tab
          bar so it's always in reach, with the result and next step above it. */}
      <div className="mt-5 space-y-2">
        <div className="hidden md:block">{primary}</div>
        <div className="grid grid-cols-2 gap-2">
          {format === "story" ? (
            <>
              <Button variant="outline" size="lg" disabled={busy || loading} onClick={saveOnly}>
                <Download className="size-4" aria-hidden /> Save Story
              </Button>
              <Button variant="outline" size="lg" disabled={busy} onClick={copyOnly}>
                <Link2 className="size-4" aria-hidden /> Copy link
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="lg" disabled={busy} onClick={copyOnly}>
                <Copy className="size-4" aria-hidden /> Copy link
              </Button>
              <Button variant="outline" size="lg" disabled={busy || loading} onClick={saveOnly}>
                <Download className="size-4" aria-hidden /> Save image
              </Button>
            </>
          )}
        </div>
        {format === "card" && <p className="text-center text-xs text-muted-foreground">The QR code opens your Evntly profile, where customers can request a quote.</p>}
        <div className="hidden md:block">{note}</div>
      </div>

      <div aria-hidden className="md:hidden" style={{ height: barHeight }} />
      <div
        ref={barRef}
        data-testid="share-action-bar"
        className={cn(
          "glass-material fixed inset-x-0 z-30 m-0 space-y-2 border-t border-border/60 px-4 pt-3 md:hidden",
          hasTabBar ? "bottom-[var(--tabbar-height)] pb-3" : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        )}
      >
        <div className="mx-auto max-w-md space-y-2">
          {note}
          {primary}
        </div>
      </div>

      {/* Phones get a bottom sheet (as iOS presents pickers); wider screens a side panel. */}
      <Sheet open={picker} onOpenChange={setPicker}>
        <SheetContent side={sheetSide} className={SHEET_CLASS}>
          <Grabber side={sheetSide} />
          <SheetHeader className="px-0">
            <SheetTitle>Choose a photo</SheetTitle>
            <SheetDescription>Only this share image changes — your listing stays the same.</SheetDescription>
          </SheetHeader>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add portfolio photos to your listing to use one here. Until then, the Evntly design is used.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <button
                  key={p.url}
                  type="button"
                  aria-pressed={p.url === photoUrl}
                  aria-label={p.kind === "avatar" ? "Profile photo" : "Portfolio photo"}
                  onClick={() => {
                    setPhotoUrl(p.url);
                    setPicker(false);
                    setAdjusting(true);
                  }}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-xl border-2 bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    p.url === photoUrl ? "border-primary" : "border-transparent"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- storage thumbnails, sized by Supabase */}
                  <img src={shareImageUrl(p.url, 300)} alt="" className="h-full w-full object-cover" />
                  {p.url === photoUrl && (
                    <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-4" aria-hidden />
                    </span>
                  )}
                  {p.kind === "avatar" && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[11px] font-medium text-white">Profile photo</span>}
                </button>
              ))}
            </div>
          )}
          {selected && <p className="text-xs text-muted-foreground">After choosing, drag or pinch the preview to adjust the crop for this format.</p>}
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!manualImage}
        onOpenChange={(o) => {
          if (!o && manualImage) {
            URL.revokeObjectURL(manualImage);
            setManualImage(null);
          }
        }}
      >
        <SheetContent side={sheetSide} className={SHEET_CLASS}>
          <Grabber side={sheetSide} />
          <SheetHeader className="px-0">
            <SheetTitle>Save your image</SheetTitle>
            <SheetDescription>Press and hold the image, then choose Save to Photos. If that isn&apos;t offered, open this page in Safari or Chrome.</SheetDescription>
          </SheetHeader>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local blob of the exported artwork */}
          {manualImage && <img src={manualImage} alt={`${name} share image`} className="mx-auto max-h-[60dvh] w-auto rounded-xl" />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// iOS dark mode raises the selected segment with a lighter grey, not a border.
const SEGMENT_CLASS = "h-full rounded-[10px] text-[15px] font-semibold dark:data-active:border-transparent dark:data-active:bg-white/20";

/** The grabber iOS shows at the top of a bottom sheet. */
function Grabber({ side }: { side: "bottom" | "right" }) {
  return side === "bottom" ? <div aria-hidden className="mx-auto -mb-2 h-1.5 w-9 shrink-0 rounded-full bg-muted-foreground/30" /> : null;
}

const SHEET_CLASS =
  "max-h-[90dvh] overflow-y-auto rounded-t-3xl px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-h-dvh sm:max-w-md sm:rounded-none";

/** The one thing to do after saving the Story. */
export const STORY_STICKER_INSTRUCTION = "Add a link sticker in Instagram and label it ‘Check availability’.";

function OutcomeNote({
  format,
  outcome,
  onRetrySave,
  onRetryCopy,
  link,
}: {
  format: ShareFormat;
  outcome: Outcome;
  onRetrySave: () => void;
  onRetryCopy: () => void;
  link: string;
}) {
  const { saved, copied, shared } = outcome;
  if (saved === undefined && copied === undefined && !shared) return null;
  const what = format === "story" ? "Story" : "Image";
  const savedOk = saved === "saved" || saved === "manual";
  const done = [
    shared && "Shared",
    saved === "saved" && `${what} saved`,
    saved === "manual" && `${what} ready to save`,
    copied && "Link copied",
  ].filter(Boolean) as string[];
  return (
    <div role="status" className="space-y-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
      {done.length > 0 && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Check className="size-4 shrink-0 text-success-text" aria-hidden />
          {done.join(" · ")}
        </p>
      )}
      {format === "story" && (savedOk || copied) && <p className="text-[15px] font-semibold">{STORY_STICKER_INSTRUCTION}</p>}
      {saved !== undefined && !savedOk && (
        <p className="flex items-center gap-2">
          <X className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="flex-1">{saved === "cancelled" ? `${what} not saved` : `Couldn't save the ${what.toLowerCase()}`}</span>
          <Button variant="outline" className="min-h-11 px-4" onClick={onRetrySave}>
            Try again
          </Button>
        </p>
      )}
      {copied === false && (
        <>
          <p className="flex items-center gap-2">
            <X className="size-4 shrink-0 text-destructive" aria-hidden />
            <span className="flex-1">Couldn&apos;t copy the link</span>
            <Button variant="outline" className="min-h-11 px-4" onClick={onRetryCopy}>
              Try again
            </Button>
          </p>
          <input
            readOnly
            value={link}
            aria-label="Your profile link"
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 w-full rounded-lg border border-border bg-muted/40 px-3 text-base"
          />
        </>
      )}
    </div>
  );
}
