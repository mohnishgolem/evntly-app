"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinVendorWaitlist, type FoundingActionState } from "@/lib/actions/founding";
import { LAUNCH_CATEGORIES, categoryLabel } from "@/lib/config";

export function WaitlistForm({
  submitLabel = "Join the Waitlist",
  assisted = false,
}: {
  submitLabel?: string;
  /** "Prefer help?" version: asks for an Instagram handle or website so we can draft the listing. */
  assisted?: boolean;
}) {
  const p = assisted ? "as" : "wl";
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
      {assisted && <input type="hidden" name="wantsHelp" value="1" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-first`}>First name</Label>
          <Input id={`${p}-first`} name="firstName" autoComplete="given-name" required className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-email`}>Email</Label>
          <Input id={`${p}-email`} name="email" type="email" autoComplete="email" inputMode="email" required className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-business`}>
            Business name <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id={`${p}-business`} name="businessName" autoComplete="organization" className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-category`}>
            What you do <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <select id={`${p}-category`} name="category" defaultValue="" className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base md:text-sm">
            <option value="">Choose…</option>
            {LAUNCH_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        {assisted && (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="as-instagram">Instagram handle or website</Label>
            <Input id="as-instagram" name="instagram" placeholder="@yourbusiness" autoComplete="url" className="h-11" />
          </div>
        )}
      </div>
      <label className="flex items-start gap-2.5 text-sm leading-relaxed">
        <input type="checkbox" name="consent" required className="mt-1 size-4 shrink-0 accent-primary" />
        <span>
          {assisted
            ? "Email me about setting up my free Evntly listing. I can unsubscribe at any time."
            : "Email me about Evntly vendor early access, including if a founding place opens up. I can unsubscribe at any time."}
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
