"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/data/user";
import { SITE_URL } from "@/lib/config";
import { parseDraft } from "@/lib/vendor-journey/draft";
import { claimPath, draftExpiry, draftsDb, newDraftToken } from "@/lib/vendor-journey/server";

// Assisted listing drafts: our team prepares a PRIVATE draft for a business
// owner who has said yes to us doing so (in person, by phone, by DM or by
// email), then gives them a claim link to review, edit, verify and approve.
//
// Guardrails:
//   * admins with MFA only;
//   * the owner's permission must be recorded (who, how, when) and the
//     email they want to use; only that verified email can turn it into a
//     listing (pendingDraftFor);
//   * nothing is sent from here. The admin copies the link and sends it
//     themselves, so every first contact stays personal and approved;
//   * a draft is never public. Once claimed it is an ordinary draft listing
//     that the owner submits and an admin approves, as before.

const PATH = "/admin/vendor-drafts";
export type AdminDraftState = { error?: string; link?: string; success?: boolean } | null;

async function requireAdmin() {
  const { session, admin, mfa } = await getAdminSession();
  return admin && mfa === "ok" ? session : null;
}

const createSchema = z.object({
  email: z.email("Enter the email the owner wants to use.").max(254),
  permissionNote: z
    .string()
    .trim()
    .min(10, "Say how the owner gave permission (e.g. 'Phone call with Jess, 24 Nov, happy for us to draft it').")
    .max(1000),
  permissionDate: z.iso.date("Pick the date they gave permission."),
  confirmPermission: z.literal(true, { error: "Confirm the owner said yes to us preparing a draft." }),
});

function linkFor(token: string) {
  return `${SITE_URL}${claimPath(token)}`;
}

export async function adminCreateAssistedDraft(input: {
  draft: unknown;
  email: string;
  permissionNote: string;
  permissionDate: string;
  confirmPermission: boolean;
}): Promise<AdminDraftState> {
  const session = await requireAdmin();
  if (!session) return { error: "Not authorized." };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const draft = parseDraft(input.draft);
  if (!draft.serviceType || draft.businessName.trim().length < 2) return { error: "Add at least the category and business name." };
  if (new Date(parsed.data.permissionDate).getTime() > Date.now() + 86_400_000) return { error: "The permission date can't be in the future." };
  const db = draftsDb();
  if (!db) return { error: "Not configured." };

  const { token, hash } = newDraftToken();
  const { error } = await db.from("vendor_listing_drafts").insert({
    token_hash: hash,
    origin: "assisted",
    data: draft,
    email: parsed.data.email.trim(),
    created_by: session.user.id,
    permission_note: parsed.data.permissionNote,
    permission_at: new Date(parsed.data.permissionDate).toISOString(),
    // Longer than a self-serve draft: owners are busy.
    expires_at: draftExpiry(Date.now() + 30 * 86_400_000),
  });
  if (error) {
    console.error("[admin-drafts] insert failed:", error.message);
    return { error: "Couldn't save the draft." };
  }
  revalidatePath(PATH);
  return { success: true, link: linkFor(token) };
}

const idSchema = z.uuid();

/** A fresh claim link (the old one stops working). Shown once. */
export async function adminNewClaimLink(id: string): Promise<AdminDraftState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!idSchema.safeParse(id).success) return { error: "Draft not found." };
  const db = draftsDb();
  if (!db) return { error: "Not configured." };
  const { token, hash } = newDraftToken();
  const { data, error } = await db
    .from("vendor_listing_drafts")
    .update({ token_hash: hash, revoked_at: null, expires_at: draftExpiry(Date.now() + 30 * 86_400_000), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("origin", "assisted")
    .is("claimed_at", null)
    .select("id");
  if (error || !data?.length) return { error: "Only unclaimed drafts prepared by the team can get a new link." };
  revalidatePath(PATH);
  return { success: true, link: linkFor(token) };
}

export async function adminUpdateAssistedDraft(id: string, draft: unknown): Promise<AdminDraftState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!idSchema.safeParse(id).success) return { error: "Draft not found." };
  const db = draftsDb();
  if (!db) return { error: "Not configured." };
  const { data, error } = await db
    .from("vendor_listing_drafts")
    .update({ data: parseDraft(draft), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("origin", "assisted")
    .is("claimed_at", null)
    .select("id");
  if (error || !data?.length) return { error: "This draft has been claimed, so the owner manages it now." };
  revalidatePath(PATH);
  return { success: true };
}

/** The admin sent the link themselves (by DM, text or email). Tracking only. */
export async function adminMarkLinkSent(id: string): Promise<AdminDraftState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!idSchema.safeParse(id).success) return { error: "Draft not found." };
  const db = draftsDb();
  if (!db) return { error: "Not configured." };
  await db.from("vendor_listing_drafts").update({ link_sent_at: new Date().toISOString() }).eq("id", id).eq("origin", "assisted");
  revalidatePath(PATH);
  return { success: true };
}

/** Owner changed their mind, or the link went to the wrong person. */
export async function adminRevokeDraft(id: string): Promise<AdminDraftState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!idSchema.safeParse(id).success) return { error: "Draft not found." };
  const db = draftsDb();
  if (!db) return { error: "Not configured." };
  await db
    .from("vendor_listing_drafts")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("origin", "assisted")
    .is("claimed_at", null);
  revalidatePath(PATH);
  return { success: true };
}
