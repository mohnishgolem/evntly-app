// "Book this vendor" pressed while signed out sends the customer through
// sign-up and back to /vendor/<id>?book=1, which reopens the booking form.
// The proxy turns that one-shot ?book=1 into a short-lived cookie and
// redirects to the clean URL, so the address bar never keeps it: Next's
// router put it back after the booking request's server action when the
// page removed it client-side.

export const BOOK_INTENT_COOKIE = "evntly_book_intent";
export const BOOK_INTENT_MAX_AGE_SECONDS = 120;

/** For the proxy: the clean URL and vendor id when this is a /vendor/<id>?book=1 page load, else null. */
export function bookIntentRedirect(url: URL): { clean: URL; vendorId: string } | null {
  if (url.searchParams.get("book") !== "1") return null;
  const match = url.pathname.match(/^\/vendor\/([^/]+)$/);
  if (!match) return null;
  const clean = new URL(url);
  clean.searchParams.delete("book");
  return { clean, vendorId: decodeURIComponent(match[1]) };
}

/** Cookie path: the intent only applies to that vendor's page. */
export function bookIntentPath(vendorId: string) {
  return `/vendor/${encodeURIComponent(vendorId)}`;
}
