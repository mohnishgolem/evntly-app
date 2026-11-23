import { isShareSource, shareProfileUrl, type ShareSource } from "@/lib/share-profile";

// Reviews start from the vendor's public profile ("Write a review"), reached
// through their Share profile links and QR codes. One flow for anyone who
// hired the vendor: a completed Evntly booking makes it "Booked on Evntly",
// anyone else is a past client. Reviewers need a free, verified account;
// guests draft first and the draft is saved server-side, so they get it back
// after verifying their email, even in another browser (migration
// 20261126090000_profile_reviews).

export const REVIEW_COMMENT_MIN = 20;
export const REVIEW_COMMENT_MAX = 2000;

/** ?review=<draft id> reopens a saved draft; ?review=new opens an empty form. */
export const REVIEW_PARAM = "review";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isDraftId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Where sign-up returns a guest: the vendor's profile with their draft open (and the share tag kept). */
export function reviewReturnPath(vendorId: string, draftId: string, shareSource?: ShareSource | null) {
  const q = new URLSearchParams({ [REVIEW_PARAM]: draftId });
  if (shareSource && isShareSource(shareSource)) q.set("src", shareSource);
  return `/vendor/${encodeURIComponent(vendorId)}?${q.toString()}`;
}

/** True when `next` returns to a vendor profile's review form (sign-up shows "we kept your review"). */
export function isReviewReturn(next: string | null | undefined) {
  if (!next) return false;
  try {
    const url = new URL(next, "https://evntly.invalid");
    return url.origin === "https://evntly.invalid" && /^\/vendor\/[0-9a-f-]{36}$/.test(url.pathname) && url.searchParams.has(REVIEW_PARAM);
  } catch {
    return false;
  }
}

/** How a reviewer is named: first name and last initial ("Sarah K."). */
export function reviewerDisplayName(fullName: string | null | undefined) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Evntly customer";
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first;
}

/** The vendor's message asking clients for a review: their Share profile link. */
export function reviewRequestMessage(vendorName: string, vendorId: string) {
  return `Hi! Thanks again for having ${vendorName} at your event. I'm now on Evntly. Would you mind leaving me a quick review? Open my profile and tap "Write a review": ${shareProfileUrl(vendorId, "share_link")}`;
}

/** The database's refusals, as something a person can act on. */
export function friendlyReviewError(message: string) {
  if (/Verify your email/.test(message)) return "Verify your email first, then post your review.";
  if (/already reviewed this vendor|reviews_past_client_once|already reviewed this booking/.test(message)) return "You've already reviewed this vendor. Thank you!";
  if (/your own business/.test(message)) return "You can't review your own business.";
  if (/can't receive reviews/.test(message)) return "This vendor isn't taking reviews right now.";
  if (/up to 5 past-client reviews a day/.test(message)) return "You've posted 5 reviews today. Please try again tomorrow.";
  if (/20 to 2,000/.test(message)) return `Write a few words about your experience (at least ${REVIEW_COMMENT_MIN} characters).`;
  if (/Too many reviews/.test(message)) return "Too many reviews in a short time. Please try again later.";
  return "Something went wrong posting your review. Please try again.";
}
