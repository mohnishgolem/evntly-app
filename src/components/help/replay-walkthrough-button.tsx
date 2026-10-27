"use client";

import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REPLAY_ONBOARDING_EVENT } from "@/components/help/onboarding-walkthrough";

// Reopens the walkthrough mounted in the root layout (OnboardingGate).
export function ReplayWalkthroughButton({ paymentsEnabled }: { paymentsEnabled: boolean }) {
  return (
    <Button
      variant="outline"
      size="lg"
      onClick={() => window.dispatchEvent(new CustomEvent(REPLAY_ONBOARDING_EVENT, { detail: { paymentsEnabled } }))}
    >
      <PlayCircle className="size-[18px]" strokeWidth={1.75} aria-hidden />
      Replay walkthrough
    </Button>
  );
}
