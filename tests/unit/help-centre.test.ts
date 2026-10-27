import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CUSTOMER_GUIDE, HELP_TOPICS, VENDOR_GUIDE, helpArticles, type HelpBlock } from "@/lib/help/content";
import { searchHelp, searchIndex } from "@/lib/help/search";
import { tokenizeInline } from "@/lib/legal/inline";
import {
  ONBOARDING_KEY,
  isQuietPath,
  onboardingStatus,
  shouldAutoStartOnboarding,
} from "@/lib/onboarding";
import { HELP_NAV_ITEM, drawerSections } from "@/lib/nav";

const off = helpArticles({ paymentsEnabled: false });
const on = helpArticles({ paymentsEnabled: true });

function blockStrings(b: HelpBlock): string[] {
  if (typeof b === "string") return [b];
  if ("list" in b) return b.list;
  if ("steps" in b) return b.steps.flatMap((s) => [s.title, s.body]);
  if ("note" in b) return [b.note];
  return b.statuses.flatMap((s) => [s.label, s.body]);
}
const allText = (articles = off) =>
  articles.flatMap((a) => [a.title, a.summary, ...a.blocks.flatMap(blockStrings)]).join("\n");

const APP = join(__dirname, "../../src/app");
function pageExists(href: string) {
  const path = href.split(/[?#]/)[0];
  if (path === "/") return existsSync(join(APP, "page.tsx"));
  if (path.startsWith("/help/articles/")) return off.some((a) => `/help/articles/${a.slug}` === path);
  return existsSync(join(APP, path, "page.tsx"));
}

describe("help content", () => {
  it("has unique slugs, known topics and a page behind every topic", () => {
    const slugs = off.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const topics = new Set(HELP_TOPICS.map((t) => t.id));
    for (const a of off) expect(topics.has(a.topic)).toBe(true);
    for (const t of HELP_TOPICS) expect(off.some((a) => a.topic === t.id)).toBe(true);
  });

  it("guides and related links only point at real articles", () => {
    const slugs = new Set(off.map((a) => a.slug));
    for (const s of [...CUSTOMER_GUIDE, ...VENDOR_GUIDE].flatMap((g) => g.articles)) expect(slugs).toContain(s);
    for (const a of off) for (const r of a.related ?? []) expect(slugs).toContain(r);
  });

  it("customer guide covers every customer article, vendor guide every vendor article", () => {
    const inCustomer = new Set(CUSTOMER_GUIDE.flatMap((g) => g.articles));
    const inVendor = new Set(VENDOR_GUIDE.flatMap((g) => g.articles));
    for (const a of off) {
      if (a.audience === "customer") expect(inCustomer).toContain(a.slug);
      if (a.audience === "vendor") expect(inVendor).toContain(a.slug);
    }
  });

  it("every in-app link and action goes to a page that exists", () => {
    const hrefs = [
      ...off.flatMap((a) => (a.action ? [a.action.href] : [])),
      ...off.flatMap((a) => a.blocks.flatMap(blockStrings)).flatMap((t) =>
        tokenizeInline(t).flatMap((tok) => (tok.type === "link" && tok.href.startsWith("/") ? [tok.href] : [])),
      ),
    ];
    expect(hrefs.length).toBeGreaterThan(10);
    for (const h of hrefs) expect(pageExists(h), h).toBe(true);
  });

  it("matches the platform's real rules", () => {
    const text = allText();
    expect(text).toMatch(/7 days/); // quote_expiry_for
    expect(text).toMatch(/90 days after the event/); // open_booking_dispute window
    expect(text).toMatch(/Pending[\s\S]*vendor needs to confirm/);
    expect(text).toMatch(/Nobody can mark a booking completed on their own/);
    expect(text).toMatch(/24–48 hours/); // vendor signup confirmation copy
  });

  it("while payments are off, says to pay vendors directly and never promises online payments", () => {
    const text = allText(off);
    expect(text).toMatch(/You pay the vendor directly/);
    expect(text).toMatch(/Your customer pays you directly/);
    expect(text).not.toMatch(/escrow|held by Evntly|Stripe|pay (?:online|by card) (?:on|through) Evntly|payout/i);
    expect(text).not.toMatch(/coming soon|soon you'll|will be able to/i);
  });

  it("mentions online payment plans only when payments are switched on", () => {
    expect(allText(off)).not.toMatch(/payment plan/i);
    expect(allText(on)).toMatch(/payment plan/i);
  });
});

describe("help search", () => {
  const docs = searchIndex(off);

  it("finds articles by title, keyword and body text, best first", () => {
    expect(searchHelp(docs, "cancel")[0].slug).toBe("cancel-a-booking");
    expect(searchHelp(docs, "expired").map((d) => d.slug)).toContain("quote-statuses");
    expect(searchHelp(docs, "phone number").map((d) => d.slug)).toContain("messaging");
  });

  it("matches word prefixes and needs every word", () => {
    expect(searchHelp(docs, "canc").length).toBeGreaterThan(0);
    expect(searchHelp(docs, "cancel zzzz")).toEqual([]);
    expect(searchHelp(docs, "   ")).toEqual([]);
  });

  it("filters by audience, keeping shared articles", () => {
    const vendor = searchHelp(docs, "booking", "vendor");
    expect(vendor.every((d) => d.audience !== "customer")).toBe(true);
    expect(vendor.map((d) => d.slug)).toContain("booking-statuses");
  });

  it("treats regex characters in the query as text", () => {
    expect(() => searchHelp(docs, "(quote) [*+?")).not.toThrow();
  });
});

describe("onboarding rules", () => {
  const newUser = "2026-10-30T02:00:00Z";
  const oldUser = "2026-09-01T02:00:00Z";

  it("starts on its own only for new accounts", () => {
    expect(shouldAutoStartOnboarding({ accountCreatedAt: newUser, metadata: {}, legalOutstanding: 0 })).toBe(true);
    expect(shouldAutoStartOnboarding({ accountCreatedAt: oldUser, metadata: {}, legalOutstanding: 0 })).toBe(false);
    expect(shouldAutoStartOnboarding({ accountCreatedAt: null, metadata: {}, legalOutstanding: 0 })).toBe(false);
  });

  it("never again once finished or skipped", () => {
    for (const status of ["completed", "skipped"]) {
      const metadata = { [ONBOARDING_KEY]: { status, at: newUser } };
      expect(onboardingStatus(metadata)).toBe(status);
      expect(shouldAutoStartOnboarding({ accountCreatedAt: newUser, metadata, legalOutstanding: 0 })).toBe(false);
    }
  });

  it("ignores junk in metadata", () => {
    expect(onboardingStatus({ [ONBOARDING_KEY]: "completed" })).toBeNull();
    expect(onboardingStatus({ [ONBOARDING_KEY]: { status: "nope" } })).toBeNull();
    expect(onboardingStatus(null)).toBeNull();
  });

  it("waits for the Terms prompt", () => {
    expect(shouldAutoStartOnboarding({ accountCreatedAt: newUser, metadata: {}, legalOutstanding: 2 })).toBe(false);
  });

  it("stays out of auth, legal, signup, admin and invoice pages", () => {
    for (const p of ["/login", "/signup", "/terms", "/legal", "/vendor-signup", "/admin/risk", "/bookings/abc/invoice"])
      expect(isQuietPath(p), p).toBe(true);
    for (const p of ["/", "/dashboard", "/vendor-dashboard", "/bookings/abc", "/help"]) expect(isQuietPath(p), p).toBe(false);
  });
});

describe("Help & Guides in the menu", () => {
  it("appears for every role", () => {
    for (const role of ["guest", "customer", "vendor", "admin"] as const) {
      const hrefs = drawerSections(role).flatMap((s) => s.items.map((i) => i.href));
      expect(hrefs, role).toContain(HELP_NAV_ITEM.href);
    }
  });
});
