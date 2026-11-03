"use client";

import { useState } from "react";
import { Camera, Check, Copy, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

type Stats = { joined: number; submitted: number; approved: number };

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

// An approved founding vendor's invite link, ready-made share text and how
// many vendors joined through it. Counts only: who they referred stays
// private. The only reward is an Instagram spotlight from Evntly.
export function ReferralCard({ link, stats }: { link: string; stats: Stats }) {
  const [copied, setCopied] = useState<"link" | "text" | "error" | null>(null);
  const shareText = `I'm a Founding Vendor on Evntly, a new Sydney app where customers find and book event vendors. Founding places are free and limited. Claim yours here: ${link}`;

  async function copy(what: "link" | "text") {
    const ok = await copyText(what === "link" ? link : shareText);
    setCopied(ok ? what : "error");
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="rounded-2xl border border-border p-5">
      <p className="text-[15px] text-muted-foreground">
        Know a Sydney photographer, stylist, DJ, celebrant or florist who&apos;d like more bookings? Share your link. When a vendor you
        invite is approved, we&apos;ll feature your business in a spotlight post on Evntly&apos;s Instagram.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="referral-link" className="sr-only">
          Your invite link
        </label>
        <input
          id="referral-link"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 flex-1 rounded-xl border border-border bg-muted/40 px-3 text-sm"
        />
        <Button type="button" onClick={() => copy("link")} className="min-h-11">
          {copied === "link" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied === "link" ? "Copied" : "Copy link"}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", className: "min-h-11" })}
        >
          <MessageCircle className="size-4" aria-hidden /> Share on WhatsApp
        </a>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => copy("text")}>
          {copied === "text" ? <Check className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
          {copied === "text" ? "Message copied" : "Copy message for Instagram"}
        </Button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-xs text-muted-foreground">
        {copied === "error" ? "Couldn't copy. Select the link above and copy it." : copied === "text" ? "Paste it into a DM or your story." : ""}
      </p>

      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Joined", value: stats.joined },
          { label: "Applied", value: stats.submitted },
          { label: "Approved", value: stats.approved },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-muted/50 px-2 py-3">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-xl font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>
      {stats.approved > 0 && (
        <p className="mt-3 text-sm font-medium text-success">
          {stats.approved === 1 ? "A vendor you invited was approved." : `${stats.approved} vendors you invited were approved.`} Your
          Instagram spotlight is on its way.
        </p>
      )}
    </div>
  );
}
