"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIp, RATE_LIMIT_ERROR } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { categoryLabel } from "@/lib/config";
import { foundingCampaignFromCookie, foundingSourceFromCookie, recordFunnelEvent } from "@/lib/funnel-events";
import { FINISH_PATH } from "@/lib/listing-completion";
import { packageRow, packageSchema } from "@/lib/package-schema";
import { createVendorListing } from "@/lib/vendor-listing-create";
import { assistListing } from "@/lib/vendor-journey/assist";
import { approvedPackages, instagramHandle, parseDraft, readyToSave, websiteUrl, worthSaving, type ListingDraft } from "@/lib/vendor-journey/draft";
import {
  clearDraftCookie,
  draftByToken,
  draftExpiry,
  draftFromCookie,
  draftsDb,
  newDraftToken,
  pendingDraftFor,
  resumePath,
  setDraftCookie,
} from "@/lib/vendor-journey/server";

// Vendor journey (/become-a-vendor). A visitor builds a private listing
// before having an account; it is saved on this browser and, once it has a
// category and a name, on our server behind a secret token. Nothing here
// publishes anything: see saveDraftAsListing for how a draft becomes a
// (still private, draft-status) listing.

export type DraftSaveState = { ok: true; savedAt: string; onServer: boolean } | { ok: false; error: string };

const visitorIdOk = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null);

/** Save (or create) this browser's server copy of the draft. Called when a step is finished. */
export async function saveListingDraft(input: unknown, visitorId?: string): Promise<DraftSaveState> {
  const draft = parseDraft(input);
  const now = new Date().toISOString();
  if (!worthSaving(draft)) return { ok: true, savedAt: now, onServer: false };
  const db = draftsDb();
  if (!db) return { ok: true, savedAt: now, onServer: false };

  const existing = await draftFromCookie();
  if (existing) {
    const { error } = await db
      .from("vendor_listing_drafts")
      .update({ data: draft, updated_at: now, expires_at: draftExpiry() })
      .eq("id", existing.row.id)
      .is("claimed_at", null);
    if (error) return { ok: false, error: "We couldn't save to our server. Your answers are still saved on this device." };
    return { ok: true, savedAt: now, onServer: true };
  }

  if (!(await checkRateLimit("listingDraftIp", await clientIp()))) return { ok: false, error: RATE_LIMIT_ERROR };
  const { token, hash } = newDraftToken();
  const { error } = await db.from("vendor_listing_drafts").insert({
    token_hash: hash,
    origin: "self",
    data: draft,
    source: await foundingSourceFromCookie(),
    campaign: await foundingCampaignFromCookie(),
    visitor_id: visitorIdOk(visitorId),
    expires_at: draftExpiry(),
  });
  if (error) {
    console.error("[vendor-journey] draft insert failed:", error.message);
    return { ok: false, error: "We couldn't save to our server. Your answers are still saved on this device." };
  }
  await setDraftCookie(token);
  await recordFunnelEvent("draft_saved", { visitorId: visitorIdOk(visitorId) });
  return { ok: true, savedAt: now, onServer: true };
}

const emailSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  consent: z.literal(true, { error: "Tick the box so we can email you the link." }),
});

/**
 * "Email me a link to finish later": a one-off email with a new private
 * link to this draft. The old link stops working (the token is replaced).
 * Same reply whether or not the address has an Evntly account.
 */
export async function emailDraftLink(input: { email: string; consent: boolean }): Promise<{ ok: boolean; message: string }> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your email address." };
  const email = parsed.data.email.trim();
  const existing = await draftFromCookie();
  if (!existing) return { ok: false, message: "Answer the first two questions so there's something to save." };
  if (!(await checkRateLimit("listingDraftEmailIp", await clientIp())) || !(await checkRateLimit("listingDraftEmail", email))) {
    return { ok: false, message: RATE_LIMIT_ERROR };
  }
  const db = draftsDb();
  if (!db) return { ok: false, message: "Saving isn't available right now. Your answers are still saved on this device." };
  const { token, hash } = newDraftToken();
  const { error } = await db
    .from("vendor_listing_drafts")
    .update({ token_hash: hash, email, updated_at: new Date().toISOString(), expires_at: draftExpiry() })
    .eq("id", existing.row.id)
    .is("claimed_at", null);
  if (error) return { ok: false, message: "We couldn't send the link. Please try again." };
  await setDraftCookie(token);
  const name = existing.draft.businessName.trim() || "your business";
  await sendEmail({
    to: email,
    subject: `Finish your ${name} listing on Evntly`,
    heading: "Your listing is saved",
    lines: [
      `Here's your private link to keep building the ${name} listing you started on Evntly. It's not public, and nothing goes live until you create an account, add your ABN and submit it for review.`,
      "The link works for 30 days. Don't forward it: anyone with it can edit your draft.",
    ],
    cta: { label: "Continue my listing", path: resumePath(token) },
    footer: "You're getting this one email because you asked for a link to your Evntly listing draft. We won't email you again unless you create an account.",
  });
  await recordFunnelEvent("draft_link_sent");
  return { ok: true, message: `Sent. Check ${email} for your link.` };
}

