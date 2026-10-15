"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { checkRateLimit, RATE_LIMIT_ERROR } from "@/lib/rate-limit";

// Two-factor authentication with an authenticator app (TOTP), using Supabase
// Auth's built-in MFA — no custom crypto. Verifying a code upgrades the
// session to aal2, which admin actions require (see requireAdmin).

export type MfaState = { error?: string; success?: boolean } | null;

const codeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your app.");

export type TotpEnrollment = { factorId: string; qrCode: string; secret: string } | { error: string };

export async function startTotpEnrollment(): Promise<TotpEnrollment> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Clear out abandoned (never verified) enrolments so retries don't pile up
  // or collide on the friendly name.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { error: error?.message ?? "Could not start setup." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

async function verifyCode(factorId: string, rawCode: string): Promise<MfaState> {
  const parsed = codeSchema.safeParse(rawCode);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Log in again." };
  if (!(await checkRateLimit("mfaVerifyUser", user.id))) return { error: RATE_LIMIT_ERROR };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data });
  if (error) return { error: "That code didn't work. Check your app and try again." };
  return { success: true };
}

export async function confirmTotpEnrollment(factorId: string, code: string): Promise<MfaState> {
  const result = await verifyCode(factorId, code);
  if (result?.success) revalidatePath("/profile/security");
  return result;
}

// Second step of login for accounts with a verified authenticator.
export async function verifyLoginMfa(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) return { error: "No authenticator app is set up on this account." };

  const result = await verifyCode(factor.id, String(formData.get("code") ?? ""));
  if (!result?.success) return result;
  redirect(safeNextPath(formData.get("next")?.toString()));
}

export async function removeTotpFactor(factorId: string): Promise<MfaState> {
  const supabase = await createClient();
  // Removing a factor needs a fresh second factor (aal2) — otherwise a
  // stolen password alone could switch MFA off.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return { error: "Verify with your authenticator app first (log out and back in)." };
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: error.message };
  revalidatePath("/profile/security");
  return { success: true };
}
