"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PORTFOLIO_BUCKET,
  isOwnPortfolioPath,
  portfolioFileError,
  portfolioMediaType,
  portfolioPathFromUrl,
} from "@/lib/portfolio-media";

export type ActionState = { error?: string; success?: boolean } | null;

// The browser uploads the file straight to storage (server actions cap
// request bodies at 1 MB, and videos are far bigger), then calls this to
// record it. Storage policies only let users write under their own user-id
// folder; here we also check the listing is theirs, the path is the one we
// expect for it, and the object really exists with an allowed type and size.
export async function addPortfolioItem(
  providerId: string,
  item: { path: string; type: string; caption?: string }
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const caption = (item.caption ?? "").trim();
  if (caption.length > 300) return { error: "That caption is too long." };
  const mediaType = portfolioMediaType(item.type);
  if (!mediaType || !isOwnPortfolioPath(item.path, user.id, providerId, item.type)) {
    return { error: "That file can't be added." };
  }

  const { data: ownListing } = await supabase
    .rpc("my_service_providers")
    .select("id")
    .eq("id", providerId)
    .maybeSingle();
  if (!ownListing) return { error: "You can only add photos to your own listing." };

  const folder = item.path.slice(0, item.path.lastIndexOf("/"));
  const name = item.path.slice(item.path.lastIndexOf("/") + 1);
  const { data: objects } = await supabase.storage
    .from(PORTFOLIO_BUCKET)
    .list(folder, { search: name, limit: 1 });
  const object = objects?.find((o) => o.name === name);
  const size = Number(object?.metadata?.size ?? NaN);
  const storedType = String(object?.metadata?.mimetype ?? "");
  if (!object || storedType !== item.type || Number.isNaN(size)) {
    return { error: "Upload didn't finish. Try again." };
  }
  const sizeError = portfolioFileError({ type: storedType, size });
  if (sizeError) {
    await supabase.storage.from(PORTFOLIO_BUCKET).remove([item.path]);
    return { error: sizeError };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(item.path);

  const { error } = await supabase.from("portfolio_items").insert({
    provider_id: providerId,
    owner_email: user.email,
    media_type: mediaType,
    media_url: publicUrl,
    caption: caption || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/vendor-dashboard/portfolio");
  revalidatePath("/vendor-dashboard");
  revalidatePath(`/vendor/${providerId}`);
  return { success: true };
}

export async function deletePortfolioItem(itemId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { data: deleted, error } = await supabase
    .from("portfolio_items")
    .delete()
    .eq("id", itemId)
    .eq("owner_user_id", user.id)
    .select("provider_id, media_url");

  if (error) return { error: error.message };

  // Remove the file too, so deleted photos and videos stop being publicly
  // reachable. Only paths inside the caller's own folder (storage policies
  // enforce that as well); a failure here leaves an orphan, not an error.
  const item = deleted?.[0];
  const path = item?.media_url ? portfolioPathFromUrl(item.media_url) : null;
  if (path?.startsWith(`${user.id}/`)) {
    const { error: removeError } = await supabase.storage.from(PORTFOLIO_BUCKET).remove([path]);
    if (removeError) console.error("[portfolio] file not removed:", removeError.message);
  }

  revalidatePath("/vendor-dashboard/portfolio");
  if (item?.provider_id) revalidatePath(`/vendor/${item.provider_id}`);
  return { success: true };
}
