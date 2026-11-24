"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { claimEventPlan } from "@/lib/actions/events";
import { DRAFT_STORAGE_KEY, readDraft, type PlanDraft } from "@/lib/planner/draft";
import { publishEventToFeed } from "@/lib/actions/event-feed";

function readStashedDraft(): { draft: PlanDraft; postToFeed: boolean } | null {
  if (typeof window === "undefined") return null;
  const found = readDraft(localStorage.getItem(DRAFT_STORAGE_KEY));
  if (!found) localStorage.removeItem(DRAFT_STORAGE_KEY);
  return found;
}

// Runs once on the dashboard: if there's an anonymous plan draft in
// localStorage (from /plan, before the account existed), claim it into the
// events table now that we have a logged-in user, then clear it.
export function PlanClaimer() {
  const router = useRouter();
  // Browser storage is read after hydration: the server never sees the draft,
  // so reading it during the first render made the dashboard's HTML differ.
  const [claiming, setClaiming] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // One save per page, however many times the effect runs (React runs it
  // twice in development; a remount must not create a second event).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    const stashed = readStashedDraft();
    if (!stashed) return;
    started.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClaiming(true);
    claimEventPlan(stashed.draft, "guest").then(async (res) => {
      if (res.success && res.eventId) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        if (stashed.postToFeed) await publishEventToFeed(res.eventId);
        router.push(`/dashboard/events/${res.eventId}`);
        return;
      }
      // Keep the draft so nothing is lost; /plan reopens it to fix.
      setFailed(res.error ?? "Something went wrong.");
      setClaiming(false);
    });
  }, [router]);

  if (failed) {
    return (
      <div role="alert" className="mb-4 rounded-tile border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        We couldn&apos;t save your plan: {failed}{" "}
        <Link href="/plan" className="font-semibold underline underline-offset-2">
          Review it
        </Link>
      </div>
    );
  }
  if (!claiming) return null;

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary-text">
      Saving your event plan…
    </div>
  );
}
