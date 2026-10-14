"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { blockUser, unblockUser } from "@/lib/actions/blocks";

export function BlockUserButton({
  name,
  conversationId,
  quoteId,
}: {
  name: string;
  conversationId?: string;
  quoteId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await blockUser({ conversationId, quoteId });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setBlocked(true);
      setOpen(false);
      router.refresh();
    });
  }

  if (blocked) {
    return (
      <span className="text-xs font-medium text-muted-foreground">Blocked</span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
          >
            <Ban className="size-3.5" /> Block
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block {name}?</DialogTitle>
          <DialogDescription>
            They won&apos;t be able to message you, request quotes, or apply to
            your events, and you won&apos;t be able to contact them either. They
            aren&apos;t notified. You can unblock them any time from Profile →
            Blocked people.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            Block
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UnblockButton({
  blockId,
  conversationId,
}: {
  blockId?: string;
  conversationId?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await unblockUser({ blockId, conversationId });
            if (res?.error) setError(res.error);
            else router.refresh();
          })
        }
      >
        Unblock
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
