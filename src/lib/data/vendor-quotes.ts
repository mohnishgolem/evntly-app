import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { effectiveQuoteStatus } from "@/lib/quote-expiry";
import type { Database } from "@/lib/supabase/database.types";

export type VendorQuote = Database["public"]["Functions"]["my_quote_requests"]["Returns"][number];

// The vendor's quote requests, split by whose move it is. Enquiries are
// still waiting on the vendor's reply; Quotes are everything already priced,
// declined, cancelled or expired. Masked read: the customer's email is
// blanked and client_name is a short "Jane D." label (see my_quote_requests).
export const getVendorQuotes = cache(async function getVendorQuotes() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_quote_requests", { as_role: "vendor" });
  const all = data ?? [];
  return {
    enquiries: all.filter((q) => effectiveQuoteStatus(q) === "pending"),
    quotes: all.filter((q) => effectiveQuoteStatus(q) !== "pending"),
  };
});
