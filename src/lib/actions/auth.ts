"use server";

import { revalidatePath } from "next/cache";
import { TERMS_VERSION } from "@/lib/config";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { LEGACY_SITE_URL, SITE_URL } from "@/lib/config";
import { safeNextPath } from "@/lib/safe-redirect";
import { checkRateLimit, clientIp, RATE_LIMIT_ERROR } from "@/lib/rate-limit";

// Origin for links Supabase emails or redirects to (OAuth callback, password
// reset). Taken from the request only when it's one of ours — never echo an
// arbitrary Origin/Host into a link that lands in someone's inbox.
async function appOrigin() {
  const origin = (await headers()).get("origin");
  const trusted = new Set(
    [
      SITE_URL,
      LEGACY_SITE_URL,
      "http://localhost:3000",
      process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
      process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
    ].filter(Boolean)
  );
  return origin && trusted.has(origin) ? origin : SITE_URL;
}

const signupSchema = z.object({
  fullName: z.string().min(2, "Enter your name"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["customer", "vendor"]),
  agreedToTerms: z
    .string()
    .refine((v) => v === "on", "You must agree to the Terms & Conditions"),
});

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  needsEmailConfirmation?: boolean;
  success?: boolean;
} | null;

export async function signup(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") ?? "customer",
    agreedToTerms: formData.get("agreedToTerms"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { fullName, email, password, role } = parsed.data;
  // Customers go back to where they started (the vendor they wanted a quote
  // from, or /dashboard to claim a plan from /plan); vendors set up a listing.
  const next =
    role === "vendor" ? "/vendor-signup" : safeNextPath(formData.get("next")?.toString(), "/");
  if (!(await checkRateLimit("signupIp", await clientIp()))) {
    return { error: RATE_LIMIT_ERROR };
  }
  const supabase = await createClient();
  // The confirmation link goes through /auth/callback, which exchanges its
  // one-time code for a session — linking to the bare site left people
  // confirmed but signed out, with no message.
  const confirmUrl = new URL("/auth/callback", await appOrigin());
  confirmUrl.searchParams.set("flow", "signup");
  confirmUrl.searchParams.set("next", next);

  // full_name lives in Supabase Auth's user_metadata — the existing `users`
  // table (inherited from the prior schema) has no name column of its own.
  // The public.users row itself is created by the on_auth_user_created DB
  // trigger (security definer), so it works even before email confirmation.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // terms_version: they ticked the Terms box; the new-user trigger records
    // it with a server-side timestamp.
    options: {
      data: { full_name: fullName, role, terms_version: TERMS_VERSION },
      emailRedirectTo: confirmUrl.toString(),
    },
  });

  if (error) {
    return { error: error.message };
  }

  // When email confirmation is required, signUp succeeds but returns no
  // session — redirecting to a protected page would just bounce the user
  // to /login with no explanation. Tell them to check their inbox instead.
  if (!data.session) {
    return { needsEmailConfirmation: true };
  }

  redirect(next);
}

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function login(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const [ipOk, emailOk] = await Promise.all([
    checkRateLimit("loginIp", await clientIp()),
    checkRateLimit("loginEmail", parsed.data.email),
  ]);
  if (!ipOk || !emailOk) return { error: RATE_LIMIT_ERROR };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Incorrect email or password." };
  }

  const next = safeNextPath(formData.get("next")?.toString());

  // Accounts with an authenticator app enrolled must finish a second step
  // before the session is upgraded to aal2 (required for admin actions).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    redirect(`/login/mfa?next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

// role is only forced on brand-new sign-ups (from the signup form's
// customer/vendor toggle) — the login form omits it so a returning vendor's
// role is never stomped back to "customer" by the callback route.
export async function signInWithOAuth(
  provider: "google" | "apple",
  role?: "customer" | "vendor",
  next?: string
) {
  const supabase = await createClient();
  const origin = await appOrigin();
  const callback = new URL(`${origin}/auth/callback`);
  if (role) callback.searchParams.set("role", role);
  // The callback follows `next` before it handles role=vendor, so vendors
  // never get one — they still need to land on /vendor-signup.
  if (next && role !== "vendor") callback.searchParams.set("next", safeNextPath(next));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callback.toString() },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Could not start sign-in.")}`);
  }
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email"),
});

export async function requestPasswordReset(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Silently drop over-limit requests: same "success" response either way,
  // so the form can't be used to spam someone's inbox or probe accounts.
  const [ipOk, emailOk] = await Promise.all([
    checkRateLimit("passwordResetIp", await clientIp()),
    checkRateLimit("passwordResetEmail", parsed.data.email),
  ]);
  if (!ipOk || !emailOk) return { success: true };

  const supabase = await createClient();
  const origin = await appOrigin();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Always report success regardless of whether the email has an account —
  // don't let this form be used to check which emails are registered.
  return { success: true };
}

const updatePasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function updatePassword(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = updatePasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

// Records acceptance of the current Terms (Google sign-ins, accounts from
// before acceptance was recorded, and everyone after a Terms update).
export async function acceptCurrentTerms(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
  if (error) return { error: "Couldn't save that. Please try again." };
  revalidatePath("/", "layout");
  return {};
}
