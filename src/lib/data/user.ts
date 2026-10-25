import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// cache(): the header, the Terms prompt and the page all ask for the session
// on the same request — fetch it once.
//
// The session comes from getClaims(): the JWT is verified locally against
// the project's signing keys (ES256, cached in memory), so no round-trip to
// Supabase Auth before the profile query. Only id, email and user_metadata
// are read from it.
export const getCurrentUser = cache(async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) return null;

  const user = {
    id: claims.sub,
    email: claims.email,
    user_metadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
  };

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    (user.user_metadata.full_name as string | undefined) ?? null;

  return { user, profile, displayName };
});

// Unread message count for the signed-in user, shared by the header and
// the vendor/admin sidebars on the same request. 0 when signed out.
export const getUnreadMessageCount = cache(async function getUnreadMessageCount() {
  const session = await getCurrentUser();
  if (!session) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_unread_message_count");
  return data ?? 0;
});

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
export const getAdminSession = cache(async function getAdminSession() {
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
});

// Gate for every /admin page. Each page calls this itself: the admin layout
// only draws navigation, and a layout isn't re-run when moving between
// pages client-side, so it can't be the security boundary.
export async function requireAdminPage(path: string) {
  const { session, admin, mfa } = await getAdminSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!admin) redirect("/");
  if (mfa === "needs-verify") redirect(`/login/mfa?next=${encodeURIComponent(path)}`);
  return { session, needsEnrol: mfa === "needs-enrol" };
}
