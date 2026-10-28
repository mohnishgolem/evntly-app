import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV,
  CUSTOMER_BOOKINGS_TABS,
  CUSTOMER_EVENTS_TABS,
  CUSTOMER_NAV,
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
  it("customers get their planning links and never vendor or admin links", () => {
    const links = hrefs("customer");
    expect(links).toEqual(
      expect.arrayContaining(["/", "/explore", "/plan", "/dashboard", "/dashboard/quotes", "/profile", "/dashboard/settings"]),
    );
    for (const h of links) {
      expect(h).not.toMatch(/^\/admin|vendor-dashboard/);
    }
  });

  it("customers reach requests, quotes and confirmed bookings in Bookings", () => {
    const tabs = CUSTOMER_BOOKINGS_TABS.map((t) => t.href);
    expect(tabs).toEqual(["/dashboard/quotes", "/dashboard/bookings"]);
  });

  it("guests see only marketplace links and Help & Guides", () => {
    expect(hrefs("guest")).toEqual(["/", "/explore", "/plan", "/help"]);
  });

  it("keeps Bundles out of every menu while BUNDLES_PUBLIC is off", () => {
    for (const role of ["guest", "customer", "vendor", "admin"] as const) {
      for (const h of hrefs(role)) expect(h).not.toMatch(/bundles/);
    }
    expect(VENDOR_LISTINGS_TABS.some((t) => t.href.includes("bundles"))).toBe(false);
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
    expect(activeHref("/dashboard/events/abc", CUSTOMER_EVENTS_TABS)).toBe("/dashboard/events");
    expect(activeHref("/vendor-dashboard/edit/abc", VENDOR_NAV)).toBe("/vendor-dashboard/business");
  });

  it("does not light section roots for their children", () => {
    expect(activeHref("/dashboard/quotes", CUSTOMER_BOOKINGS_TABS)).toBe("/dashboard/quotes");
    expect(activeHref("/dashboard/events", CUSTOMER_EVENTS_TABS)).toBe("/dashboard/events");
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
    ...CUSTOMER_EVENTS_TABS.map((i) => i.href),
    ...CUSTOMER_BOOKINGS_TABS.map((i) => i.href),
    ...VENDOR_LEADS_TABS.map((i) => i.href),
    ...VENDOR_LISTINGS_TABS.map((i) => i.href),
    ...VENDOR_BOOKINGS_TABS.map((i) => i.href),
  ];
  it.each([...new Set(all)])("%s", (href) => {
    const page = join(process.cwd(), "src/app", href, "page.tsx");
    expect(existsSync(page)).toBe(true);
  });
});

describe("customer navigation", () => {
  it("has exactly five tabs in order, with My Events in the centre", () => {
    expect(CUSTOMER_NAV.map((i) => i.label)).toEqual(["Home", "Explore", "My Events", "Bookings", "Profile"]);
    expect(CUSTOMER_NAV[2].label).toBe("My Events");
  });

  it("Home goes to the landing page", () => {
    expect(CUSTOMER_NAV[0]).toMatchObject({ href: "/", exact: true });
    expect(activeHref("/", CUSTOMER_NAV)).toBe("/");
  });

  it("keeps Messages out of the tabs (it lives in the header)", () => {
    expect(CUSTOMER_NAV.some((i) => i.href.startsWith("/messages"))).toBe(false);
    expect(activeHref("/messages/c1", CUSTOMER_NAV)).toBeUndefined();
  });

  it.each([
    ["/", "/"],
    ["/explore", "/explore"],
    ["/vendor/v1", "/explore"],
    ["/bundles/b1", "/explore"],
    ["/saved", "/explore"],
    ["/dashboard", "/dashboard"],
    ["/dashboard/events", "/dashboard"],
    ["/dashboard/events/e1", "/dashboard"],
    ["/dashboard/events/e1/day", "/dashboard"],
    ["/dashboard/event-feed", "/dashboard"],
    ["/plan", "/dashboard"],
    ["/dashboard/quotes", "/dashboard/quotes"],
    ["/dashboard/bookings", "/dashboard/quotes"],
    ["/dashboard/bundles", "/dashboard/quotes"],
    ["/bookings/b1", "/dashboard/quotes"],
    ["/profile", "/profile"],
    ["/profile/security", "/profile"],
    ["/dashboard/settings", "/profile"],
    ["/dashboard/settings/notifications", "/profile"],
  ])("%s lights %s", (path, tab) => {
    expect(activeHref(path, CUSTOMER_NAV)).toBe(tab);
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

  it("does not change admin navigation or leak vendor links to customers", () => {
    expect(CUSTOMER_NAV.map((i) => i.label)).toEqual(["Home", "Explore", "My Events", "Bookings", "Profile"]);
    expect(drawerSections("admin")[0].items).toBe(ADMIN_NAV);
    expect(hrefs("customer").some((h) => h.startsWith("/vendor-dashboard"))).toBe(false);
  });
});
