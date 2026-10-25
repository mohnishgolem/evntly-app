"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Works with public/sw.js, which serves the home page from a cached copy so
// the installed app opens instantly instead of on a blank screen.
//
// - Registers the service worker (push notifications use the same one).
// - If this page came from the cached copy, re-fetches its data straight
//   away so the session, counts and prompts are current.
// - Deletes the copy when someone signs out (forms marked
//   data-clear-app-cache), so the next person on the device never sees the
//   previous account's home page, even briefly.
const REFRESHED_AT_KEY = "evntly-shell-refreshed-at";

export function AppShellCache() {
  const router = useRouter();

  useEffect(() => {
    const html = document.documentElement;
    if (!html.hasAttribute("data-cached-shell")) return;
    html.removeAttribute("data-cached-shell");
    // At most once per 30s: when the refresh can't reach the server (no
    // signal), Next falls back to reloading the page, which the worker
    // serves from the cache again — without this, that loops forever.
    try {
      const last = Number(sessionStorage.getItem(REFRESHED_AT_KEY) || 0);
      if (Date.now() - last < 30_000) return;
      sessionStorage.setItem(REFRESHED_AT_KEY, String(Date.now()));
    } catch {
      return;
    }
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    const onSubmit = (e: SubmitEvent) => {
      if (e.target instanceof HTMLFormElement && e.target.hasAttribute("data-clear-app-cache")) {
        clearAppShellCache();
      }
    };
    document.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("load", register);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  return null;
}

export function clearAppShellCache() {
  // Directly from the page as well as via the worker: either one is enough,
  // and the page can do it even if the worker isn't running yet.
  if (typeof caches !== "undefined") caches.delete("evntly-shell-v1").catch(() => {});
  navigator.serviceWorker?.controller?.postMessage({ type: "clear-shell" });
}
