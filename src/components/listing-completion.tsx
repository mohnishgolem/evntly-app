"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, PartyPopper, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestListingSetup, submitListingForReview } from "@/lib/actions/listing-completion";
import type { CompletionStep } from "@/lib/listing-completion";
import { cn } from "@/lib/utils";

export function CompletionChecklist({ steps }: { steps: CompletionStep[] }) {
  const done = steps.filter((s) => s.done).length;
  // One clear next action: the first unfinished step is highlighted and
  // jumps to where it's done on the page.
  const next = steps.find((s) => !s.done)?.key;
  return (
    <div className="rounded-2xl border border-border p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-semibold">Listing checklist</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {done} of {steps.length} done
        </p>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-1">
        {steps.map((s) => {
          const isNext = s.key === next;
          const body = (
            <>
              {s.done ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              ) : (
                <Circle className={cn("mt-0.5 size-5 shrink-0", isNext ? "text-primary" : "text-muted-foreground")} aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", s.done && "text-muted-foreground")}>{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.detail}</span>
              </span>
              {isNext && (
                <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                  Next
                </span>
              )}
              <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
            </>
          );
          return (
            <li key={s.key}>
              {!s.done && s.href ? (
                <a
                  href={s.href}
                  className={cn(
                    "-mx-2 flex min-h-11 items-start gap-3 rounded-xl px-2 py-1.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60",
                    isNext && "bg-primary/5"
                  )}
                >
                  {body}
                </a>
              ) : (
                <div className="-mx-2 flex items-start gap-3 px-2 py-1.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function SubmitForReviewButton({ providerId, remaining }: { providerId: string; remaining: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ready = remaining === null;
  return (
    <div>
      {ready && (
        <p role="status" className="mb-3 flex items-center gap-2 rounded-2xl bg-success/10 p-4 text-sm font-medium">
          <PartyPopper className="size-5 shrink-0 text-success" aria-hidden />
          Your listing is ready. Submit it and we&apos;ll email you when it&apos;s live.
        </p>
      )}
      <Button
        size="lg"
        className="w-full"
        disabled={!ready || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await submitListingForReview(providerId);
            if (res?.error) setError(res.error);
          });
        }}
      >
        <Send aria-hidden /> {pending ? "Submitting…" : "Submit for review"}
      </Button>
      {!ready && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Add {remaining} to submit. Everything you add is saved, so you can finish later.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function SetupRequestForm({ providerId }: { providerId: string }) {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState("");
  const [photoLinks, setPhotoLinks] = useState("");
  const [permission, setPermission] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p role="status" className="rounded-2xl bg-secondary p-4 text-sm">
        Thanks! We&apos;ll set up your photos and packages and email you to check them. Nothing goes live until you
        submit it yourself.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-4 text-sm sm:p-5">
        <p className="font-medium">Busy? We can set it up for you</p>
        <p className="mt-1 text-muted-foreground">
          Send us your services, prices and where to find your photos. We&apos;ll prepare the listing for you to check
          and submit.
        </p>
        <Button variant="outline" className="mt-3" onClick={() => setOpen(true)}>
          Set it up for me
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-border p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await requestListingSetup(providerId, { services, photoLinks, permission: permission as true });
          if (res?.error) setError(res.error);
          else setSent(true);
        });
      }}
    >
      <p className="font-medium">Set it up for me</p>
      <div className="space-y-1.5">
        <Label htmlFor="setup-services">Your services and prices</Label>
        <Textarea
          id="setup-services"
          rows={5}
          placeholder="e.g. 3-hour birthday package $650 (edited photos in 7 days), extra hours $150"
          value={services}
          onChange={(e) => setServices(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="setup-links">Where can we find your photos? (optional)</Label>
        <Textarea
          id="setup-links"
          rows={2}
          placeholder="Your Instagram, website or a Google Drive / Dropbox link"
          value={photoLinks}
          onChange={(e) => setPhotoLinks(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Or upload a few photos above and we&apos;ll do the rest.</p>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="setup-permission"
          aria-labelledby="setup-permission-label"
          checked={permission}
          onCheckedChange={(v) => setPermission(v === true)}
        />
        <Label id="setup-permission-label" htmlFor="setup-permission" className="text-sm leading-snug font-normal text-muted-foreground">
          These photos are mine (or I have permission to use them), and Evntly may add them to my listing for me to review.
        </Label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={pending || !permission || services.trim().length < 10}>
          {pending ? "Sending…" : "Send to the Evntly team"}
        </Button>
      </div>
    </form>
  );
}
