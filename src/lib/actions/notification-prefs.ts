"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_KEYS, normalisePrefs, type NotificationPrefs } from "@/lib/notification-prefs";

export type PrefsState = { error?: string; success?: boolean } | null;

const row = z.object(Object.fromEntries(CATEGORY_KEYS.map((k) => [k, z.boolean()])) as Record<(typeof CATEGORY_KEYS)[number], z.ZodBoolean>).strict();
const prefsSchema = z.object({ email: row, push: row }).strict();

/** Saves the caller's own preferences (RLS: own row only). Locked switches are forced back on. */
export async function saveNotificationPreferences(input: NotificationPrefs): Promise<PrefsState> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { error: "Check your notification settings." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, prefs: normalisePrefs(parsed.data), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { error: "Couldn't save your notification settings." };
  revalidatePath("/dashboard/settings/notifications");
  return { success: true };
}
