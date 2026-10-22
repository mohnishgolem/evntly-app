"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/data/user";

export type MatchingSettingsState = { error?: string; success?: boolean } | null;

const weight = z.number().min(0).max(100);
const settingsSchema = z
  .object({
    enabled: z.boolean(),
    weights: z.object({ suitability: weight, budget: weight, quality: weight, location: weight, reliability: weight }),
  })
  .refine((s) => Object.values(s.weights).some((w) => w > 0), "At least one weight must be above zero.");

export type MatchingSettingsInput = z.input<typeof settingsSchema>;

/**
 * Turn matching on/off and set its weights. Gated here for a clean error,
 * and again in admin_set_matching_settings (is_admin() requires aal2),
 * which also validates and writes the audit log entry.
 */
export async function setMatchingSettings(input: MatchingSettingsInput): Promise<MatchingSettingsState> {
  const { admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") return { error: "Not authorized." };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the weights." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_matching_settings", {
    p_enabled: parsed.data.enabled,
    p_weights: parsed.data.weights,
  });
  if (error) return { error: error.message.startsWith("Weight") ? error.message : "Couldn't save the matching settings." };
  revalidatePath("/admin/matching");
  return { success: true };
}
