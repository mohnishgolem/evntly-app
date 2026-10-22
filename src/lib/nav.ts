import {
  BarChart3,
  Briefcase,
  CalendarDays,
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
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Tags,
  UserRound,
  Users,
  Wallet,
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
  /** Shows the unread-message count. */
  badge?: "unread";
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

/** The one item to highlight in a list: the longest matching href wins. */
export function activeHref(pathname: string, items: NavItem[]) {
  return items
    .filter((item) => isNavItemActive(pathname, item))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

// ── Marketplace (header links for everyone) ─────────────────────────────
export const MARKETPLACE_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/explore", label: "Explore Vendors", icon: Search, match: ["/vendor"] },
  { href: "/bundles", label: "Bundles", icon: Package },
  { href: "/plan", label: "Start Planning", icon: Sparkles },
];

// ── Customer ─────────────────────────────────────────────────────────────
// Quotes and bookings are deliberately not top-level: they live inside the
// dashboard (CUSTOMER_DASHBOARD_TABS) and on each event's page.
export const CUSTOMER_ACCOUNT_NAV: NavItem[] = [
  { href: "/dashboard", label: "My Dashboard", icon: LayoutDashboard, match: ["/saved"] },
  { href: "/messages", label: "Messages", icon: MessageCircle, badge: "unread" },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export const CUSTOMER_DASHBOARD_TABS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/events", label: "My Events", icon: CalendarDays },
  { href: "/dashboard/quotes", label: "Quotes", icon: FileText },
  { href: "/dashboard/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/dashboard/bundles", label: "Bundles", icon: Package },
  { href: "/dashboard/event-feed", label: "Event Feed", icon: Inbox },
  { href: "/messages", label: "Messages", icon: MessageCircle },
];

// Phone tab bar for signed-in customers (below md; the header covers wider
// screens). Four destinations, per Apple's 3–5 tab guidance.
export const CUSTOMER_TAB_BAR: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home, exact: true, match: ["/saved", "/profile"] },
  { href: "/dashboard/events", label: "Events", icon: CalendarDays, match: ["/plan"] },
  { href: "/explore", label: "Explore", icon: Search, match: ["/vendor", "/bundles"] },
  { href: "/messages", label: "Messages", icon: MessageCircle, badge: "unread" },
];

// ── Vendor ───────────────────────────────────────────────────────────────
// Enquiries = new requests waiting on the vendor (quote requests still
// pending, Event Feed leads, messages). Quotes = requests the vendor has
// priced. Same quote_requests rows, split by status.
export const VENDOR_NAV: NavItem[] = [
  { href: "/vendor-dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  {
    href: "/vendor-dashboard/enquiries",
    label: "Enquiries",
    icon: Inbox,
    match: ["/vendor-dashboard/event-feed", "/messages"],
    badge: "unread",
  },
  { href: "/vendor-dashboard/quotes", label: "Quotes", icon: FileText },
  { href: "/vendor-dashboard/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/vendor-dashboard/calendar", label: "Calendar", icon: CalendarDays },
  {
    href: "/vendor-dashboard/business",
    label: "My Business",
    icon: Briefcase,
    match: [
      "/vendor-dashboard/edit",
      "/vendor-dashboard/pricing",
      "/vendor-dashboard/portfolio",
      "/vendor-dashboard/bundles",
      "/vendor-dashboard/payouts",
    ],
  },
  { href: "/vendor-dashboard/earnings", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, match: ["/profile"] },
];

export const VENDOR_ENQUIRY_TABS: NavItem[] = [
  { href: "/vendor-dashboard/enquiries", label: "Quote requests", icon: FileText },
  { href: "/vendor-dashboard/event-feed", label: "Event Feed", icon: Inbox },
  { href: "/messages", label: "Messages", icon: MessageCircle },
];

export const VENDOR_BUSINESS_TABS: NavItem[] = [
  { href: "/vendor-dashboard/business", label: "Listings", icon: Store, match: ["/vendor-dashboard/edit"] },
  { href: "/vendor-dashboard/pricing", label: "Service & pricing", icon: Tags },
  { href: "/vendor-dashboard/portfolio", label: "Portfolio", icon: LayoutGrid },
  { href: "/vendor-dashboard/bundles", label: "Bundles", icon: Package },
  { href: "/vendor-dashboard/payouts", label: "Payouts", icon: Wallet },
];

// ── Admin ────────────────────────────────────────────────────────────────
// Only sections that exist. Bookings and Settings are added when built.
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/approvals", label: "Vendor Approvals", icon: ShieldCheck },
  { href: "/admin/vendors", label: "Vendors", icon: Store },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/support", label: "Support", icon: Flag },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

// Server components pass one of these names to client nav components
// (DashboardNav, AppSidebar), never the arrays: the icons are component
// functions and can't cross the server/client boundary.
export const NAV_SETS = {
  customerTabs: CUSTOMER_DASHBOARD_TABS,
  customerTabBar: CUSTOMER_TAB_BAR,
  vendor: VENDOR_NAV,
  vendorEnquiryTabs: VENDOR_ENQUIRY_TABS,
  vendorBusinessTabs: VENDOR_BUSINESS_TABS,
  admin: ADMIN_NAV,
} satisfies Record<string, NavItem[]>;

export type NavSetName = keyof typeof NAV_SETS;

/** Drawer contents for a role. */
export function drawerSections(role: NavRole): NavSection[] {
  switch (role) {
    case "guest":
      return [{ items: MARKETPLACE_NAV }];
    case "customer":
      return [{ items: MARKETPLACE_NAV }, { title: "Account", items: CUSTOMER_ACCOUNT_NAV }];
    case "vendor":
      return [
        { title: "Your business", items: VENDOR_NAV },
        { title: "Marketplace", items: MARKETPLACE_NAV.slice(0, 3) },
      ];
    case "admin":
      return [
        { title: "Admin", items: ADMIN_NAV },
        { title: "Marketplace", items: MARKETPLACE_NAV },
        {
          title: "Account",
          items: CUSTOMER_ACCOUNT_NAV.filter((i) => i.href !== "/dashboard"),
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
