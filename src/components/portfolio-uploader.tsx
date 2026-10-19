"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload } from "lucide-react";
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

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fileError = portfolioFileError(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setError(null);
    startTransition(async () => {
      // Straight to storage: server actions can't take bodies over 1 MB.
      const path = portfolioPath(userId, providerId, file.type);
      const { error: uploadError } = await createClient()
        .storage.from(PORTFOLIO_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        setError("Couldn't upload that file. Try again.");
        return;
      }
      const res = await addPortfolioItem(providerId, { path, type: file.type, caption });
      if (res?.error) setError(res.error);
      else {
        setCaption("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
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
      <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-dashed border-border p-4 sm:flex-row sm:items-center">
        <Input ref={fileRef} type="file" accept={PORTFOLIO_ACCEPT} className="flex-1" />
        <Input
          placeholder="Caption (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="sm:w-48"
        />
        <Button disabled={pending} onClick={upload}>
          <Upload /> {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
      <p className="-mt-4 mb-6 text-xs text-muted-foreground">
        Photos up to 10 MB, or short video clips (MP4, MOV, WEBM) up to 50 MB.
      </p>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

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
