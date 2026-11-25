import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken, looksLikeInviteToken, newInviteToken } from "@/lib/founding/tokens";
import { parseDraft, type ListingDraft } from "@/lib/vendor-journey/draft";

// Server side of private listing drafts (public.vendor_listing_drafts,
// migration 20261130090000). Service role only; every caller must have
// proved access first, in one of three ways:
//   1. the httpOnly draft cookie on this browser (set when the draft was
//      first saved, or by a resume/claim link);
//   2. a resume or claim link token (256-bit, only its hash is stored);
//   3. a signed-in account whose VERIFIED email matches the draft's email.

export const DRAFT_COOKIE = "evntly_vdraft";
const DRAFT_DAYS = 30;

export type DraftRow = {
  id: string;
  origin: "self" | "assisted";
  data: unknown;
  email: string | null;
  permission_note: string | null;
  claim_opened_at: string | null;
  claimed_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  provider_id: string | null;
};

export type StoredDraft = { row: DraftRow; draft: ListingDraft };

const COLUMNS = "id, origin, data, email, permission_note, claim_opened_at, claimed_at, revoked_at, expires_at, created_at, updated_at, provider_id";

/** The service-role client, untyped for this table (not in generated types yet). */
export function draftsDb(): SupabaseClient | null {
  return createAdminClient() as unknown as SupabaseClient | null;
}

export function isUsable(row: Pick<DraftRow, "claimed_at" | "revoked_at" | "expires_at">, now = Date.now()) {
  return !row.claimed_at && !row.revoked_at && new Date(row.expires_at).getTime() > now;
}

export function draftExpiry(now = Date.now()) {
  return new Date(now + DRAFT_DAYS * 86_400_000).toISOString();
}

export function newDraftToken() {
  return newInviteToken();
}

export async function setDraftCookie(token: string) {
  (await cookies()).set(DRAFT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DRAFT_DAYS * 86_400,
  });
}

export async function clearDraftCookie() {
  (await cookies()).set(DRAFT_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function draftByToken(token: string | null | undefined): Promise<StoredDraft | null> {
  if (!looksLikeInviteToken(token)) return null;
  const db = draftsDb();
  if (!db) return null;
  const { data } = await db.from("vendor_listing_drafts").select(COLUMNS).eq("token_hash", hashInviteToken(token)).maybeSingle();
  const row = data as DraftRow | null;
  return row && isUsable(row) ? { row, draft: parseDraft(row.data) } : null;
}

/** This browser's draft (from the httpOnly cookie), if it is still open. */
export async function draftFromCookie(): Promise<(StoredDraft & { token: string }) | null> {
  const token = (await cookies()).get(DRAFT_COOKIE)?.value;
  const found = await draftByToken(token);
  return found && token ? { ...found, token } : null;
}

/**
 * The open draft a signed-in vendor should continue: this browser's draft
 * first, else the newest one sent to their verified email (a draft started
 * on their phone, or prepared by our team). Assisted drafts are only ever
 * returned for the email the owner gave permission with.
 */
export async function pendingDraftFor(user: { email?: string | null; emailVerified: boolean }): Promise<StoredDraft | null> {
  const own = await draftFromCookie();
  const email = user.email?.trim().toLowerCase() ?? "";
  if (own) {
    if (own.row.origin === "self") return own;
    if (user.emailVerified && own.row.email?.toLowerCase() === email) return own;
  }
  if (!user.emailVerified || !email) return null;
  const db = draftsDb();
  if (!db) return null;
  const { data } = await db
    .from("vendor_listing_drafts")
    .select(COLUMNS)
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .is("claimed_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(1);
  const row = (data?.[0] ?? null) as DraftRow | null;
  return row ? { row, draft: parseDraft(row.data) } : null;
}

export function resumePath(token: string) {
  return `/become-a-vendor/resume/${token}`;
}

export function claimPath(token: string) {
  return `/become-a-vendor/claim/${token}`;
}

export const looksLikeDraftToken = looksLikeInviteToken;
