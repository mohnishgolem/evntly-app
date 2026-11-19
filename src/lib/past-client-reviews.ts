import { SITE_URL } from "@/lib/config";

// Past-client reviews: a vendor's earlier clients (booked outside Evntly)
// review them from a link the vendor shares. Reviewers need a free, verified
// Evntly account; reviews go live straight away, labelled, and count towards
// the star rating (migration 20261126090000_past_client_reviews).

export const PAST_CLIENT_COMMENT_MIN = 20;
export const PAST_CLIENT_COMMENT_MAX = 2000;

/** The page a vendor sends past clients to. */
export function pastClientReviewPath(vendorId: string) {
  return `/vendor/${encodeURIComponent(vendorId)}/review`;
}
export function pastClientReviewUrl(vendorId: string, base = SITE_URL) {
  return new URL(pastClientReviewPath(vendorId), base).toString();
}

/** True for /vendor/<id>/review (sign-up shows "you'll come straight back"). */
export function isReviewReturn(next: string | null | undefined) {
  return !!next && /^\/vendor\/[0-9a-f-]{36}\/review(\?|#|$)/.test(next);
}

/** How a past client is named on the review: first name and last initial ("Sarah K."). */
export function reviewerDisplayName(fullName: string | null | undefined) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Past client";
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first;
}

/** The message a vendor sends with their link (they can edit it). */
export function reviewRequestMessage(vendorName: string, vendorId: string) {
  return `Hi! Thanks again for having ${vendorName} at your event. I've just joined Evntly. Would you mind leaving me a quick review? It takes a minute: ${pastClientReviewUrl(vendorId)}`;
}

/** The database's refusals, as something a person can act on. */
export function friendlyReviewError(message: string) {
  if (/Verify your email/.test(message)) return "Verify your email first, then post your review.";
  if (/already reviewed this vendor|reviews_past_client_once/.test(message)) return "You've already reviewed this vendor. Thank you!";
  if (/your own business/.test(message)) return "You can't review your own business.";
  if (/can't receive reviews/.test(message)) return "This vendor isn't taking reviews right now.";
  if (/up to 5 past-client reviews a day/.test(message)) return "You've posted 5 reviews today. Please try again tomorrow.";
  if (/20 to 2,000/.test(message)) return `Write a few words about your experience (at least ${PAST_CLIENT_COMMENT_MIN} characters).`;
  if (/Too many reviews/.test(message)) return "Too many reviews in a short time. Please try again later.";
  return "Something went wrong posting your review. Please try again.";
}
