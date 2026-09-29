"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitReview } from "@/lib/actions/reviews";
import { cn } from "@/lib/utils";

export function LeaveReview({
  providerId,
  bookingId,
  eventType,
}: {
  providerId: string;
  bookingId: string;
  eventType: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitReview(providerId, bookingId, eventType, rating, comment);
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Leave a review</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How was it?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)}>
                <Star
                  className={cn(
                    "h-8 w-8",
                    n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                  )}
                />
              </button>
            ))}
          </div>
          <Textarea
            rows={4}
            placeholder="Tell others about your experience…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={pending} onClick={submit}>
            {pending ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
