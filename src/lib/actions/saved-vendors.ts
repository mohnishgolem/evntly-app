"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; saved?: boolean } | null;

export async function toggleSavedVendor(vendorId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You need to be logged in to save vendors." };

  const { data: profile } = await supabase
    .from("users")
    .select("saved_providers")
    .eq("id", user.id)
    .maybeSingle();

  const current = profile?.saved_providers ?? [];
  const isSaved = current.includes(vendorId);
  const next = isSaved ? current.filter((id) => id !== vendorId) : [...current, vendorId];

  const { error } = await supabase
    .from("users")
    .update({ saved_providers: next })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/saved");
  revalidatePath("/profile");
  revalidatePath("/explore");
  revalidatePath("/");
  return { saved: !isSaved };
}
