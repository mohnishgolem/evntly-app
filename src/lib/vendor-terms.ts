// Plain-English promises about fees and setup, shown on the vendor pages.
//
// Source of truth: the Vendor Service Agreement, section 9 (Fees) and
// Schedule 1, in src/lib/legal/documents/vendor-agreement.ts. Every sentence
// here must stay true to those clauses. tests/unit/vendor-terms.test.ts checks
// the key facts against the agreement text, so a change to either side fails
// the test until the other matches.
//
// Do not add "during the beta", "for the first 200" or any other condition to
// the fee promise: the agreement has none. Founding places (the badge and
// first spot in search) are limited to 200; the free listing is not.

/** Schedule 1: current fees are $0. */
export const FEE_SUMMARY = "Listing on Evntly is currently free: no subscription, no commission and no booking fees.";

/** Section 9: 30 days' notice by email, and a fee only applies once accepted. */
export const FEE_CHANGE_PROMISE =
  "If we ever introduce a fee, you'll get at least 30 days' notice by email, and it only applies once you accept it.";

/** How long setting up a listing takes (keep one figure everywhere). */
export const SETUP_TIME = "about 10 minutes";

/**
 * What a listing needs, in the order the flow asks for it. The 3-photo and
 * 1-package minimum is enforced by submit_listing_for_review (MIN_PHOTOS,
 * MIN_PACKAGES in src/lib/listing-completion.ts).
 */
export const PHOTO_RULE =
  "You can save your listing without photos. To submit it for review you'll need 3 photos of your work and one package.";
