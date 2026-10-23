import "server-only";

// Seeded sample listings (service_providers.is_demo) show how Evntly works
// while there are few real vendors. Setting HIDE_SAMPLE_LISTINGS=true takes
// them out of public discovery — home, explore, bundles and "similar
// vendors" — and 404s their profiles for everyone except admins. The rows
// stay in the database for internal testing; nothing is deleted.
export function sampleListingsHidden(): boolean {
  return process.env.HIDE_SAMPLE_LISTINGS === "true";
}

// Sample listings have no owner, so a quote request or message to one is
// never answered. Refused whether or not they're hidden.
export const SAMPLE_LISTING_CONTACT_ERROR =
  "This is a sample listing, not a real business, so it can't take quote requests or messages.";
