"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addPortfolioItem, deletePortfolioItem } from "@/lib/actions/portfolio";
import { createClient } from "@/lib/supabase/client";
import {
  PORTFOLIO_ACCEPT,
  PORTFOLIO_BUCKET,
  portfolioFileError,
  portfolioPath,
} from "@/lib/portfolio-media";
import type { PublicPortfolioItem } from "@/lib/public-columns";

type PortfolioItem = PublicPortfolioItem;

export function PortfolioUploader({
  providerId,
  userId,
  items,
}: {
  providerId: string;
  userId: string;
  items: PortfolioItem[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  // Choosing files starts the upload: on phones a separate "Upload" button
  // after the picker was easy to miss, and nothing looked like it happened.
  function uploadFiles(files: File[]) {
    if (!files.length) return;
    setError(null);
    setAdded(null);
    startTransition(async () => {
      let ok = 0;
      const failures: string[] = [];
      for (const [i, file] of files.entries()) {
        setProgress({ done: i, total: files.length });
        const fileError = portfolioFileError(file);
        if (fileError) {
          failures.push(`${file.name}: ${fileError}`);
          continue;
        }
        // Straight to storage: server actions can't take bodies over 1 MB.
        const path = portfolioPath(userId, providerId, file.type);
        const { error: uploadError } = await createClient()
          .storage.from(PORTFOLIO_BUCKET)
          .upload(path, file, { contentType: file.type });
        if (uploadError) {
          failures.push(`${file.name}: couldn't upload (${uploadError.message}). Check your connection and try again.`);
          continue;
        }
        const res = await addPortfolioItem(providerId, { path, type: file.type, caption });
        if (res?.error) failures.push(`${file.name}: ${res.error}`);
        else ok++;
      }
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
      if (ok) {
        setCaption("");
        setAdded(ok);
        router.refresh();
      }
      if (failures.length) setError(failures.join(" "));
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deletePortfolioItem(id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-dashed border-border p-4">
        <input
          ref={fileRef}
          type="file"
          accept={PORTFOLIO_ACCEPT}
          multiple
          className="sr-only"
          aria-label="Choose photos or videos"
          onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))}
        />
        <Input
          placeholder="Caption for these photos (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          disabled={pending}
        />
        <Button size="lg" className="w-full" disabled={pending} onClick={() => fileRef.current?.click()}>
          <ImagePlus />{" "}
          {progress ? `Uploading ${progress.done + 1} of ${progress.total}…` : pending ? "Uploading…" : "Add photos or videos"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Choose one or more from your phone or computer. Photos up to 10 MB, short clips (MP4, MOV, WEBM) up to 50 MB.
        </p>
      </div>
      <div aria-live="polite">
        {added !== null && (
          <p className="mb-4 flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden /> {added === 1 ? "Photo added." : `${added} photos added.`}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <Plus className="mr-1 inline h-4 w-4" /> Add your first photo or video clip above.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="group relative aspect-square overflow-hidden rounded-xl">
              {item.media_type === "video" ? (
                <video
                  src={item.media_url}
                  muted
                  playsInline
                  preload="metadata"
                  controls
                  className="h-full w-full bg-black object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.media_url} alt={item.caption ?? ""} className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={pending}
                className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
