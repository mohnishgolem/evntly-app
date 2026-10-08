"use client";

import { useState } from "react";
import { Share, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ShareButton({
  url,
  title,
  text,
  className,
  size = "sm",
}: {
  url: string;
  title: string;
  text?: string;
  className?: string;
  size?: "sm" | "lg";
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function share(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return; // Native share sheet handled it — its own UI is the feedback.
      } catch (err) {
        // AbortError means the user genuinely dismissed the native share
        // sheet — nothing more to do. Any other rejection (blocked by the
        // browser, no share target, automated/non-interactive contexts,
        // etc.) means the native path never actually showed anything, so
        // fall through to the clipboard copy instead of going silent.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      // Clipboard API can reject (denied permission, insecure context, some
      // embedded/in-app browsers) — fall back to the legacy copy trick
      // rather than failing completely silently.
      try {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setStatus("copied");
      } catch {
        setStatus("error");
      }
    }
    setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label={
        status === "copied" ? "Link copied" : status === "error" ? "Couldn't copy link" : "Share"
      }
      className={cn(
        "flex items-center justify-center rounded-full bg-background shadow-sm transition-transform active:scale-90",
        size === "sm" ? "h-7 w-7" : "h-10 w-10",
        className
      )}
    >
      {status === "copied" ? (
        <Check className={cn(size === "sm" ? "size-3.5" : "size-5", "text-success")} />
      ) : status === "error" ? (
        <X className={cn(size === "sm" ? "size-3.5" : "size-5", "text-destructive")} />
      ) : (
        <Share className={cn(size === "sm" ? "size-3.5" : "size-5", "text-muted-foreground")} />
      )}
    </button>
  );
}
