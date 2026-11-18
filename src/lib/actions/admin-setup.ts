"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/data/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/email";
import { packageRow, packageSchema, type PackageInput } from "@/lib/package-schema";
import { PORTFOLIO_BUCKET, isOwnPortfolioPath, portfolioFileError, portfolioMediaType, portfolioPath } from "@/lib/portfolio-media";
import { FINISH_PATH } from "@/lib/listing-completion";

// "Set it up for me" (done-with-you, R5): an admin adds photos and packages
// to a vendor's DRAFT listing from what the vendor sent, then tells them it
// is ready. The vendor checks it and submits it for review themselves, so
// nothing goes live without their approval. Writes use the service role
// (admins can't write another user's portfolio or packages through RLS), so
// every action checks the admin session (with MFA) and that the request is
// open and its listing still a draft.

export type AdminSetupState = { error?: string; success?: boolean } | null;
const PATH = "/admin/setup-requests";

async function requireAdmin() {
  const { session, admin, mfa } = await getAdminSession();
  return admin && mfa === "ok" ? session : null;
}

/** The open request and its draft listing, or an error. */
async function openRequest(requestId: unknown) {
  if (!(await requireAdmin())) return { error: "Not authorized." } as const;
  const db = createAdminClient();
  if (!db) return { error: "Not configured." } as const;
  if (typeof requestId !== "string" || !requestId) return { error: "Request not found." } as const;
  const { data: req } = await db
    .from("listing_setup_requests")
    .select("id, status, provider_id, user_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.status !== "open") return { error: "This request isn't open." } as const;
  const { data: listing } = await db
    .from("service_providers")
    .select("id, name, status, owner_user_id, owner_email")
    .eq("id", req.provider_id)
    .maybeSingle();
  if (!listing || listing.status !== "draft" || !listing.owner_user_id) {
    return { error: "The listing is no longer a draft, so the vendor manages it now." } as const;
  }
  return { db, req, listing, ownerId: listing.owner_user_id } as const;
}

export async function adminAddSetupPackage(requestId: string, input: PackageInput): Promise<AdminSetupState> {
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the package details." };
  if (parsed.data.extraHourPrice != null && parsed.data.includedHours == null) {
    return { error: "Extra hours only apply to packages with set hours." };
  }
  const r = await openRequest(requestId);
  if ("error" in r) return { error: r.error };
  const { error } = await r.db.from("vendor_packages").insert({ ...packageRow(parsed.data), provider_id: r.listing.id });
  if (error) return { error: /up to 12/.test(error.message) ? "A listing can have up to 12 packages." : "Couldn't save this package." };
  revalidatePath(PATH);
  return { success: true };
}

/** A one-time upload URL into the vendor's own portfolio folder. */
export async function adminSetupUploadUrl(
  requestId: string,
  file: { type: string; size: number },
): Promise<{ error?: string; path?: string; token?: string }> {
  const fileError = portfolioFileError(file);
  if (fileError) return { error: fileError };
  const r = await openRequest(requestId);
  if ("error" in r) return { error: r.error };
  const path = portfolioPath(r.ownerId, r.listing.id, file.type);
  const { data, error } = await r.db.storage.from(PORTFOLIO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Couldn't start the upload." };
  return { path, token: data.token };
}

export async function adminAddSetupPhoto(requestId: string, item: { path: string; type: string }): Promise<AdminSetupState> {
  const r = await openRequest(requestId);
  if ("error" in r) return { error: r.error };
  const mediaType = portfolioMediaType(item.type);
  if (!mediaType || !isOwnPortfolioPath(item.path, r.ownerId, r.listing.id, item.type)) return { error: "That file can't be added." };

  // The object must really be there, with the type and size we allow.
  const folder = item.path.slice(0, item.path.lastIndexOf("/"));
  const name = item.path.slice(item.path.lastIndexOf("/") + 1);
  const { data: objects } = await r.db.storage.from(PORTFOLIO_BUCKET).list(folder, { search: name, limit: 1 });
  const object = objects?.find((o) => o.name === name);
  const size = Number(object?.metadata?.size ?? NaN);
  const storedType = String(object?.metadata?.mimetype ?? "");
  if (!object || storedType !== item.type || Number.isNaN(size) || portfolioFileError({ type: storedType, size })) {
    if (object) await r.db.storage.from(PORTFOLIO_BUCKET).remove([item.path]);
    return { error: "Upload didn't finish or the file isn't allowed." };
  }
  const {
    data: { publicUrl },
  } = r.db.storage.from(PORTFOLIO_BUCKET).getPublicUrl(item.path);
  // owner_email decides owner_user_id (sync_user_ids trigger), so it must be the vendor's.
  if (!r.listing.owner_email) return { error: "This listing has no owner email." };
  const { error } = await r.db.from("portfolio_items").insert({
    provider_id: r.listing.id,
    owner_email: r.listing.owner_email,
    media_type: mediaType,
    media_url: publicUrl,
  });
  if (error) return { error: "Couldn't add this photo." };
  revalidatePath(PATH);
  return { success: true };
}

/** Tell the vendor their listing is ready to check and submit. */
export async function adminMarkSetupReady(requestId: string, note?: string): Promise<AdminSetupState> {
  const r = await openRequest(requestId);
  if ("error" in r) return { error: r.error };
  const adminNote = note?.trim().slice(0, 1000) || null;
  const { error } = await r.db
    .from("listing_setup_requests")
    .update({ status: "ready", admin_note: adminNote, updated_at: new Date().toISOString() })
    .eq("id", r.req.id);
  if (error) return { error: "Couldn't update the request." };

  const { data: found } = await r.db.auth.admin.getUserById(r.ownerId);
  notify({
    to: found?.user?.email ?? r.listing.owner_email,
    category: "bookings",
    subject: `Your ${r.listing.name} listing is ready to check`,
    heading: "We've set up your listing",
    lines: [
      `We've added the photos and packages you sent to ${r.listing.name}. Have a look, change anything you like, then press "Submit for review".`,
      "Nothing goes live until you submit it.",
    ],
    quote: adminNote,
    cta: { label: "Check my listing", path: FINISH_PATH },
  });
  revalidatePath(PATH);
  return { success: true };
}

export async function adminCloseSetupRequest(requestId: string): Promise<AdminSetupState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const db = createAdminClient();
  if (!db || typeof requestId !== "string") return { error: "Request not found." };
  const { error } = await db
    .from("listing_setup_requests")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { error: "Couldn't close the request." };
  revalidatePath(PATH);
  return { success: true };
}
