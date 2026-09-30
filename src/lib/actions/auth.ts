"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();

  // full_name lives in Supabase Auth's user_metadata — the existing `users`
  // table (inherited from the prior schema) has no name column of its own.
  // The public.users row itself is created by the on_auth_user_created DB
  // trigger (security definer), so it works even before email confirmation.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role } },
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

  redirect(role === "vendor" ? "/vendor-signup" : "/dashboard");
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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Incorrect email or password." };
  }

  redirect("/dashboard");
}

// role is only forced on brand-new sign-ups (from the signup form's
// customer/vendor toggle) — the login form omits it so a returning vendor's
// role is never stomped back to "customer" by the callback route.
export async function signInWithOAuth(provider: "google" | "apple", role?: "customer" | "vendor") {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const callback = new URL(`${origin}/auth/callback`);
  if (role) callback.searchParams.set("role", role);

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
