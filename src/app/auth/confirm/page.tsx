import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { parseConfirmLink } from "@/lib/auth-links";

export const metadata: Metadata = {
  title: "Continue",
  robots: { index: false, follow: false },
  // Don't hand the token to other sites through the Referer header.
  referrer: "no-referrer",
};

// Where sign-up and password-reset emails link to. Opening this page uses
// nothing: the one-time token is only spent when the person presses
// Continue, so an email scanner that opens the link first can't use it up.
// See lib/auth-links.ts.
export default async function ConfirmEmailLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const link = parseConfirmLink(await searchParams);

  if (!link) {
    return (
      <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
        <h1 className="mb-1 text-2xl font-bold">This link isn&apos;t complete</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Open the newest email from Evntly and tap the button again, or log in if you&apos;ve already confirmed.
        </p>
        <Button nativeButton={false} render={<Link href="/login">Go to log in</Link>} />
      </div>
    );
  }

  const recovery = link.type === "recovery";
  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">{recovery ? "Reset your password" : "Confirm your email"}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {recovery
          ? "Tap Continue to choose a new password."
          : "Tap Continue to confirm your email and finish setting up your account."}
      </p>
      {/* A plain post (not a server action): the route answers with a full-page redirect. */}
      <form method="post" action="/auth/confirm/continue">
        <input type="hidden" name="token_hash" value={link.tokenHash} />
        <input type="hidden" name="type" value={link.type} />
        {link.next && <input type="hidden" name="next" value={link.next} />}
        <Button type="submit" size="lg" className="w-full">
          Continue
        </Button>
      </form>
    </div>
  );
}
