"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { bookBundle } from "@/lib/actions/bundles";

export function BookBundleForm({
  isAuthenticated,
  packageId,
}: {
  isAuthenticated: boolean;
  packageId: string;
}) {
  const [open, setOpen] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventAddress, setEventAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <Button
        size="lg"
        className="w-full"
        nativeButton={false}
        render={<Link href={`/signup?next=/bundles/${packageId}`}>Sign up to book this bundle</Link>}
      />
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await bookBundle(packageId, { eventDate, eventTime, eventAddress, notes });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" className="w-full">Book this bundle</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book this bundle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bb-date">Event date</Label>
              <Input
                id="bb-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bb-time">Event time (optional)</Label>
              <Input
                id="bb-time"
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bb-address">Venue address</Label>
            <Input
              id="bb-address"
              value={eventAddress}
              onChange={(e) => setEventAddress(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bb-notes">Notes (optional)</Label>
            <Textarea id="bb-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={pending || !eventDate || !eventAddress}
            onClick={submit}
          >
            {pending ? "Booking…" : "Confirm booking"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
