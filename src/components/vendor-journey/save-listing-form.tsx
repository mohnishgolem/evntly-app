"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidAbn } from "@/lib/abn";
import { saveDraftAsListing } from "@/lib/actions/vendor-journey";
import { FEE_CHANGE_PROMISE, FEE_SUMMARY } from "@/lib/vendor-terms";

// The last step before a draft becomes the vendor's (still private) listing:
// ABN, GST, and the Vendor Service Agreement, exactly as the old form asked.
export function SaveListingForm({ assisted }: { assisted: boolean }) {
  const [abn, setAbn] = useState("");
  const [gst, setGst] = useState(false);
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [photoHelp, setPhotoHelp] = useState(assisted);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const abnOk = isValidAbn(abn);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await saveDraftAsListing({ abn, gstRegistered: gst, acceptedVendorAgreement: agreed, phone, photoHelp });
          if (res?.error) setError(res.error);
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="save-abn">ABN</Label>
        <Input
          id="save-abn"
          className="h-12 rounded-xl text-[17px]"
          inputMode="numeric"
          autoComplete="off"
          placeholder="11 digits"
          value={abn}
          onChange={(e) => setAbn(e.target.value)}
          aria-invalid={!!abn && !abnOk}
          aria-describedby="save-abn-help"
        />
        <p id="save-abn-help" className="text-xs text-muted-foreground">
          {abn && !abnOk
            ? "That doesn't look like a valid ABN. Check it at abr.business.gov.au."
            : "Every Evntly vendor needs one. It's shown on your listing and invoices. Applying is free at abr.gov.au."}
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={gst} onCheckedChange={(v) => setGst(v === true)} className="mt-0.5" />
        I&apos;m registered for GST
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="save-phone">Phone (optional, not shown publicly)</Label>
        <Input id="save-phone" className="h-11 rounded-xl" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      <div className="surface-pressed rounded-2xl p-4 text-sm">
        <p className="mb-2 font-medium">As an Evntly vendor, you agree to:</p>
        <ul className="list-disc space-y-1 pl-5 text-foreground/75">
          <li>keep your listing, photos and prices accurate, and show whether prices include GST;</li>
          <li>hold the licences and permits your services need (public liability insurance is strongly recommended);</li>
          <li>give clear quotes, including your deposit and cancellation terms, and honour accepted bookings;</li>
          <li>take payment directly from customers — Evntly doesn&apos;t hold booking payments;</li>
          <li>use customers&apos; details only for their enquiry or booking.</li>
        </ul>
        <p className="mt-2 text-foreground/75">
          {FEE_SUMMARY} {FEE_CHANGE_PROMISE}
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" aria-label="I agree to the Vendor Service Agreement" />
        <span>
          I agree to the{" "}
          <Link href="/vendor-agreement" target="_blank" className="font-medium text-foreground underline underline-offset-2">
            Vendor Service Agreement
          </Link>{" "}
          and its{" "}
          <Link href="/vendor-agreement#schedule-1" target="_blank" className="font-medium text-foreground underline underline-offset-2">
            fee schedule
          </Link>
          , and I&apos;m authorised to agree on behalf of this business.
        </span>
      </label>
      {assisted && (
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <Checkbox checked={photoHelp} onCheckedChange={(v) => setPhotoHelp(v === true)} className="mt-0.5" />
          Please add the photos I sent you. They&apos;re my own work (or I have permission), and I&apos;ll check them before I submit.
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!abnOk || !agreed || pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Save my listing
      </Button>
      <p className="text-sm text-muted-foreground">Saved privately. Next: add 3 photos and submit it for review.</p>
    </form>
  );
}
