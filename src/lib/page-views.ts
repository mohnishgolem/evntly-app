// Pages counted for the admin funnel. Keep in sync with the page_views.kind check.
export const PAGE_VIEW_KINDS = ["home", "explore", "vendor", "plan", "vendor_signup", "bundles"] as const;
export type PageViewKind = (typeof PAGE_VIEW_KINDS)[number];

export function pageViewFor(pathname: string): { kind: PageViewKind; vendorId?: string } | null {
  if (pathname === "/") return { kind: "home" };
  if (pathname === "/explore") return { kind: "explore" };
  if (pathname === "/plan") return { kind: "plan" };
  if (pathname === "/vendor-signup") return { kind: "vendor_signup" };
  if (pathname === "/bundles" || pathname.startsWith("/bundles/")) return { kind: "bundles" };
  const vendor = pathname.match(/^\/vendor\/([0-9a-f-]{36})$/);
  if (vendor) return { kind: "vendor", vendorId: vendor[1] };
  return null;
}
