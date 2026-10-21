"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { openPayoutDashboard, refreshPayoutStatus, startPayoutSetup } from "@/lib/actions/payments";

export function PayoutActions({ hasAccount, ready, returned }: { hasAccount: boolean; ready: boolean; returned: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Back from Stripe's onboarding: pull the latest account status.
  useEffect(() => {
    if (!returned) return;
    startTransition(async () => {
      await refreshPayoutStatus();
      router.replace("/vendor-dashboard/payouts");
    });
  }, [returned, router]);

  function go(fn: typeof startPayoutSetup) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.url) window.location.assign(res.url);
      else if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!ready && (
          <Button disabled={pending} onClick={() => go(startPayoutSetup)}>
            {hasAccount ? "Continue payout setup" : "Set up payouts with Stripe"}
          </Button>
        )}
        {hasAccount && (
          <Button variant="outline" disabled={pending} onClick={() => go(openPayoutDashboard)}>
            Open Stripe dashboard
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
