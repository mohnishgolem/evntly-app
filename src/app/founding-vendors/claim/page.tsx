import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceCookie } from "@/components/founding/source-cookie";
import { ClaimButton } from "@/components/founding/claim-controls";
import { ApplicationStatusView } from "@/components/founding/application-status";
import { getCurrentUser } from "@/lib/data/user";
import { getFoundingPlaces, getMyFoundingStatus } from "@/lib/data/founding";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken, looksLikeInviteToken } from "@/lib/founding/tokens";
import { CLAIM_PATH, FOUNDING_PATH, sourceFromParams, type FoundingSource } from "@/lib/founding/sources";
import { MIN_PHOTOS } from "@/lib/profile-completeness";

export const metadata: Metadata = {
  title: "Claim your founding vendor place",
  robots: { index: false, follow: false },
};

type InviteState = "valid" | "expired" | "claimed" | "invalid" | "preview";


export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawInvite = typeof params.invite === "string" ? params.invite : null;
  const invite = looksLikeInviteToken(rawInvite) ? rawInvite : null;
  const source: FoundingSource | null = sourceFromParams(params) ?? (invite ? "waitlist_email" : null);

  const supabase = await createClient();
  let inviteState: InviteState | null = rawInvite === "preview" ? "preview" : rawInvite ? "invalid" : null;
  let invitee: { maskedEmail: string | null; firstName: string | null } | null = null;
  if (invite) {
    const { data } = await supabase.rpc("beta_invite_lookup", { p_token_hash: hashInviteToken(invite) });
    const row = data?.[0];
    inviteState = (row?.state as InviteState | undefined) ?? "invalid";
    invitee = row ? { maskedEmail: row.masked_email, firstName: row.first_name } : null;
  }

  // Where to come back to after signing up / logging in.
  const back = new URLSearchParams();
  if (invite) back.set("invite", invite);
  if (source) back.set("src", source);
  const returnPath = back.size ? `${CLAIM_PATH}?${back}` : CLAIM_PATH;

  const [session, places] = await Promise.all([getCurrentUser(), getFoundingPlaces()]);
  const full = places ? places.remaining <= 0 : false;

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:py-14">
      <SourceCookie source={source} />
      {!session ? (
        <SignedOut inviteState={inviteState} invitee={invitee} returnPath={returnPath} full={full} />
      ) : (
        <SignedIn invite={invite} inviteState={inviteState} invitee={invitee} source={source} full={full} email={session.user.email ?? null} />
      )}
    </div>
  );
}

function InviteNotice({ state, invitee, signedIn }: { state: InviteState | null; invitee: { maskedEmail: string | null; firstName: string | null } | null; signedIn: boolean }) {
  if (!state) return null;
  if (state === "valid") {
    return (
      <p className="mb-6 rounded-2xl bg-secondary p-4 text-[15px]">
        {invitee?.firstName ? `Hi ${invitee.firstName}, your` : "Your"} invitation is ready
        {invitee?.maskedEmail ? (
          <>
            {" "}
            — it was sent to <span className="font-medium">{invitee.maskedEmail}</span>.{" "}
            {signedIn ? "" : "Sign up or log in with that email so we can link it to your account."}
          </>
        ) : (
          "."
        )}
      </p>
    );
  }
  const text: Record<Exclude<InviteState, "valid">, string> = {
    expired: "This invitation link has expired. You can still claim a place below, or email hello@evntlyapp.com for a new link.",
    claimed: "This invitation link has already been used. If that was you, log in to see your application.",
    invalid: "We couldn't find that invitation. It may have been replaced by a newer email. You can still claim a place below.",
    preview: "This is a preview link from a test email — it isn't linked to a real invitation.",
  };
  return (
    <p className="mb-6 flex gap-2.5 rounded-2xl border border-border p-4 text-sm">
      <MailWarning className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      {text[state]}
    </p>
  );
}

function SignedOut({
  inviteState,
  invitee,
  returnPath,
  full,
}: {
  inviteState: InviteState | null;
  invitee: { maskedEmail: string | null; firstName: string | null } | null;
  returnPath: string;
  full: boolean;
}) {
  const next = encodeURIComponent(returnPath);
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Claim your free vendor account</h1>
      <p className="mb-6 text-muted-foreground">
        Create your account, set up your business listing and submit it for review. It takes about 10 minutes.
      </p>
      <InviteNotice state={inviteState} invitee={invitee} signedIn={false} />
      {full && <FullNotice />}
      <div className="grid gap-2">
        <Button size="lg" nativeButton={false} render={<Link href={`/signup?role=vendor&next=${next}`}>Create my free vendor account</Link>} />
        <Button size="lg" variant="outline" nativeButton={false} render={<Link href={`/login?next=${next}`}>I already have an Evntly account</Link>} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account? Log in — you won&apos;t need to register again, and we&apos;ll use your existing listing.
      </p>
      <WhatYouNeed />
    </>
  );
}

function FullNotice() {
  return (
    <p className="mb-6 rounded-2xl border border-border p-4 text-sm">
      All founding places are filled right now. You can still apply. We&apos;ll review your listing as usual and let you know
      if a place opens up.{" "}
      <Link href={`${FOUNDING_PATH}#waitlist`} className="font-medium underline underline-offset-2">
        Or join the waitlist
      </Link>
    </p>
  );
}

function WhatYouNeed() {
  const items = ["Your business name and category", "Your ABN", "The Sydney areas you service", "A phone number customers can reach", `At least ${MIN_PHOTOS} photos of your work`];
  return (
    <div className="mt-8 rounded-2xl border border-border p-5">
      <p className="mb-3 font-medium">What you&apos;ll need</p>
      <ul className="space-y-2 text-sm">
        {items.map((i) => (
          <li key={i} className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            {i}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Every listing is checked by our team before it goes live. Online payments are switched off during the beta.
      </p>
    </div>
  );
}

async function SignedIn({
  invite,
  inviteState,
  invitee,
  source,
  full,
  email,
}: {
  invite: string | null;
  inviteState: InviteState | null;
  invitee: { maskedEmail: string | null; firstName: string | null } | null;
  source: FoundingSource | null;
  full: boolean;
  email: string | null;
}) {
  const status = await getMyFoundingStatus();
  const application = status?.application ?? null;
  const listing = status?.listing ?? null;

  if (!application) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Claim your founding vendor place</h1>
        <p className="mb-6 text-muted-foreground">
          {listing
            ? `We'll use your existing listing, ${listing.name}, for your application. No need to sign up again.`
            : "Next you'll set up your business listing, then submit it for review."}
        </p>
        <InviteNotice state={inviteState} invitee={invitee} signedIn />
        {full && <FullNotice />}
        <ClaimButton invite={invite} source={source} label={listing ? "Apply with my listing" : "Claim my place"} />
        {email && <p className="mt-3 text-xs text-muted-foreground">Signed in as {email}.</p>}
        {!listing && <WhatYouNeed />}
      </>
    );
  }

  return <ApplicationStatusView application={application} listing={listing} checklist={status?.checklist ?? []} full={full} />;
}
