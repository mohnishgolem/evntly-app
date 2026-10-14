"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resetCalendarFeed } from "@/lib/actions/calendar-feed";

// One private .ics subscription link serves every calendar app: Apple
// Calendar via webcal://, Google via its "add by URL" page, anything else by
// pasting the link.
export function CalendarSync({ feedUrl }: { feedUrl: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  }

  function reset() {
    setError(null);
    startTransition(async () => {
      const res = await resetCalendarFeed();
      if (res?.error) setError(res.error);
      setResetOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border p-4">
      <p className="text-sm font-semibold">Sync to your calendar</p>
      <p className="mb-3 text-xs text-muted-foreground">
        See your Evntly bookings in Apple, Google or Outlook Calendar. Bookings awaiting your
        confirmation show as tentative; cancelled ones disappear.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" nativeButton={false} render={<a href={webcalUrl}>Apple Calendar</a>} />
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={
            <a href={googleUrl} target="_blank" rel="noreferrer">
              Google Calendar
            </a>
          }
        />
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
        </Button>
      </div>

      <input
        readOnly
        value={feedUrl}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Calendar subscription link"
        className="mt-3 w-full truncate rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-mono text-xs text-muted-foreground"
      />

      <p className="mt-2 text-xs text-muted-foreground">
        Google refreshes subscribed calendars every few hours; Apple lets you choose how often. Keep
        this link private — anyone with it can see your bookings.{" "}
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogTrigger
            render={
              <button type="button" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
                <RefreshCw className="size-3" /> Reset link
              </button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset your calendar link?</DialogTitle>
              <DialogDescription>
                Calendars subscribed to the current link will stop updating. You&apos;ll need to
                add the new link to your calendar again.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={pending} onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={pending} onClick={reset}>
                Reset link
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
