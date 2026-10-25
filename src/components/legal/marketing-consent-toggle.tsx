"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setMarketingConsent } from "@/lib/actions/legal";

// Optional marketing emails (Spam Act consent). Each change is a new consent
// record; turning it off is a withdrawal.
export function MarketingConsentToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function toggle(v: boolean) {
    const previous = on;
    setOn(v);
    setStatus(null);
    startTransition(async () => {
      const res = await setMarketingConsent(v);
      if (res?.error) {
        setOn(previous);
        setStatus(res.error);
      } else setStatus(v ? "You'll get occasional emails from Evntly." : "You won't get marketing emails.");
    });
  }

  return (
    <div>
      <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px]">News, tips and offers</span>
          <span className="block text-xs text-muted-foreground">
            Optional marketing emails from Evntly. Account emails about your quotes and bookings aren&apos;t affected.
          </span>
        </span>
        <Switch aria-label="Marketing emails" checked={on} disabled={pending} onCheckedChange={toggle} />
      </label>
      <p aria-live="polite" className="min-h-5 px-4 pb-2 text-xs text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
