"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestCall, type CallRequestState } from "@/lib/actions/call-request";
import { LAUNCH_CATEGORIES, categoryLabel } from "@/lib/config";
import { CALL_REQUEST_CONSENT } from "@/lib/phone-agent/call-request";

const select = "h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px]";

export function CallRequestForm() {
  const [state, action, pending] = useActionState<CallRequestState, FormData>(requestCall, null);

  if (state?.success) {
    return (
      <p role="status" className="flex items-start gap-2.5 rounded-2xl bg-secondary p-5 text-[15px]">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-text" aria-hidden />
        Thanks! We&apos;ll call you on a weekday between 10am and 4:30pm. The call is from Evntly&apos;s AI assistant, and you can ask for a
        person at any time.
      </p>
    );
  }

  const v = state?.values ?? {};
  return (
    // key: remount with the typed values after an error, since React resets the form.
    <form key={JSON.stringify(v)} action={action} className="grid gap-4" noValidate>
      <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="cr-business">Business name</Label>
          <Input id="cr-business" name="businessName" defaultValue={v.businessName} required autoComplete="organization" className="h-11 rounded-xl" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cr-name">Your first name (optional)</Label>
          <Input id="cr-name" name="name" defaultValue={v.name} autoComplete="given-name" className="h-11 rounded-xl" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cr-phone">Phone</Label>
          <Input id="cr-phone" name="phone" type="tel" defaultValue={v.phone} required autoComplete="tel" inputMode="tel" placeholder="0412 345 678" className="h-11 rounded-xl" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cr-category">What you do</Label>
          <select id="cr-category" name="category" className={select} defaultValue={v.category ?? ""}>
            <option value="">Choose one</option>
            {LAUNCH_CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cr-email">Email (optional)</Label>
          <Input id="cr-email" name="email" type="email" defaultValue={v.email} autoComplete="email" className="h-11 rounded-xl" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cr-time">Best time</Label>
          <select id="cr-time" name="preferredTime" className={select} defaultValue={v.preferredTime || "any"}>
            <option value="any">Any time</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
          </select>
        </div>
      </div>
      <label className="flex items-start gap-3 text-[15px] leading-relaxed">
        <input type="checkbox" name="consent" value="yes" required aria-describedby="cr-consent" className="mt-1 size-5 shrink-0 accent-primary" />
        <span id="cr-consent">{CALL_REQUEST_CONSENT}</span>
      </label>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending…" : "Request a call"}
      </Button>
      <p className="text-xs text-muted-foreground">
        We only use your number to call you about listing on Evntly. See our <a href="/privacy-policy" className="underline">privacy policy</a>.
      </p>
    </form>
  );
}
