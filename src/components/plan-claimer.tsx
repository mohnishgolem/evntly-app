"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { claimEventPlan, type PlanDraft } from "@/lib/actions/events";
import { publishEventToFeed } from "@/lib/actions/event-feed";

function readStashedDraft(): { draft: PlanDraft; postToFeed: boolean } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("evntly_plan_draft");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return { draft: parsed.draft ?? parsed, postToFeed: !!parsed.postToFeed };
  } catch {
    localStorage.removeItem("evntly_plan_draft");
    return null;
  }
}

// Runs once on the dashboard: if there's an anonymous plan draft in
// localStorage (from /plan, before the account existed), claim it into the
// events table now that we have a logged-in user, then clear it.
export function PlanClaimer() {
  const router = useRouter();
  const [stashed] = useState(readStashedDraft);
  const [claiming, setClaiming] = useState(!!stashed);

  useEffect(() => {
    if (!stashed) return;

    claimEventPlan(stashed.draft).then(async (res) => {
      localStorage.removeItem("evntly_plan_draft");
      if (res.success && res.eventId) {
        if (stashed.postToFeed) await publishEventToFeed(res.eventId);
        router.push(`/dashboard/events/${res.eventId}/vendors`);
        return;
      }
      setClaiming(false);
    });
    // Intentionally runs once on mount — `stashed` is a stable initial-state
    // snapshot, not something that should re-trigger the claim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!claiming) return null;

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
      Saving your event plan…
    </div>
  );
}
