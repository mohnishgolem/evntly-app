import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV,
  CUSTOMER_DASHBOARD_TABS,
  VENDOR_BUSINESS_TABS,
  VENDOR_ENQUIRY_TABS,
  VENDOR_NAV,
  activeHref,
  drawerSections,
  navRole,
  type NavRole,
} from "@/lib/nav";

const hrefs = (role: NavRole) => drawerSections(role).flatMap((s) => s.items.map((i) => i.href));

describe("navRole", () => {
  it("maps signed-out and unknown roles safely", () => {
    expect(navRole("admin", false)).toBe("guest");
    expect(navRole(null, true)).toBe("customer");
    expect(navRole("something", true)).toBe("customer");
    expect(navRole("vendor", true)).toBe("vendor");
    expect(navRole("admin", true)).toBe("admin");
  });
});

describe("drawer menus by role", () => {
  it("customers get no standalone quotes, bookings or admin links", () => {
    const links = hrefs("customer");
    expect(links).toEqual(
      expect.arrayContaining(["/", "/explore", "/bundles", "/plan", "/dashboard", "/profile", "/dashboard/settings"]),
    );
    for (const h of links) {
      expect(h).not.toMatch(/quotes|bookings|^\/admin|vendor-dashboard/);
    }
  });

  it("customers still reach quotes and bookings from the dashboard", () => {
    const tabs = CUSTOMER_DASHBOARD_TABS.map((t) => t.href);
    expect(tabs).toContain("/dashboard/quotes");
    expect(tabs).toContain("/dashboard/bookings");
  });

  it("guests see only marketplace links", () => {
    expect(hrefs("guest")).toEqual(["/", "/explore", "/bundles", "/plan"]);
  });

  it("vendors keep quotes and bookings separate, and never see admin", () => {
    const links = hrefs("vendor");
    expect(links).toContain("/vendor-dashboard/quotes");
    expect(links).toContain("/vendor-dashboard/bookings");
    expect(links).toContain("/vendor-dashboard/enquiries");
    expect(links.some((h) => h.startsWith("/admin"))).toBe(false);
  });

  it("only admins get admin links", () => {
    expect(hrefs("admin")).toEqual(expect.arrayContaining(ADMIN_NAV.map((i) => i.href)));
    for (const role of ["guest", "customer", "vendor"] as const) {
      expect(hrefs(role).some((h) => h.startsWith("/admin"))).toBe(false);
    }
  });
});

describe("active item", () => {
  it("keeps the section lit on detail pages", () => {
    expect(activeHref("/dashboard/events/abc", CUSTOMER_DASHBOARD_TABS)).toBe("/dashboard/events");
    expect(activeHref("/vendor-dashboard/edit/abc", VENDOR_NAV)).toBe("/vendor-dashboard/business");
    expect(activeHref("/messages/xyz", VENDOR_NAV)).toBe("/vendor-dashboard/enquiries");
  });

  it("does not light section roots for their children", () => {
    expect(activeHref("/dashboard/quotes", CUSTOMER_DASHBOARD_TABS)).toBe("/dashboard/quotes");
    expect(activeHref("/vendor-dashboard/quotes", VENDOR_NAV)).toBe("/vendor-dashboard/quotes");
    expect(activeHref("/admin/support", ADMIN_NAV)).toBe("/admin/support");
  });

  it("prefers the longest match", () => {
    const account = drawerSections("customer")[1].items;
    expect(activeHref("/dashboard/settings", account)).toBe("/dashboard/settings");
    expect(activeHref("/dashboard/events", account)).toBe("/dashboard");
  });

  it("does not confuse /vendor-dashboard with /vendor/[id]", () => {
    const market = drawerSections("guest")[0].items;
    expect(activeHref("/vendor/abc", market)).toBe("/explore");
    expect(activeHref("/vendor-dashboard", market)).toBeUndefined();
  });
});

describe("every nav link has a page", () => {
  const all = [
    ...(["guest", "customer", "vendor", "admin"] as const).flatMap(hrefs),
    ...CUSTOMER_DASHBOARD_TABS.map((i) => i.href),
    ...VENDOR_ENQUIRY_TABS.map((i) => i.href),
    ...VENDOR_BUSINESS_TABS.map((i) => i.href),
  ];
  it.each([...new Set(all)])("%s", (href) => {
    const page = join(process.cwd(), "src/app", href, "page.tsx");
    expect(existsSync(page)).toBe(true);
  });
});
