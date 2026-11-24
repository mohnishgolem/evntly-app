"use client";

import { useState } from "react";
import { Check, Copy, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { copyText } from "@/components/copy-link-field";

/** The vendor's review link and an editable message to send past clients. */
export function ReviewRequestShare({ url, message: initial }: { url: string; message: string }) {
  const [message, setMessage] = useState(initial);
  const [state, setState] = useState<{ what: "link" | "message" | "shared"; ok: boolean } | null>(null);

  async function copy(what: "link" | "message") {
    setState({ what, ok: await copyText(what === "link" ? url : message) });
  }
  async function share() {
    if (!navigator.share) return copy("message");
    try {
      await navigator.share({ text: message });
      setState({ what: "shared", ok: true });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      await copy("message");
    }
  }

  return (
    <div className="space-y-3">
      <label htmlFor="rr-message" className="text-sm font-medium">
        Message to send
      </label>
      <Textarea id="rr-message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className="text-base" />
      <Button size="lg" className="w-full" onClick={share}>
        <Share className="size-4" aria-hidden /> Send to past clients
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" variant="outline" onClick={() => copy("message")}>
          <Copy className="size-4" aria-hidden /> Copy message
        </Button>
        <Button size="lg" variant="outline" onClick={() => copy("link")}>
          <Copy className="size-4" aria-hidden /> Copy link
        </Button>
      </div>
      {state && (
        <p role="status" className={state.ok ? "flex items-center gap-2 text-sm text-success-text" : "text-sm text-destructive-text"}>
          {state.ok ? <Check className="size-4" aria-hidden /> : null}
          {state.ok
            ? state.what === "shared"
              ? "Sent to the share sheet."
              : state.what === "link"
                ? "Link copied."
                : "Message copied. Paste it in a text, email or DM."
            : "Couldn't copy. Press and hold the text to copy it."}
        </p>
      )}
      <p className="text-xs break-all text-muted-foreground">{url}</p>
    </div>
  );
}
