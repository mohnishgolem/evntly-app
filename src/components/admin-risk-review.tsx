"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { markRiskReviewed } from "@/lib/actions/disputes";

export function AdminRiskReview({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <Button size="lg" variant="outline" onClick={() => setOpen(true)}>
        Mark reviewed
      </Button>
    );
  return (
    <div className="w-full space-y-2">
      <Textarea
        rows={2}
        maxLength={2000}
        aria-label="Review note"
        placeholder="What you checked and decided (e.g. warned about sharing numbers)."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          disabled={pending || !note.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await markRiskReviewed(userId, note);
              if (res?.error) setError(res.error);
              else router.refresh();
            })
          }
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />} Save review
        </Button>
        <Button size="lg" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
