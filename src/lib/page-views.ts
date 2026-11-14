// Pages counted for the admin funnel. Keep in sync with the page_views.kind check.
export const PAGE_VIEW_KINDS = ["home", "explore", "vendor", "plan", "vendor_signup", "bundles", "founding", "founding_claim"] as const;
export type PageViewKind = (typeof PAGE_VIEW_KINDS)[number];

export function pageViewFor(pathname: string): { kind: PageViewKind; vendorId?: string } | null {
  if (pathname === "/") return { kind: "home" };
  if (pathname === "/explore") return { kind: "explore" };
  if (pathname === "/plan") return { kind: "plan" };
  if (pathname === "/vendor-signup") return { kind: "vendor_signup" };
  if (pathname === "/founding-vendors") return { kind: "founding" };
  if (pathname === "/founding-vendors/claim") return { kind: "founding_claim" };
  if (pathname === "/bundles" || pathname.startsWith("/bundles/")) return { kind: "bundles" };
  const vendor = pathname.match(/^\/vendor\/([0-9a-f-]{36})$/);
  if (vendor) return { kind: "vendor", vendorId: vendor[1] };
  return null;
}

/** Link tags that decide where a founding visitor came from (see sourceFromParams). */
export const SOURCE_PARAM_KEYS = ["src", "ref", "utm_source", "utm_medium"] as const;
export type SourceParams = Partial<Record<(typeof SOURCE_PARAM_KEYS)[number], string>>;

/**
 * The founding source tags from a page's query string, for the page-view
 * beacon. The landing view can fire before <SourceCookie> has saved the new
 * source, so the view carries the page's own tags instead of relying on the
 * cookie (which may be empty, or left over from an earlier visit).
 */
export function sourceParamsFrom(search: string): SourceParams | undefined {
  const query = new URLSearchParams(search);
  const out: SourceParams = {};
  for (const key of SOURCE_PARAM_KEYS) {
    const value = query.get(key);
    if (value) out[key] = value.slice(0, 40);
  }
  return Object.keys(out).length ? out : undefined;
}

/** The same tags from an untrusted request body: known keys, short strings only. */
export function parseSourceParams(value: unknown): SourceParams | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: SourceParams = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (!(SOURCE_PARAM_KEYS as readonly string[]).includes(key) || typeof v !== "string" || v.length > 40) return null;
    out[key as keyof SourceParams] = v;
  }
  return Object.keys(out).length ? out : null;
}
