"use client";

import { useState } from "react";
import { Share, Check } from "lucide-react";
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
  const [copied, setCopied] = useState(false);

  async function share(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // User cancelled the native share sheet — not an error.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied — nothing more we can do silently.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? "Link copied" : "Share"}
      className={cn(
        "flex items-center justify-center rounded-full bg-background shadow-sm transition-transform active:scale-90",
        size === "sm" ? "h-7 w-7" : "h-10 w-10",
        className
      )}
    >
      {copied ? (
        <Check className={cn(size === "sm" ? "size-3.5" : "size-5", "text-success")} />
      ) : (
        <Share className={cn(size === "sm" ? "size-3.5" : "size-5", "text-muted-foreground")} />
      )}
    </button>
  );
}
