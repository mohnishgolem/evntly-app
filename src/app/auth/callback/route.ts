import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

// Supabase redirects here after a Google/Apple OAuth sign-in, or after a
// password-recovery email link, with a one-time `code` to exchange for a
// session. `role` is only present when the signup form's vendor toggle was
// selected — see signInWithOAuth in lib/actions/auth.ts. `next` is only
// present for the password-recovery flow — see requestPasswordReset.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const role = searchParams.get("role");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // OAuth sign-ins on accounts with an authenticator still need the code.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        return NextResponse.redirect(`${origin}/login/mfa?next=${encodeURIComponent(safeNextPath(next))}`);
      }
      if (next) {
        // `next` comes from the URL, so only same-site paths are honoured —
        // see safeNextPath (blocks e.g. next=@evil.com → https://site@evil.com).
        return NextResponse.redirect(`${origin}${safeNextPath(next)}`);
      }
      if (role === "vendor") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("users").update({ role: "vendor" }).eq("id", user.id);
        }
        return NextResponse.redirect(`${origin}/vendor-signup`);
      }
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Could not sign in.")}`);
}
