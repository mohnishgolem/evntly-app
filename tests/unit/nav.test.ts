import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV,
  CUSTOMER_DASHBOARD_TABS,
  CUSTOMER_TAB_BAR,
  VENDOR_BOOKINGS_TABS,
  VENDOR_LEADS_TABS,
  VENDOR_LISTINGS_TABS,
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

  it("vendors get their five destinations plus Messages, and never admin", () => {
    const links = hrefs("vendor");
    for (const h of VENDOR_NAV.map((i) => i.href)) expect(links).toContain(h);
    expect(links).toContain("/messages");
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
  });

  it("does not light section roots for their children", () => {
    expect(activeHref("/dashboard/quotes", CUSTOMER_DASHBOARD_TABS)).toBe("/dashboard/quotes");
    expect(activeHref("/vendor-dashboard/quotes", VENDOR_LEADS_TABS)).toBe("/vendor-dashboard/quotes");
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
    ...VENDOR_LEADS_TABS.map((i) => i.href),
    ...VENDOR_LISTINGS_TABS.map((i) => i.href),
    ...VENDOR_BOOKINGS_TABS.map((i) => i.href),
  ];
  it.each([...new Set(all)])("%s", (href) => {
    const page = join(process.cwd(), "src/app", href, "page.tsx");
    expect(existsSync(page)).toBe(true);
  });
});

describe("customer phone tab bar", () => {
  it("Home goes to the landing page, not the dashboard", () => {
    expect(CUSTOMER_TAB_BAR[0]).toMatchObject({ label: "Home", href: "/" });
    expect(activeHref("/", CUSTOMER_TAB_BAR)).toBe("/");
  });

  it("highlights Events across the dashboard and planning", () => {
    for (const path of ["/dashboard", "/dashboard/quotes", "/dashboard/bookings", "/dashboard/events/e1", "/plan"]) {
      expect(activeHref(path, CUSTOMER_TAB_BAR)).toBe("/dashboard/events");
    }
  });

  it("keeps Explore and Messages", () => {
    expect(activeHref("/vendor/v1", CUSTOMER_TAB_BAR)).toBe("/explore");
    expect(activeHref("/messages/c1", CUSTOMER_TAB_BAR)).toBe("/messages");
  });
});

describe("vendor navigation", () => {
  it("has exactly five tabs in order, with Listings in the centre", () => {
    expect(VENDOR_NAV.map((i) => i.label)).toEqual(["Home", "Leads", "Listings", "Bookings", "Profile"]);
    expect(VENDOR_NAV[2].label).toBe("Listings");
  });

  it("keeps Messages out of the tabs (it lives in the header)", () => {
    expect(VENDOR_NAV.some((i) => i.href.startsWith("/messages"))).toBe(false);
    expect(activeHref("/messages", VENDOR_NAV)).toBeUndefined();
  });

  it.each([
    ["/vendor-dashboard", "/vendor-dashboard"],
    ["/vendor-dashboard/earnings", "/vendor-dashboard"],
    ["/vendor-dashboard/enquiries", "/vendor-dashboard/enquiries"],
    ["/vendor-dashboard/quotes", "/vendor-dashboard/enquiries"],
    ["/vendor-dashboard/opportunities", "/vendor-dashboard/enquiries"],
    ["/vendor-dashboard/event-feed", "/vendor-dashboard/enquiries"],
    ["/vendor-dashboard/business", "/vendor-dashboard/business"],
    ["/vendor-dashboard/edit/abc", "/vendor-dashboard/business"],
    ["/vendor-dashboard/portfolio", "/vendor-dashboard/business"],
    ["/vendor-dashboard/pricing", "/vendor-dashboard/business"],
    ["/vendor-dashboard/bundles", "/vendor-dashboard/business"],
    ["/vendor-dashboard/bookings", "/vendor-dashboard/bookings"],
    ["/vendor-dashboard/calendar", "/vendor-dashboard/bookings"],
    ["/bookings/b1", "/vendor-dashboard/bookings"],
    ["/vendor-dashboard/profile", "/vendor-dashboard/profile"],
    ["/vendor-dashboard/payouts", "/vendor-dashboard/profile"],
    ["/profile", "/vendor-dashboard/profile"],
    ["/dashboard/settings/notifications", "/vendor-dashboard/profile"],
  ])("%s lights %s", (path, tab) => {
    expect(activeHref(path, VENDOR_NAV)).toBe(tab);
  });

  it("does not change customer or admin navigation", () => {
    expect(CUSTOMER_TAB_BAR.map((i) => i.label)).toEqual(["Home", "Events", "Explore", "Messages"]);
    expect(drawerSections("admin")[0].items).toBe(ADMIN_NAV);
    expect(hrefs("customer").some((h) => h.startsWith("/vendor-dashboard"))).toBe(false);
  });
});
