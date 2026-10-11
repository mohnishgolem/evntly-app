import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      if (next) {
        return NextResponse.redirect(`${origin}${next}`);
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
