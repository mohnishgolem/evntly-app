import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? null;

  return { user, profile, displayName };
}

// Gate for vendor-only pages: logged-out visitors go to login (and come back
// afterwards); logged-in users without a listing go to /vendor-dashboard,
// which offers to create one. A "vendor" is anyone who owns a listing, in
// any review status.
export async function requireVendor(path: string) {
  const session = await getCurrentUser();
  if (!session) redirect(`/login?next=${encodeURIComponent(path)}`);

  const supabase = await createClient();
  const { data: listing } = await supabase
    .rpc("my_service_providers")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!listing) redirect("/vendor-dashboard");

  return session;
}

// Admin access needs the admin role AND a session verified with a second
// factor (aal2). Admins without an authenticator are sent to set one up.
// ADMIN_MFA_OPTIONAL=true is an emergency escape hatch only (e.g. if TOTP is
// ever disabled on the Supabase project) — leave it unset in production.
export async function getAdminSession() {
  const session = await getCurrentUser();
  if (!session || session.profile?.role !== "admin") return { session, admin: false, mfa: "n/a" as const };

  if (process.env.ADMIN_MFA_OPTIONAL === "true") return { session, admin: true, mfa: "ok" as const };

  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfa =
    aal?.currentLevel === "aal2"
      ? ("ok" as const)
      : aal?.nextLevel === "aal2"
        ? ("needs-verify" as const)
        : ("needs-enrol" as const);
  return { session, admin: true, mfa };
}
