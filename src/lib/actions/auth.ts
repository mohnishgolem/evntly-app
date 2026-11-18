"use server";

import { recordFunnelEvent } from "@/lib/funnel-events";
import { EXISTING_ACCOUNT_MESSAGE } from "@/lib/auth-notices";
import { recordVendorRegistration } from "@/lib/meta-capi";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { LEGACY_SITE_URL, SITE_URL } from "@/lib/config";
import { safeNextPath } from "@/lib/safe-redirect";
import { parseConfirmLink } from "@/lib/auth-links";
import { checkRateLimit, clientIp, RATE_LIMIT_ERROR } from "@/lib/rate-limit";
import { isFoundingPath } from "@/lib/founding/sources";
import { recordSignupConsents } from "@/lib/actions/legal";

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
    .string({ error: "You must agree to the Terms & Conditions to create an account" })
    .refine((v) => v === "on", "You must agree to the Terms & Conditions to create an account"),
  // Vendors only (checked below): the Vendor Service Agreement + fee schedule.
  agreedToVendorAgreement: z.string().nullable(),
  // Optional and unticked by default; separate from the Terms.
  marketingOptIn: z.string().nullable(),
});

const WEAK_PASSWORD_MESSAGE =
  "That password has shown up in a data breach, so it isn't safe to use. Try a longer one, like three random words.";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  needsEmailConfirmation?: boolean;
  /** Set with needsEmailConfirmation: where the code form posts back to. */
  email?: string;
  next?: string;
  /** Code form: a fresh code was sent. */
  resent?: boolean;
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
    agreedToTerms: formData.get("agreedToTerms") ?? undefined,
    agreedToVendorAgreement: formData.get("agreedToVendorAgreement"),
    marketingOptIn: formData.get("marketingOptIn"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { fullName, email, password, role } = parsed.data;
  if (role === "vendor" && parsed.data.agreedToVendorAgreement !== "on") {
    return { fieldErrors: { agreedToVendorAgreement: ["You must agree to the Vendor Service Agreement to list a business"] } };
  }
  const marketing = parsed.data.marketingOptIn === "on";
  // Customers go back to where they started (the vendor they wanted a quote
  // from, or /dashboard to claim a plan from /plan); vendors set up a listing.
  // Founding-vendor sign-ups return to their claim page instead.
  const requested = safeNextPath(formData.get("next")?.toString(), "/");
  const next = role === "vendor" ? (isFoundingPath(requested) ? requested : "/vendor-signup") : requested;
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
    // Acceptance isn't sent in auth metadata (the client controls that);
    // it's recorded below through the service role, after validation.
    options: {
      data: { full_name: fullName, role },
      emailRedirectTo: confirmUrl.toString(),
    },
  });

  if (error) {
    if (role === "vendor") await recordFunnelEvent("signup_error", { detail: error.code ?? "unknown" });
    // Supabase rejects passwords found in known data breaches (leaked
    // password protection). Show it on the password field, in plain words.
    if (error.code === "weak_password") {
      return { fieldErrors: { password: [WEAK_PASSWORD_MESSAGE] } };
    }
    return { error: error.message };
  }

  // Supabase answers an already-registered email with a user but no
  // identities, and sends no email. Without saying so here, people wait for a
  // code that never arrives (seen in production QA on 17 Nov 2026, with an
  // account first made through Google). Point them at logging in instead.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    if (role === "vendor") await recordFunnelEvent("signup_error", { detail: "existing_account" });
    return { fieldErrors: { email: [EXISTING_ACCOUNT_MESSAGE] } };
  }

  if (data.user) await recordSignupConsents(data.user.id, role, marketing);
  if (role === "vendor" && data.user) {
    await recordFunnelEvent("account_created", { detail: "email" });
  }

  // When email confirmation is required, signUp succeeds but returns no
  // session — redirecting to a protected page would just bounce the user
  // to /login with no explanation. Tell them to check their inbox instead.
  if (!data.session) {
    return { needsEmailConfirmation: true, email, next };
  }

  redirect(next);
}

// ---------------------------------------------------------------------------
// Sign-up confirmation by code
//
// The confirmation email carries a one-time code as well as the link. Typing
// the code here confirms the email *in this browser*, so a vendor who signed
// up inside Instagram's or Facebook's built-in browser stays signed in there.
// (The link opens in Mail/Safari instead, without this browser's session, and
// lands on the log-in page.) The code only works for the email it was sent
// to, expires (Supabase Auth's OTP expiry), and is rate-limited per visitor
// and per email on top of Supabase's own limits.
// ---------------------------------------------------------------------------

const codeSchema = z.object({
  email: z.email("Enter the email you signed up with"),
  // Supabase sends 6 digits by default (configurable up to 10).
  code: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => /^\d{6,10}$/.test(v), "Enter the code from the email (numbers only)"),
});

// Supabase Auth answers a wrong code and an expired one the same way
// ("Token has expired or is invalid"), so one message covers both. The link
// and the code in the email share one token: once the link has been opened
// (by the person, or by an email security scanner), the code stops working
// although the email is already confirmed, so say that too.
const CODE_FAILED =
  "That code didn't work or has expired. If you already tapped the link in the email, your email is confirmed: log in instead. Otherwise check the newest email, or send a new code below.";

