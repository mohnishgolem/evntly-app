"use client";

import { useActionState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitBetaFeedback, type FoundingActionState } from "@/lib/actions/founding";

const AREAS = [
  { value: "listing", label: "My listing / profile" },
  { value: "enquiries", label: "Enquiries and leads" },
  { value: "quotes", label: "Quotes" },
  { value: "bookings", label: "Bookings" },
  { value: "messages", label: "Messages" },
  { value: "other", label: "Something else" },
];

export function BetaFeedbackForm() {
  const [state, action, pending] = useActionState<FoundingActionState, FormData>(submitBetaFeedback, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">What is it?</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "feedback", label: "Feedback or idea" },
            { value: "bug", label: "Something's broken" },
          ].map((k, i) => (
            <label key={k.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="kind" value={k.value} defaultChecked={i === 0} className="accent-primary" />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="fb-area">Which part of Evntly?</Label>
        <select id="fb-area" name="area" defaultValue="other" className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base md:text-sm">
          {AREAS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="fb-message">Tell us more</Label>
        <Textarea
          id="fb-message"
          name="message"
          rows={5}
          required
          minLength={5}
          maxLength={4000}
          placeholder="What happened, what you expected, or what would make this better. For bugs, which page and device."
        />
      </div>
      <input type="hidden" name="page" value="/vendor-dashboard/beta" />
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-success">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending…" : "Send to the Evntly team"}
      </Button>
    </form>
  );
}
