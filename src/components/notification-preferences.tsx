"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { saveNotificationPreferences } from "@/lib/actions/notification-prefs";
import { isLocked, NOTIFICATION_CATEGORIES, type NotificationChannel, type NotificationPrefs } from "@/lib/notification-prefs";

// Each switch saves straight away (like iOS Settings); a failed save puts
// the switch back and says so.
export function NotificationPreferences({ initial, audience }: { initial: NotificationPrefs; audience: "vendor" | "customer" }) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(channel: NotificationChannel, key: keyof NotificationPrefs["email"], value: boolean) {
    const before = prefs;
    const next = { ...prefs, [channel]: { ...prefs[channel], [key]: value } };
    setPrefs(next);
    setStatus(null);
    startTransition(async () => {
      const res = await saveNotificationPreferences(next);
      if (res?.error) {
        setPrefs(before);
        setStatus({ ok: false, text: res.error });
      } else setStatus({ ok: true, text: "Saved" });
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-secondary">
        <div className="grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-2 border-b border-border/60 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Notify me about</span>
          <span className="text-center">Email</span>
          <span className="text-center">Push</span>
        </div>
        {NOTIFICATION_CATEGORIES.map((c, i) => (
          <div
            key={c.key}
            className={`grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-2 px-4 py-3 ${i < NOTIFICATION_CATEGORIES.length - 1 ? "border-b border-border/60" : ""}`}
          >
            <span className="min-w-0">
              <span className="block text-[15px]">{c.label}</span>
              <span className="block text-xs text-muted-foreground">{c[audience]}</span>
              {isLocked(c.key, "email") && (
                <span className="block text-xs text-muted-foreground">Booking and payment emails always send.</span>
              )}
            </span>
            {(["email", "push"] as const).map((ch) => (
              <span key={ch} className="flex justify-center">
                <Switch
                  aria-label={`${c.label} by ${ch}`}
                  checked={prefs[ch][c.key]}
                  disabled={isLocked(c.key, ch)}
                  onCheckedChange={(v) => toggle(ch, c.key, v)}
                />
              </span>
            ))}
          </div>
        ))}
      </div>
      <p aria-live="polite" className={`flex min-h-5 items-center gap-1.5 text-sm ${status && !status.ok ? "text-destructive" : "text-muted-foreground"}`}>
        {pending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
          </>
        ) : (
          status?.text
        )}
      </p>
    </div>
  );
}
