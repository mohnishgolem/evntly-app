// Which vendor accounts are internal/test and must never be counted as a
// genuine registration. Mirrors the SQL rules in
// .claude/skills/evntly-acquisition-truth/sql/verified_vendors.sql and
// supabase/migrations/20261121090000_verified_funnel_account_test_rules.sql
// (which replaces 20261120090000_admin_verified_vendor_funnel.sql's rules).

import { isListingComplete } from "@/lib/listing-completion";

export type VendorAccountFacts = {
  role: string | null;
  email: string | null;
  isDemo: boolean | null;
  campaign: string | null;
  listingName: string | null;
  /** auth user metadata full_name (or name): the name given at sign-up. */
  accountName?: string | null;
  userId?: string | null;
};

const INTERNAL_DOMAINS = ["evntlyapp.com"];
// Internal test logins whose name and email look like a real person's, so no
// rule can spot them. Keep in sync with the SQL copies.
export const INTERNAL_TEST_USER_IDS = ["75ff584a-0dc5-41cc-b69e-566f4bd731fa"]; // "saim", the QA vendor login
const QA_WORD = /(^|[^a-z])(qa|test)([^a-z]|$)/i;

export function isTestVendorAccount(v: VendorAccountFacts): boolean {
  if (v.role === "admin") return true;
  if (v.isDemo) return true;
  const domain = (v.email ?? "").toLowerCase().split("@")[1] ?? "";
  if (INTERNAL_DOMAINS.includes(domain)) return true;
  if ((v.campaign ?? "").toLowerCase().startsWith("qa")) return true;
  if (QA_WORD.test(v.listingName ?? "")) return true;
  // Accounts with no listing yet: judge the account itself (19 Nov: a +qa-vendor
  // alias, "krishiv test" and "saim" were counted as genuine vendors).
  const localPart = (v.email ?? "").toLowerCase().split("@")[0] ?? "";
  if (/\+(qa|test)/.test(localPart)) return true;
  if (QA_WORD.test(v.accountName ?? "")) return true;
  if (v.userId && INTERNAL_TEST_USER_IDS.includes(v.userId)) return true;
  return false;
}

export type VendorProgress = {
  verified: boolean;
  listingStatus: string | null;
  photos: number;
  packages: number;
};

export type FunnelStage = "account" | "verified" | "listing_created" | "approved" | "completed";

/** Furthest stage reached. Completed = approved + 3 photos + 1 active package. */
export function vendorStage(v: VendorProgress): FunnelStage {
  if (!v.verified) return "account";
  if (!v.listingStatus) return "verified";
  if (v.listingStatus !== "approved") return "listing_created";
  if (isListingComplete(v)) return "completed";
  return "approved";
}
