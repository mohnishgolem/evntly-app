"use server";

import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_KEY, type OnboardingStatus } from "@/lib/onboarding";

export type ActionState = { error?: string; success?: boolean } | null;

// Records that the walkthrough was finished or skipped, so it doesn't open
// on its own again (it can still be replayed from Help & Guides).
export async function saveOnboardingStatus(status: OnboardingStatus): Promise<ActionState> {
  // Server actions take whatever the browser sends; only known values.
  if (status !== "completed" && status !== "skipped") return { error: "Unknown status." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Auth merges `data` into the existing metadata, so full_name and role
  // are kept.
  const { error } = await supabase.auth.updateUser({
    data: { [ONBOARDING_KEY]: { status, at: new Date().toISOString() } },
  });
  if (error) return { error: "Couldn't save that. It won't affect anything else." };

  // The header reads metadata from the session token (getClaims), which
  // still carries the old copy until it's refreshed.
  await supabase.auth.refreshSession();
  return { success: true };
}