const assistSchema = z.object({ notes: z.string().max(1500).catch("") });

/** Suggested description + packages from the vendor's own answers. Nothing is saved. */
export async function suggestListingCopy(input: unknown, notes: string) {
  if (!(await checkRateLimit("listingAssistIp", await clientIp()))) return { error: RATE_LIMIT_ERROR };
  const draft = parseDraft(input);
  if (!draft.serviceType || !draft.businessName.trim()) return { error: "Answer the first questions first." };
  const result = await assistListing({ ...draft, notes: assistSchema.parse({ notes }).notes });
  await recordFunnelEvent("suggestion_used", { detail: result.writer });
  return { bio: result.bio, packages: result.packages };
}

/** Claim link from our team: open the prepared draft on this browser. */
export async function openClaimLink(token: string) {
  const found = await draftByToken(token);
  if (!found || found.row.origin !== "assisted") redirect("/become-a-vendor?link=expired");
  const db = draftsDb();
  if (db && !found.row.claim_opened_at) {
    await db.from("vendor_listing_drafts").update({ claim_opened_at: new Date().toISOString() }).eq("id", found.row.id);
  }
  await setDraftCookie(token);
  await recordFunnelEvent("claim_link_opened", { source: null });
  redirect("/become-a-vendor/start?review=1");
}

/** Start again: forget this browser's draft (the server copy expires on its own). */
export async function forgetDraft() {
  await clearDraftCookie();
  return { ok: true };
}

const saveSchema = z.object({
  abn: z.string().trim().max(20),
  gstRegistered: z.boolean(),
  acceptedVendorAgreement: z.boolean(),
  phone: z.string().trim().max(30).catch(""),
  photoHelp: z.boolean().catch(false),
});

export type SaveListingState = { error?: string } | null;

function socialLink(d: ListingDraft) {
  const ig = instagramHandle(d.instagram);
  return ig ? `https://www.instagram.com/${ig}/` : websiteUrl(d.website);
}

/**
 * The owner turns their draft into their listing. Requires a signed-in
 * account with a VERIFIED email, a valid ABN and the Vendor Service
 * Agreement (createVendorListing). The listing is saved as a private draft;
 * the owner then adds photos and submits it for review on the finish page,
 * and an admin approves it before anyone can see it.
 */
export async function saveDraftAsListing(input: unknown): Promise<SaveListingState> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the form and try again." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Log in to save your listing." };
  if (!user.email_confirmed_at) return { error: "Confirm your email address first. We sent you a code when you signed up." };

  const pending = await pendingDraftFor({ email: user.email, emailVerified: true });
  if (!pending) return { error: "We couldn't find your draft. It may have expired; start again from Become a vendor." };
  const { row, draft } = pending;
  if (!readyToSave(draft)) return { error: "A few questions are still unanswered. Go back to your draft to finish them." };

  // Founding place first (same RPC as the claim page). Never blocks saving.
  try {
    const source = (await foundingSourceFromCookie()) ?? (row.origin === "assisted" ? "direct_outreach" : "direct");
    await supabase.rpc("claim_founding_vendor_place", { p_source: source });
  } catch (e) {
    console.error("[vendor-journey] founding claim failed:", e instanceof Error ? e.message : e);
  }

  const result = await createVendorListing(
    supabase,
    user,
    {
      ...draft,
      locationsServiced: draft.city ? [draft.city] : [],
      phone: parsed.data.phone,
      abn: parsed.data.abn,
      gstRegistered: parsed.data.gstRegistered,
      socialLink: socialLink(draft),
    },
    { acceptedVendorAgreement: parsed.data.acceptedVendorAgreement }
  );
  if ("error" in result) return { error: result.error };
  if ("existing" in result) redirect("/vendor-dashboard");

  const providerId = result.providerId;
  if (!providerId) console.error("[vendor-journey] listing created but not read back; packages not copied");
  // Packages the owner approved and priced. A bad one is skipped, not fatal.
  for (const p of providerId ? approvedPackages(draft) : []) {
    const pkg = packageSchema.safeParse({
      name: p.name,
      description: p.description,
      price: p.price,
      includedHours: p.includedHours,
      extraHourPrice: null,
      inclusions: p.inclusions,
      deliveryDays: null,
      depositPercent: null,
      active: true,
    });
    if (pkg.success) await supabase.from("vendor_packages").insert({ ...packageRow(pkg.data), provider_id: providerId! });
  }

  // Assisted drafts: the owner can ask us to add the photos they sent.
  if (providerId && row.origin === "assisted" && parsed.data.photoHelp) {
    await supabase.from("listing_setup_requests").insert({
      provider_id: providerId,
      services: `Prepared with Evntly (${categoryLabel(draft.serviceType)}). Owner asked us to add the photos they sent.`,
      photo_permission: true,
    });
  }

  const db = draftsDb();
  await db
    ?.from("vendor_listing_drafts")
    .update({ claimed_by: user.id, claimed_at: new Date().toISOString(), provider_id: providerId })
    .eq("id", row.id);
  await clearDraftCookie();
  await recordFunnelEvent("listing_created", { detail: row.origin });
  redirect(FINISH_PATH);
}
