"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { logout } from "@/lib/actions/auth";
import { acceptLegalDocuments } from "@/lib/actions/legal";
import { LEGAL_DOCUMENT_TITLE, legalDocumentHref } from "@/lib/legal/meta";
import { MARKETING_CONSENT_LABEL } from "@/lib/legal/versions";
import type { LegalDocumentKey } from "@/lib/legal/types";

// Stays out of the way on the legal pages (so they can be read first) and the
// auth pages.
const HIDDEN_ON = [
  "/terms",
  "/privacy-policy",
  "/vendor-agreement",
  "/cancellation-refund-dispute-policy",
  "/legal",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
];

export function LegalPrompt({
  outstanding,
  firstTime,
  askMarketing,
}: {
  outstanding: LegalDocumentKey[];
  firstTime: boolean;
  askMarketing: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [done, setDone] = useState(false);

  if (done || HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  // The fee schedule is part of the Vendor Agreement page; list it once.
  const shown = outstanding.filter((d) => !(d === "vendor_fee_schedule" && outstanding.includes("vendor_agreement")));
  const onlyPrivacy = outstanding.length === 1 && outstanding[0] === "privacy_policy";

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptLegalDocuments({
        documents: outstanding,
        context: firstTime ? "signup_google" : "terms_update",
        marketing: askMarketing ? marketing : undefined,
      });
      if (res?.error) setError(res.error);
      else {
        setDone(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-background p-6 shadow-xl"
      >
        <h2 id={`${id}-title`} className="mb-2 text-lg font-semibold">
          {firstTime ? "Before you continue" : "We've updated our legal documents"}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {firstTime
            ? "Please read and accept the documents that apply to your Evntly account:"
            : "Please review the updated documents below. You'll need to accept them to keep requesting quotes, messaging and booking."}
        </p>
        <ul className="mb-4 overflow-hidden rounded-xl bg-secondary text-sm">
          {shown.map((d, i) => (
            <li key={d} className={i < shown.length - 1 ? "border-b border-border/60" : ""}>
              <Link
                href={legalDocumentHref(d)}
                className="flex min-h-11 items-center justify-between px-3 py-2 font-medium hover:bg-accent"
              >
                {d === "vendor_agreement" ? "Vendor Service Agreement & fee schedule" : LEGAL_DOCUMENT_TITLE[d]}
                <span aria-hidden className="text-muted-foreground">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mb-3 flex items-start gap-2">
          <Checkbox aria-labelledby={`${id}-agree-label`} id={`${id}-agree`} checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
          <Label id={`${id}-agree-label`} htmlFor={`${id}-agree`} className="text-sm leading-snug font-normal text-muted-foreground">
            {onlyPrivacy
              ? "I've read the Privacy Policy."
              : "I've read and agree to the documents listed above (and acknowledge the Privacy Policy, if listed)."}
          </Label>
        </div>
        {askMarketing && (
          <div className="mb-3 flex items-start gap-2">
            <Checkbox aria-labelledby={`${id}-mkt-label`} id={`${id}-mkt`} checked={marketing} onCheckedChange={(v) => setMarketing(v === true)} />
            <Label id={`${id}-mkt-label`} htmlFor={`${id}-mkt`} className="text-sm leading-snug font-normal text-muted-foreground">
              {MARKETING_CONSENT_LABEL}
            </Label>
          </div>
        )}

        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <form action={logout}>
            <Button type="submit" variant="ghost" size="lg" className="w-full sm:w-auto" disabled={pending}>
              Log out
            </Button>
          </form>
          <Button size="lg" onClick={accept} disabled={pending || !agreed}>
            {pending ? "Saving…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
