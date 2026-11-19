"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitPastClientReview } from "@/lib/actions/reviews";
import { EVENT_TYPES } from "@/lib/config";
import { PAST_CLIENT_COMMENT_MAX, PAST_CLIENT_COMMENT_MIN } from "@/lib/past-client-reviews";
import { cn } from "@/lib/utils";

type Draft = { rating: number; comment: string; eventType: string; confirmed: boolean };
const EMPTY: Draft = { rating: 0, comment: "", eventType: "", confirmed: false };

// A guest's unsent review, kept in this browser while they sign up (a day at most).
const draftKey = (vendorId: string) => `evntly_review_draft:${vendorId}`;
function readDraft(vendorId: string): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(vendorId));
    if (!raw) return null;
    const { at, draft } = JSON.parse(raw) as { at: number; draft: Draft };
    return Date.now() - at < 24 * 60 * 60 * 1000 ? draft : null;
  } catch {
    return null;
  }
}
function saveDraft(vendorId: string, draft: Draft) {
  try {
    localStorage.setItem(draftKey(vendorId), JSON.stringify({ at: Date.now(), draft }));
  } catch {
    // Private mode: they'll write it again after signing up.
  }
}
function clearDraft(vendorId: string) {
  try {
    localStorage.removeItem(draftKey(vendorId));
  } catch {
    // Nothing to clear.
  }
}

const LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export function PastClientReviewForm({
  vendorId,
  vendorName,
  signedIn,
  signupHref,
  loginHref,
}: {
  vendorId: string;
  vendorName: string;
  signedIn: boolean;
  signupHref: string;
  loginHref: string;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // Coming back from sign-up: put back what they wrote. Restored after the
  // first render (the server can't see this browser's storage), so the HTML
  // the server sent and the first client render match.
  useEffect(() => {
    if (!signedIn) return;
    const saved = readDraft(vendorId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off sync from localStorage
    if (saved) setDraft(saved);
  }, [signedIn, vendorId]);

  const commentLength = draft.comment.trim().length;
  const ready = draft.rating > 0 && commentLength >= PAST_CLIENT_COMMENT_MIN && draft.confirmed;

  function asGuest(href: string) {
    saveDraft(vendorId, draft);
    window.location.assign(href);
  }

  function post() {
    setError(null);
    startTransition(async () => {
      const res = await submitPastClientReview(vendorId, {
        rating: draft.rating,
        comment: draft.comment,
        eventType: (draft.eventType || null) as (typeof EVENT_TYPES)[number] | null,
        confirmed: draft.confirmed as true,
      });
      if (res?.error) setError(res.error);
      else {
        clearDraft(vendorId);
        setDone(true);
      }
    });
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-border p-6 text-center">
        <CheckCircle2 className="size-10 text-success" aria-hidden />
        <h2 className="text-lg font-semibold">Thank you! Your review is live</h2>
        <p className="text-sm text-muted-foreground">
          It&apos;s on {vendorName}&apos;s profile now and helps other people find them.
        </p>
        <div className="grid w-full gap-2">
          <Button size="lg" nativeButton={false} render={<Link href={`/vendor/${vendorId}`}>See it on their profile</Link>} />
          <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/explore">Planning an event? Explore Sydney vendors</Link>} />
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        if (signedIn) post();
        else asGuest(signupHref);
      }}
    >
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
          maxLength={PAST_CLIENT_COMMENT_MAX}
          placeholder={`What was it like working with ${vendorName}?`}
          value={draft.comment}
          onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
          className="text-base"
          aria-describedby="rv-comment-hint"
        />
        <p id="rv-comment-hint" className="text-xs text-muted-foreground">
          {commentLength < PAST_CLIENT_COMMENT_MIN
            ? `At least ${PAST_CLIENT_COMMENT_MIN} characters (${PAST_CLIENT_COMMENT_MIN - commentLength} to go).`
            : `${commentLength} / ${PAST_CLIENT_COMMENT_MAX}`}
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
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {signedIn ? (
        <Button type="submit" size="lg" className="w-full" disabled={!ready || pending}>
          {pending ? "Posting…" : "Post review"}
        </Button>
      ) : (
        <div className="space-y-2">
          <Button type="submit" size="lg" className="w-full" disabled={!ready}>
            Create free account to post
          </Button>
          <Button type="button" size="lg" variant="outline" className="w-full" disabled={!ready} onClick={() => asGuest(loginHref)}>
            I have an account: log in
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            We keep what you wrote. After you verify your email you come straight back here to post it.
          </p>
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Reviews show your first name and last initial, and are marked as from a past client (not booked on Evntly).
      </p>
    </form>
  );
}
