import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/user";
import type { LegalDocumentKey } from "@/lib/legal/types";

export type LegalStatus = {
  /** Documents the user must accept (at the current version) and hasn't. */
  outstanding: LegalDocumentKey[];
  /** Whether they've ever accepted anything (false → first-time prompt, e.g. Google sign-up). */
  hasHistory: boolean;
  /** Latest marketing choice; null if they've never been asked. */
  marketing: boolean | null;
  records: { document: string; version: string; acceptedAt: string | null; accepted: boolean; required: boolean }[];
};

// What the signed-in user still has to accept. Read once per request (the
// gate, the vendor wizard and the settings page can all ask). Fails closed
// for the gate's purposes only in the sense that a failed read shows nothing
// outstanding — the database still refuses protected writes without
// acceptance (legal_enforcement migration), so this can't be used to bypass.
export const getLegalStatus = cache(async function getLegalStatus(): Promise<LegalStatus | null> {
  const session = await getCurrentUser();
  if (!session) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_legal_status");
  if (error || !data) {
    if (error) console.error("[legal] my_legal_status failed:", error.message);
    return null;
  }
  const outstanding = data
    .filter((r) => r.required && !r.accepted && r.document !== "marketing_emails")
    .map((r) => r.document as LegalDocumentKey);
  const marketingRow = data.find((r) => r.document === "marketing_emails");
  return {
    outstanding,
    hasHistory: !!session.profile?.terms_version || data.some((r) => r.accepted_at),
    marketing: marketingRow?.marketing_granted ?? null,
    records: data
      .filter((r) => r.document !== "marketing_emails")
      .map((r) => ({
        document: r.document,
        version: r.current_version,
        acceptedAt: r.accepted_at,
        accepted: r.accepted,
        required: r.required,
      })),
  };
});

// Database errors from the legal_enforcement triggers start with this.
export const LEGAL_REQUIRED_PREFIX = "LEGAL_ACCEPTANCE_REQUIRED";
export const LEGAL_REQUIRED_MESSAGE =
  "Please accept Evntly's updated Terms to continue. Refresh the page to see them.";

/** Turns a legal-acceptance DB error into a friendly message; other messages pass through. */
export function friendlyLegalError(message: string): string {
  return message.includes(LEGAL_REQUIRED_PREFIX) ? LEGAL_REQUIRED_MESSAGE : message;
}
