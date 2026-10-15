import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { TotpSetup } from "@/components/totp-setup";

export const metadata: Metadata = {
  title: "Security",
  description: "Two-factor authentication for your Evntly account.",
};

export default async function SecurityPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/profile/security");

  const supabase = await createClient();
  const [{ data: factors }, { data: aal }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const factor = factors?.totp?.[0] ?? null;
  const isAdmin = session.profile?.role === "admin";

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/profile"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Profile
      </Link>
      <h1 className="mb-1 text-[28px] font-bold tracking-tight">Security</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Two-factor authentication asks for a code from an authenticator app (like Google
        Authenticator, 1Password or Authy) each time you log in.
        {isAdmin && " It's required to use the admin dashboard."}
      </p>

      <div className="rounded-2xl bg-secondary p-5">
        {factor ? (
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.75} />
            <div className="flex-1">
              <p className="font-semibold">Two-factor authentication is on</p>
              <p className="text-sm text-muted-foreground">
                {factor.friendly_name ?? "Authenticator app"} · added{" "}
                {new Date(factor.created_at).toLocaleDateString("en-AU")}
              </p>
              <TotpSetup
                mode="remove"
                factorId={factor.id}
                verifiedThisSession={aal?.currentLevel === "aal2"}
              />
            </div>
          </div>
        ) : (
          <TotpSetup mode="enroll" />
        )}
      </div>
    </div>
  );
}
