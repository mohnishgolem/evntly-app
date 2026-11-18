"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Some in-app browsers block the Clipboard API; fall back to the legacy copy.
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

/** A read-only link with a Copy button. */
export function CopyLinkField({ id, label, value }: { id: string; label: string; value: string }) {
  const [state, setState] = useState<"copied" | "error" | null>(null);

  async function copy() {
    setState((await copyText(value)) ? "copied" : "error");
    setTimeout(() => setState(null), 2000);
  }

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 flex-1 rounded-xl border border-border bg-muted/40 px-3 text-sm"
        />
        <Button type="button" onClick={copy} className="min-h-11">
          {state === "copied" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {state === "copied" ? "Copied" : "Copy link"}
        </Button>
      </div>
      {state === "error" && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Couldn&apos;t copy. Press and hold the link to copy it.
        </p>
      )}
    </div>
  );
}
