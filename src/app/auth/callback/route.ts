import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase redirects here after a Google/Apple OAuth sign-in with a one-time
// `code` to exchange for a session. `role` is only present when the signup
// form's vendor toggle was selected — see signInWithOAuth in lib/actions/auth.ts.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const role = searchParams.get("role");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
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
