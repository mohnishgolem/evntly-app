import {
  BarChart3,
  CalendarCheck,
  CalendarHeart,
  Compass,
  Heart,
  Briefcase,
  CalendarDays,
  CircleHelp,
  CreditCard,
  ClipboardList,
  FileText,
  Flag,
  Home,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  MessageCircle,
  Package,
  Search,
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Tags,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

// Single source of truth for every navigation surface: the dark drawer,
// the account dropdown, the desktop sidebars and the in-page tab rows.
// Hiding a link here is presentation only — every page and server action
// does its own authorisation check.

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other path prefixes that should light this item up. */
  match?: string[];
  /** Highlight only on an exact path match (for section roots like /dashboard). */
  exact?: boolean;
  /** Shows a count: unread messages, or (vendors) new leads awaiting a reply. */
  badge?: "unread" | "leads";
};

export type NavSection = { title?: string; items: NavItem[] };

export type NavRole = "guest" | "customer" | "vendor" | "admin";

export function navRole(role: string | null | undefined, signedIn: boolean): NavRole {
  if (!signedIn) return "guest";
  if (role === "admin" || role === "vendor") return role;
  return "customer";
}

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNavItemActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return [item.href, ...(item.match ?? [])].some((p) => matches(pathname, p));
}

/**
 * How specifically an item matches: the length of its longest route that
 * matches the path (0 = not active). Lets a narrow route claim a page from
 * a broader one, e.g. /dashboard/settings → Profile, not My Events (/dashboard).
 */
function matchStrength(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href ? item.href.length : 0;
  return Math.max(0, ...[item.href, ...(item.match ?? [])].filter((p) => matches(pathname, p)).map((p) => p.length));
}

/** The one item to highlight in a list: the most specific match wins. */
export function activeHref(pathname: string, items: NavItem[]) {
  let best: NavItem | undefined;
  let bestStrength = 0;
  for (const item of items) {
    const strength = matchStrength(pathname, item);
    if (strength > bestStrength) {
      best = item;
      bestStrength = strength;
    }
  }
  return best?.href;
}

// ── Marketplace (header links for everyone) ─────────────────────────────
export const MARKETPLACE_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/explore", label: "Explore Vendors", icon: Search, match: ["/vendor"] },
  { href: "/bundles", label: "Bundles", icon: Package },
  { href: "/plan", label: "Start Planning", icon: Sparkles },
];

// ── Customer ─────────────────────────────────────────────────────────────
// Five destinations on every screen size: bottom tab bar on phones, icon
// rail on tablets, sidebar on desktops. My Events stays in the centre.
// Messages and notifications live in the header, not here.
export const CUSTOMER_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/explore", label: "Explore", icon: Compass, match: ["/vendor", "/bundles", "/saved"] },
  { href: "/dashboard", label: "My Events", icon: CalendarHeart, match: ["/plan"] },
  {
    href: "/dashboard/quotes",
    label: "Bookings",
    icon: CalendarCheck,
    match: ["/dashboard/bookings", "/dashboard/bundles", "/bookings"],
  },
  { href: "/profile", label: "Profile", icon: UserRound, match: ["/dashboard/settings"] },
];

// My Events: the planning hub, every event (each opens its board), and
// events posted for vendors to pitch on.
export const CUSTOMER_EVENTS_TABS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/events", label: "All events", icon: CalendarHeart },
  { href: "/dashboard/event-feed", label: "Posted to vendors", icon: Inbox },
];

// Bookings, in two clearly separate parts: requests and quotes (nothing is
// booked yet) and confirmed bookings. Bundle bookings sit alongside.
export const CUSTOMER_BOOKINGS_TABS: NavItem[] = [
  { href: "/dashboard/quotes", label: "Requests & quotes", icon: FileText },
  { href: "/dashboard/bookings", label: "Confirmed bookings", icon: CalendarCheck },
  { href: "/dashboard/bundles", label: "Bundle bookings", icon: Package },
];

