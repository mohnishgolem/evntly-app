import type { WaitlistRow } from "@/lib/founding/csv";

// Classifies parsed waitlist rows against what Evntly already knows, for the
// import "Check file" report and to decide what an import skips. Pure: the
// caller looks the facts up and passes them in.

export type ContactFacts = {
  onWaitlist: boolean;
  unsubscribed: boolean;
  /** Invitation status, if one exists. */
  inviteStatus: string | null;
  deliveryStatus: string | null;
  hasAccount: boolean;
  registeredVendor: boolean;
  applied: boolean;
};

export type RowVerdict =
  | "eligible"
  | "no_consent"
  | "suppressed"
  | "unsubscribed"
  | "registered_vendor"
  | "already_applied"
  | "already_invited";

export const VERDICT_LABEL: Record<RowVerdict, string> = {
  eligible: "Eligible to invite",
  no_consent: "No invitation consent in the file",
  suppressed: "Suppressed (bounced, spam complaint or undeliverable address)",
  unsubscribed: "Unsubscribed",
  registered_vendor: "Already a registered vendor",
  already_applied: "Already applied as a Founding Vendor",
  already_invited: "Already invited",
};

// Reserved, never-deliverable domains (same list as lib/email.ts).
const UNDELIVERABLE_DOMAIN = /(\.(test|example|invalid|localhost)|@example\.(com|net|org))$/i;

export function isUndeliverable(email: string) {
  return UNDELIVERABLE_DOMAIN.test(email.trim());
}

/** "jane@photo.com.au" → "j•••@photo.com.au" for reports. */
export function maskEmail(email: string) {
  const [local, domain] = email.trim().toLowerCase().split("@");
  return domain ? `${local.slice(0, 1)}•••@${domain}` : "•••";
}

export function classifyRow(row: WaitlistRow, facts: ContactFacts | undefined): RowVerdict {
  const f = facts ?? { onWaitlist: false, unsubscribed: false, inviteStatus: null, deliveryStatus: null, hasAccount: false, registeredVendor: false, applied: false };
  if (f.registeredVendor) return "registered_vendor";
  if (f.applied) return "already_applied";
  if (isUndeliverable(row.email) || f.deliveryStatus === "bounced" || f.deliveryStatus === "complained") return "suppressed";
  if (f.unsubscribed) return "unsubscribed";
  if (f.inviteStatus && f.inviteStatus !== "pending" && f.inviteStatus !== "failed") return "already_invited";
  if (!row.invite_consent) return "no_consent";
  return "eligible";
}

export type ImportReport = {
  rowsInFile: number;
  counts: Record<RowVerdict, number>;
  alreadyOnWaitlist: number;
  withAccount: number;
  /** Row-level notes with masked addresses, for the admin. */
  notes: string[];
};

export function buildReport(rows: WaitlistRow[], factsByEmail: Map<string, ContactFacts>, parseErrors: string[]): ImportReport {
  const counts = Object.fromEntries(Object.keys(VERDICT_LABEL).map((k) => [k, 0])) as Record<RowVerdict, number>;
  const notes: string[] = [...parseErrors];
  let alreadyOnWaitlist = 0;
  let withAccount = 0;
  for (const row of rows) {
    const facts = factsByEmail.get(row.email.toLowerCase());
    const verdict = classifyRow(row, facts);
    counts[verdict]++;
    if (facts?.onWaitlist) alreadyOnWaitlist++;
    if (facts?.hasAccount) withAccount++;
    if (verdict !== "eligible") notes.push(`${maskEmail(row.email)}: ${VERDICT_LABEL[verdict]}`);
  }
  return { rowsInFile: rows.length, counts, alreadyOnWaitlist, withAccount, notes };
}

/** Rows an import writes: everything except registered vendors and undeliverable addresses. */
export function shouldImport(row: WaitlistRow, facts: ContactFacts | undefined) {
  return !facts?.registeredVendor && !isUndeliverable(row.email);
}
