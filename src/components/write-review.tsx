"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, PencilLine, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { saveReviewDraft, submitReview } from "@/lib/actions/reviews";
import { EVENT_TYPES } from "@/lib/config";
import { REVIEW_COMMENT_MAX, REVIEW_COMMENT_MIN, reviewReturnPath } from "@/lib/profile-reviews";
import type { ShareSource } from "@/lib/share-profile";
import { useSheetSide } from "@/lib/use-sheet-side";
import { cn } from "@/lib/utils";

type EventType = (typeof EVENT_TYPES)[number];
type Draft = { rating: number; comment: string; eventType: string; confirmed: boolean };
const LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

/**
 * "Write a review" on a vendor's profile: one flow for anyone who hired them.
 * Guests write first; their draft is saved server-side and reopened here
 * (?review=<draft>) after they sign up and verify their email.
 */
export function WriteReview({
  vendorId,
  vendorName,
  signedIn,
  reviewed,
  initialDraft,
  draftId,
  autoOpen,
  shareSource,
}: {
  vendorId: string;
  vendorName: string;
  signedIn: boolean;
  /** Nothing left to review (already reviewed as a past client, no unreviewed booking). */
  reviewed: boolean;
  initialDraft: { rating: number | null; comment: string; eventType: string | null } | null;
  draftId: string | null;
  autoOpen: boolean;
  shareSource: ShareSource | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const side = useSheetSide();
  const [open, setOpen] = useState(autoOpen && !reviewed);
  const [draft, setDraft] = useState<Draft>({
    rating: initialDraft?.rating ?? 0,
    comment: initialDraft?.comment ?? "",
    eventType: initialDraft?.eventType ?? "",
    confirmed: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const commentLength = draft.comment.trim().length;
  const ready = draft.rating > 0 && commentLength >= REVIEW_COMMENT_MIN && draft.confirmed;
  const eventType = (draft.eventType || null) as EventType | null;


  function continueAsGuest(to: "signup" | "login") {
    setError(null);
    startTransition(async () => {
      const res = await saveReviewDraft(vendorId, { rating: draft.rating || null, comment: draft.comment, eventType });
      if (!res.draftId) {
        setError(res.error ?? "We couldn't save your review. Please try again.");
        return;
      }
      router.push(`/${to}?next=${encodeURIComponent(reviewReturnPath(vendorId, res.draftId, shareSource))}`);
    });
  }

  function post() {
    setError(null);
    startTransition(async () => {
      const res = await submitReview(vendorId, { rating: draft.rating, comment: draft.comment, eventType, confirmed: true }, draftId);
      if (res?.error) setError(res.error);
      else {
        setDone(true);
        router.replace(pathname, { scroll: false }); // drop ?review= so a refresh doesn't reopen it
        router.refresh();
      }
    });
  }

  // Once posted, the page refreshes with `reviewed` set; keep the thank-you
  // sheet up until they close it.
  if (reviewed && !done) {
    return <p className="text-sm text-muted-foreground">You&apos;ve reviewed {vendorName}. Thank you!</p>;
  }

  return (
    <>
      {reviewed ? (
        <p className="text-sm text-muted-foreground">You&apos;ve reviewed {vendorName}. Thank you!</p>
      ) : (
        <Button variant="outline" size="lg" onClick={() => setOpen(true)}>
          <PencilLine className="size-4" aria-hidden /> Write a review
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={side}
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-h-dvh sm:max-w-md sm:rounded-none"
        >
          {side === "bottom" && <div aria-hidden className="mx-auto -mb-2 h-1.5 w-9 shrink-0 rounded-full bg-muted-foreground/30" />}
          <SheetHeader className="px-0">
            <SheetTitle>{done ? "Thank you!" : `Review ${vendorName}`}</SheetTitle>
            <SheetDescription>
              {done ? "Your review is live on their profile." : "For anyone who has hired them, through Evntly or directly."}
            </SheetDescription>
          </SheetHeader>

          {done ? (
            <div role="status" className="flex flex-col items-center gap-3 py-2 text-center">
              <CheckCircle2 className="size-10 text-success-text" aria-hidden />
              <p className="text-sm text-muted-foreground">It helps other people find {vendorName}.</p>
              <div className="grid w-full gap-2">
                <Button size="lg" onClick={() => setOpen(false)}>
                  Back to {vendorName}
                </Button>
                <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/explore">Planning an event? Explore Sydney vendors</Link>} />
              </div>
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!ready || pending) return;
                if (signedIn) post();
                else continueAsGuest("signup");
              }}
            >
              {initialDraft && (
                <p role="status" className="rounded-xl bg-primary/5 px-3 py-2 text-sm">
                  Welcome back! Your review is below. Tick the box and post it.
                </p>
              )}
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Your rating</legend>
                <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={draft.rating === n}
                      aria-label={`${n} star${n === 1 ? "" : "s"}: ${LABELS[n]}`}
                      onClick={() => setDraft((d) => ({ ...d, rating: n }))}
                      className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Star className={cn("size-8", n <= draft.rating ? "fill-champagne text-champagne" : "text-muted-foreground/40")} aria-hidden />
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-muted-foreground" aria-hidden>
                    {LABELS[draft.rating]}
                  </span>
                </div>
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor="rv-type">Type of event (optional)</Label>
                <select
                  id="rv-type"
                  className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-base"
                  value={draft.eventType}
                  onChange={(e) => setDraft((d) => ({ ...d, eventType: e.target.value }))}
                >
                  <option value="">Choose…</option>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rv-comment">Your experience</Label>
                <Textarea
                  id="rv-comment"
                  rows={5}
                  maxLength={REVIEW_COMMENT_MAX}
                  placeholder={`What was it like working with ${vendorName}?`}
                  value={draft.comment}
                  onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
                  className="text-base"
                  aria-describedby="rv-comment-hint"
                />
                <p id="rv-comment-hint" className="text-xs text-muted-foreground">
                  {commentLength < REVIEW_COMMENT_MIN
                    ? `At least ${REVIEW_COMMENT_MIN} characters (${REVIEW_COMMENT_MIN - commentLength} to go).`
                    : `${commentLength} / ${REVIEW_COMMENT_MAX}`}
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-xl bg-secondary/60 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                  checked={draft.confirmed}
                  onChange={(e) => setDraft((d) => ({ ...d, confirmed: e.target.checked }))}
                />
                <span>
                  I hired {vendorName} myself, this is my honest experience, and I&apos;m not related to or working for the business.
                </span>
              </label>

              {error && (
                <p role="alert" className="text-sm text-destructive-text">
                  {error}
                </p>
              )}

              {signedIn ? (
                <Button type="submit" size="lg" className="w-full" disabled={!ready || pending}>
                  {pending ? "Posting…" : "Post review"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button type="submit" size="lg" className="w-full" disabled={!ready || pending}>
                    {pending ? "Saving…" : "Create free account to post"}
                  </Button>
                  <Button type="button" size="lg" variant="outline" className="w-full" disabled={!ready || pending} onClick={() => continueAsGuest("login")}>
                    I have an account: log in
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    We save your review. After you verify your email you come straight back to post it, even on another device.
                  </p>
                </div>
              )}
              <p className="text-center text-xs text-muted-foreground">
                Reviews show your first name and last initial. Reviews from clients who didn&apos;t book through Evntly are marked
                &ldquo;Past client&rdquo;.
              </p>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