// Drawer "Account" section for customers.
export const CUSTOMER_ACCOUNT_NAV: NavItem[] = [
  { href: "/dashboard", label: "My Events", icon: CalendarHeart, match: ["/plan"] },
  { href: "/dashboard/quotes", label: "Bookings", icon: CalendarCheck, match: ["/dashboard/bookings", "/dashboard/bundles"] },
  { href: "/messages", label: "Messages", icon: MessageCircle, badge: "unread" },
  { href: "/saved", label: "Saved vendors", icon: Heart },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

// ── Vendor ───────────────────────────────────────────────────────────────
// Five destinations, the same on every screen size: bottom tab bar on
// phones, an icon rail on tablets, the sidebar on desktops. Messages and
// notifications live in the header, not here. Listings stays in the centre.
export const VENDOR_NAV: NavItem[] = [
  // Not `exact`: vendor pages without a tab of their own (Analytics) fall
  // back to Home, since the longest matching href wins.
  { href: "/vendor-dashboard", label: "Home", icon: Home },
  {
    href: "/vendor-dashboard/enquiries",
    label: "Leads",
    icon: Inbox,
    match: ["/vendor-dashboard/quotes", "/vendor-dashboard/opportunities", "/vendor-dashboard/event-feed"],
    badge: "leads",
  },
  {
    href: "/vendor-dashboard/business",
    label: "Listings",
    icon: LayoutGrid,
    match: [
      "/vendor-dashboard/edit",
      "/vendor-dashboard/pricing",
      "/vendor-dashboard/portfolio",
      "/vendor-dashboard/bundles",
    ],
  },
  {
    href: "/vendor-dashboard/bookings",
    label: "Bookings",
    icon: CalendarDays,
    match: ["/vendor-dashboard/calendar", "/bookings"],
  },
  {
    href: "/vendor-dashboard/profile",
    label: "Profile",
    icon: UserRound,
    match: ["/vendor-dashboard/payouts", "/profile", "/dashboard/settings"],
  },
];

// Leads: everything before a booking — new requests, priced quotes (quotes
// are managed here, not in their own tab), smart matches and the Event Feed.
export const VENDOR_LEADS_TABS: NavItem[] = [
  { href: "/vendor-dashboard/enquiries", label: "New requests", icon: Inbox, badge: "leads" },
  { href: "/vendor-dashboard/quotes", label: "Quotes", icon: FileText },
  { href: "/vendor-dashboard/opportunities", label: "Smart matches", icon: Sparkles },
  { href: "/vendor-dashboard/event-feed", label: "Event Feed", icon: Search },
];

export const VENDOR_LISTINGS_TABS: NavItem[] = [
  { href: "/vendor-dashboard/business", label: "Listings", icon: Store, match: ["/vendor-dashboard/edit"] },
  { href: "/vendor-dashboard/portfolio", label: "Photos & videos", icon: LayoutGrid },
  { href: "/vendor-dashboard/pricing", label: "Pricing & packages", icon: Tags },
  { href: "/vendor-dashboard/bundles", label: "Bundles", icon: Package },
];

export const VENDOR_BOOKINGS_TABS: NavItem[] = [
  { href: "/vendor-dashboard/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/vendor-dashboard/calendar", label: "Calendar & availability", icon: CalendarDays },
];

// ── Admin ────────────────────────────────────────────────────────────────
// Only sections that exist. Bookings and Settings are added when built.
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/approvals", label: "Vendor Approvals", icon: ShieldCheck },
  { href: "/admin/vendors", label: "Vendors", icon: Store },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/matching", label: "Matching", icon: Sparkles },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/disputes", label: "Disputes", icon: Scale },
  { href: "/admin/risk", label: "Risk", icon: ShieldAlert },
  { href: "/admin/support", label: "Support", icon: Flag },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

// Server components pass one of these names to client nav components
// (DashboardNav, AppSidebar), never the arrays: the icons are component
// functions and can't cross the server/client boundary.
export const NAV_SETS = {
  customer: CUSTOMER_NAV,
  customerEventsTabs: CUSTOMER_EVENTS_TABS,
  customerBookingsTabs: CUSTOMER_BOOKINGS_TABS,
  vendor: VENDOR_NAV,
  vendorLeadsTabs: VENDOR_LEADS_TABS,
  vendorListingsTabs: VENDOR_LISTINGS_TABS,
  vendorBookingsTabs: VENDOR_BOOKINGS_TABS,
  admin: ADMIN_NAV,
} satisfies Record<string, NavItem[]>;

export type NavSetName = keyof typeof NAV_SETS;

// Help & Guides: in every account menu (and for guests), after the account
// links. /how-it-works lights it up too.
export const HELP_NAV_ITEM: NavItem = { href: "/help", label: "Help & Guides", icon: CircleHelp, match: ["/how-it-works"] };

/** Drawer contents for a role. */
export function drawerSections(role: NavRole): NavSection[] {
  switch (role) {
    case "guest":
      return [{ items: [...MARKETPLACE_NAV, HELP_NAV_ITEM] }];
    case "customer":
      return [{ items: MARKETPLACE_NAV }, { title: "Account", items: [...CUSTOMER_ACCOUNT_NAV, HELP_NAV_ITEM] }];
    case "vendor":
      return [
        {
          title: "Your business",
          items: [
            ...VENDOR_NAV,
            { href: "/messages", label: "Messages", icon: MessageCircle, badge: "unread" },
            HELP_NAV_ITEM,
          ],
        },
        { title: "Marketplace", items: MARKETPLACE_NAV.slice(0, 3) },
      ];
    case "admin":
      return [
        { title: "Admin", items: ADMIN_NAV },
        { title: "Marketplace", items: MARKETPLACE_NAV },
        {
          title: "Account",
          items: [...CUSTOMER_ACCOUNT_NAV.filter((i) => i.href !== "/dashboard"), HELP_NAV_ITEM],
        },
      ];
  }
}

/** Where each role's "home" in the app is (dropdown + sidebar header). */
export const ROLE_HOME: Record<Exclude<NavRole, "guest">, NavItem> = {
  customer: CUSTOMER_ACCOUNT_NAV[0],
  vendor: { href: "/vendor-dashboard", label: "Vendor dashboard", icon: Briefcase },
  admin: { href: "/admin", label: "Admin", icon: ShieldCheck },
};
