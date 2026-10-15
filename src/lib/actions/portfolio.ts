"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: boolean } | null;

// Raster images only — no SVG (can carry script) and no other types, since
// portfolio files are served from a public bucket. Mirrors the bucket's
// allowed_mime_types; both are enforced.
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"]);
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic",
};
const MAX_PORTFOLIO_BYTES = 10 * 1024 * 1024;

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
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: "Upload a JPG, PNG, WEBP, GIF or HEIC image." };
  }
  if (file.size > MAX_PORTFOLIO_BYTES) {
    return { error: "That image is over 10 MB." };
  }

  // Extension derived from the (allow-listed) MIME type, not the filename.
  const ext = EXT_BY_TYPE[file.type];
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
    .eq("owner_user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/vendor-dashboard/portfolio");
  return { success: true };
}
