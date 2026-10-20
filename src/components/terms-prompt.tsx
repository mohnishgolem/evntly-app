"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { acceptCurrentTerms, logout } from "@/lib/actions/auth";

// Shown to signed-in users who haven't accepted the current Terms version.
// Stays out of the way on the legal pages (so they can be read first) and on
// the auth pages.
const HIDDEN_ON = ["/terms", "/privacy-policy", "/login", "/signup", "/forgot-password", "/reset-password", "/auth"];

export function TermsPrompt({ updated }: { updated: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  if (accepted || HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptCurrentTerms();
      if (res.error) setError(res.error);
      else {
        setAccepted(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-prompt-title"
        className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl"
      >
        <h2 id="terms-prompt-title" className="mb-2 text-lg font-semibold">
          {updated ? "We've updated our Terms" : "Please accept our Terms"}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          To keep using Evntly, please read and accept our{" "}
          <Link href="/terms" className="font-medium text-foreground underline underline-offset-2">
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link href="/privacy-policy" className="font-medium text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <form action={logout}>
            <Button type="submit" variant="ghost" className="w-full sm:w-auto" disabled={pending}>
              Log out
            </Button>
          </form>
          <Button onClick={accept} disabled={pending} autoFocus>
            {pending ? "Saving…" : "I agree"}
          </Button>
        </div>
      </div>
    </div>
  );
}
