// Redirect targets that arrive in a query string (?next=...) are attacker-
// controlled. Only same-site absolute paths are allowed: "/dashboard" is fine,
// but "//evil.com", "/\evil.com", "@evil.com" (which turns
// `${origin}${next}` into https://site@evil.com) and "https://evil.com" are
// not — they fall back to `fallback`.
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Control characters (tabs/newlines are stripped by URL parsers, turning
  // "/\t/evil.com" into "//evil.com") and backslashes are never needed.
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "https://evntly.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/** True when `next` returns to a vendor's booking form (/vendor/:id?book=1). */
export function isBookingReturn(next: string | null | undefined): boolean {
  if (!next) return false;
  const path = safeNextPath(next, "");
  return /^\/vendor\/[^/?#]+\?(.*&)?book=1(&|#|$)/.test(path);
}
