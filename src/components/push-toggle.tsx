"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription } from "@/lib/actions/push";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function detect(): State {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // iOS only allows web push for sites added to the Home Screen.
  if (isIos && !standalone) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "off";
}

export function PushToggle({ publicKey, compact = false }: { publicKey: string | null; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initial = detect();
      if (initial !== "off") {
        if (!cancelled) setState(initial);
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (!cancelled) setState(sub ? "on" : "off");
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const res = await savePushSubscription(sub.toJSON(), navigator.userAgent);
      if (res.error) {
        await sub.unsubscribe().catch(() => {});
        setError(res.error);
        return;
      }
      setState("on");
    } catch {
      setError("Couldn't turn on notifications in this browser.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  // The compact prompt (e.g. on /messages) only shows when there's something to do.
  if (compact && (state === "loading" || state === "on" || state === "unsupported" || state === "denied")) {
    return null;
  }
  if (!publicKey) return null;

  const hint: Record<State, string> = {
    loading: "",
    unsupported: "This browser doesn't support notifications.",
    "ios-install":
      "On iPhone, tap Share → Add to Home Screen, then open Evntly from your Home Screen to turn on notifications.",
    denied: "Notifications are blocked for Evntly. Allow them in your browser's site settings, then come back.",
    off: "Get an alert on this device for new messages, quotes and bookings.",
    on: "You'll get alerts on this device for new messages, quotes and bookings.",
  };

  return (
    <div className={compact ? "mb-4 rounded-2xl border border-border p-4" : "rounded-2xl bg-secondary p-4"}>
      <div className="flex items-start gap-3">
        {state === "on" ? (
          <Bell className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.75} />
        ) : (
          <BellOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Push notifications</p>
          <p className="text-sm text-muted-foreground">{hint[state]}</p>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>
        {(state === "off" || state === "on") && (
          <Button
            size="sm"
            variant={state === "on" ? "outline" : "default"}
            disabled={busy}
            onClick={state === "on" ? disable : enable}
            className="shrink-0"
          >
            {busy && <Loader2 className="animate-spin" />}
            {state === "on" ? "Turn off" : "Turn on"}
          </Button>
        )}
      </div>
    </div>
  );
}
