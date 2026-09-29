"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadPortfolioItem, deletePortfolioItem } from "@/lib/actions/portfolio";
import type { Database } from "@/lib/supabase/database.types";

type PortfolioItem = Database["public"]["Tables"]["portfolio_items"]["Row"];

export function PortfolioUploader({
  providerId,
  items,
}: {
  providerId: string;
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
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("caption", caption);
    startTransition(async () => {
      const res = await uploadPortfolioItem(providerId, formData);
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
        <Input ref={fileRef} type="file" accept="image/*" className="flex-1" />
        <Input
          placeholder="Caption (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="sm:w-48"
        />
        <Button disabled={pending} onClick={upload}>
          <Upload /> Upload
        </Button>
      </div>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <Plus className="mr-1 inline h-4 w-4" /> Add your first portfolio photo above.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="group relative aspect-square overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.media_url} alt={item.caption ?? ""} className="h-full w-full object-cover" />
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
