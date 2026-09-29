"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: boolean } | null;

export async function uploadPortfolioItem(
  providerId: string,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const file = formData.get("file") as File | null;
  const caption = String(formData.get("caption") ?? "");
  if (!file || file.size === 0) return { error: "Choose a photo first." };

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${user.id}/${providerId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("portfolio")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return { error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("portfolio").getPublicUrl(path);

  const { error } = await supabase.from("portfolio_items").insert({
    provider_id: providerId,
    owner_email: user.email,
    media_type: "image",
    media_url: publicUrl,
    caption: caption || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/vendor-dashboard/portfolio");
  return { success: true };
}

export async function deletePortfolioItem(itemId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { error } = await supabase
    .from("portfolio_items")
    .delete()
    .eq("id", itemId)
    .eq("owner_email", user.email);

  if (error) return { error: error.message };

  revalidatePath("/vendor-dashboard/portfolio");
  return { success: true };
}