/** Where a newly confirmed account goes: their founding claim page, the listing set-up, or `next`. */
function afterConfirmPath(rawNext: string | undefined, role: unknown): string {
  const requested = safeNextPath(rawNext, "/");
  if (role === "vendor") return isFoundingPath(requested) ? requested : "/vendor-signup";
  return requested;
}

export async function verifySignupCode(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const rawEmail = formData.get("email")?.toString() ?? "";
  const next = formData.get("next")?.toString() || undefined;
  const keep = { needsEmailConfirmation: true, email: rawEmail, next } as const;

  const parsed = codeSchema.safeParse({ email: rawEmail, code: formData.get("code")?.toString() ?? "" });
  if (!parsed.success) return { ...keep, fieldErrors: parsed.error.flatten().fieldErrors };
  const { email, code } = parsed.data;

  const [ipOk, emailOk] = await Promise.all([
    checkRateLimit("signupCodeIp", await clientIp()),
    checkRateLimit("signupCodeEmail", email),
  ]);
  if (!ipOk || !emailOk) return { ...keep, error: RATE_LIMIT_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session) {
    return { ...keep, fieldErrors: { code: [CODE_FAILED] } };
  }

  const role = data.user?.user_metadata?.role;
  const destination = afterConfirmPath(next, role);
  if (role === "vendor") {
    await recordFunnelEvent("email_confirmed", { detail: "code" });
    // Meta measurement (only with this browser's consent; see lib/meta-capi.ts).
    if (data.user) await recordVendorRegistration(data.user, new URL(destination, SITE_URL).toString());
  }
  redirect(destination);
}

/** Sends a fresh sign-up code (and link). Rate limited per IP and email. */
async function sendSignupCode(email: string, next: string | undefined): Promise<{ error?: string }> {
  const [ipOk, emailOk] = await Promise.all([
    checkRateLimit("signupResendIp", await clientIp()),
    checkRateLimit("signupResendEmail", email),
  ]);
  if (!ipOk || !emailOk) return { error: RATE_LIMIT_ERROR };

  const supabase = await createClient();
  const confirmUrl = new URL("/auth/callback", await appOrigin());
  confirmUrl.searchParams.set("flow", "signup");
  confirmUrl.searchParams.set("next", safeNextPath(next, "/"));
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: confirmUrl.toString() },
  });
  // Don't reveal whether the address has an account: only rate limits and
  // outages are reported, every other answer looks like a send.
  if (error && (error.status === 429 || (error.status ?? 0) >= 500)) {
    return { error: "We couldn't send a new code just now. Please wait a minute and try again." };
  }
  return {};
}

export async function resendSignupCode(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const rawEmail = formData.get("email")?.toString() ?? "";
  const next = formData.get("next")?.toString() || undefined;
  const keep = { needsEmailConfirmation: true, email: rawEmail, next } as const;

  const parsed = z.email().safeParse(rawEmail);
  if (!parsed.success) return { ...keep, error: "Enter the email you signed up with." };

  const sent = await sendSignupCode(parsed.data, next);
  return sent.error ? { ...keep, error: sent.error } : { ...keep, resent: true };
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
    // Right password, email never confirmed (e.g. they closed the code
    // screen): send a fresh code and show the code form, instead of
    // "Incorrect email or password", which left them stuck (17 Nov). Supabase
    // only returns this after the password matched, so it reveals nothing.
    if (error.code === "email_not_confirmed") {
      const next = formData.get("next")?.toString() || undefined;
      const sent = await sendSignupCode(parsed.data.email, next);
      return { needsEmailConfirmation: true, email: parsed.data.email, next, resent: !sent.error, error: sent.error };
    }
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
  // Vendors land on /vendor-signup unless they came from the founding-vendor
  // claim page (the callback sets their role first either way).
  if (next && (role !== "vendor" || isFoundingPath(safeNextPath(next)))) callback.searchParams.set("next", safeNextPath(next));

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

// ---------------------------------------------------------------------------
// Email links (sign-up confirmation, password reset) — /auth/confirm
// ---------------------------------------------------------------------------

/**
 * The person pressed Continue on /auth/confirm: only now is the one-time
 * token used (see lib/auth-links.ts for why it isn't used on page load).
 * verifyOtp with the token hash signs them in on this browser, whichever
 * device asked for the email.
 */
export async function confirmEmailLink(formData: FormData): Promise<void> {
  const link = parseConfirmLink({
    token_hash: formData.get("token_hash")?.toString(),
    type: formData.get("type")?.toString(),
    next: formData.get("next")?.toString() || undefined,
  });
  if (!link) redirect("/login?notice=signin-failed");

  if (!(await checkRateLimit("emailLinkIp", await clientIp()))) redirect("/login?notice=signin-failed");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
  const recovery = link.type === "recovery";
  const back = !recovery && link.next ? `&next=${encodeURIComponent(link.next)}` : "";

  if (error || !data.user) {
    redirect(`/login?notice=${recovery ? "link-expired" : "signup-link-used"}${back}`);
  }

  if (recovery) redirect("/reset-password");

  const role = data.user.user_metadata?.role;
  const destination = afterConfirmPath(link.next ?? undefined, role);
  if (role === "vendor") {
    await recordFunnelEvent("email_confirmed", { detail: "link" });
    // Meta measurement (only with this browser's consent; see lib/meta-capi.ts).
    await recordVendorRegistration(data.user, new URL(destination, SITE_URL).toString());
  }
  redirect(destination);
}
