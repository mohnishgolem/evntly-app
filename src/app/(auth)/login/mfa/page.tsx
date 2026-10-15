import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { MfaCodeForm } from "@/components/auth/mfa-code-form";

export const metadata: Metadata = {
  title: "Two-factor verification",
  description: "Enter the code from your authenticator app.",
};

export default async function LoginMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2" || aal?.nextLevel !== "aal2") redirect(next);

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">Two-factor verification</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter the 6-digit code from your authenticator app to finish logging in.
      </p>
      <MfaCodeForm next={next} />
    </div>
  );
}
