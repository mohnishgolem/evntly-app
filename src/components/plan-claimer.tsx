"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { claimEventPlan, type PlanDraft } from "@/lib/actions/events";

// Runs once on the dashboard: if there's an anonymous plan draft in
// localStorage (from /plan, before the account existed), claim it into the
// events table now that we have a logged-in user, then clear it.
export function PlanClaimer() {
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("evntly_plan_draft");
    if (!raw) return;

    setClaiming(true);
    let draft: PlanDraft;
    try {
      draft = JSON.parse(raw);
    } catch {
      localStorage.removeItem("evntly_plan_draft");
      setClaiming(false);
      return;
    }

    claimEventPlan(draft).then((res) => {
      localStorage.removeItem("evntly_plan_draft");
      setClaiming(false);
      if (!res.error) router.refresh();
    });
  }, [router]);

  if (!claiming) return null;

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
      Saving your event plan…
    </div>
  );
}
