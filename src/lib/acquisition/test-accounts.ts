// Which vendor accounts are internal/test and must never be counted as a
// genuine registration. Mirrors the SQL rules in
// .claude/skills/evntly-acquisition-truth/sql/verified_vendors.sql and
// supabase/migrations/20261120090000_admin_verified_vendor_funnel.sql.

import { isListingComplete } from "@/lib/listing-completion";

export type VendorAccountFacts = {
  role: string | null;
  email: string | null;
  isDemo: boolean | null;
  campaign: string | null;
  listingName: string | null;
};

const INTERNAL_DOMAINS = ["evntlyapp.com"];

export function isTestVendorAccount(v: VendorAccountFacts): boolean {
  if (v.role === "admin") return true;
  if (v.isDemo) return true;
  const domain = (v.email ?? "").toLowerCase().split("@")[1] ?? "";
  if (INTERNAL_DOMAINS.includes(domain)) return true;
  if ((v.campaign ?? "").toLowerCase().startsWith("qa")) return true;
  if (/(^|[^a-z])(qa|test)([^a-z]|$)/i.test(v.listingName ?? "")) return true;
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
