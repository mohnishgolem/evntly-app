"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinVendorWaitlist, type FoundingActionState } from "@/lib/actions/founding";
import { LAUNCH_CATEGORIES, categoryLabel } from "@/lib/config";

export function WaitlistForm({ submitLabel = "Join the Waitlist" }: { submitLabel?: string }) {
  const [state, action, pending] = useActionState<FoundingActionState, FormData>(joinVendorWaitlist, null);

  if (state?.success) {
    return (
      <p role="status" className="flex items-start gap-2.5 rounded-2xl bg-secondary p-5 text-[15px]">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-4" noValidate>
      {/* Honeypot: hidden from people, filled in by bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="wl-first">First name</Label>
          <Input id="wl-first" name="firstName" autoComplete="given-name" required className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wl-email">Email</Label>
          <Input id="wl-email" name="email" type="email" autoComplete="email" inputMode="email" required className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wl-business">
            Business name <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id="wl-business" name="businessName" autoComplete="organization" className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wl-category">
            What you do <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <select id="wl-category" name="category" defaultValue="" className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base md:text-sm">
            <option value="">Choose…</option>
            {LAUNCH_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-sm leading-relaxed">
        <input type="checkbox" name="consent" required className="mt-1 size-4 shrink-0 accent-primary" />
        <span>
          Email me about Evntly vendor early access, including if a founding place opens up. I can unsubscribe at any time.
        </span>
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Adding you…" : submitLabel}
      </Button>
      <p className="text-xs text-muted-foreground">
        We use your details only to contact you about the vendor beta. See our{" "}
        <a href="/privacy-policy" className="underline underline-offset-2">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
