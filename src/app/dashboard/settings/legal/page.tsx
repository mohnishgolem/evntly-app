import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { getLegalStatus } from "@/lib/legal/status";
import { LEGAL_DOCUMENT_TITLE, legalDocumentHref } from "@/lib/legal/meta";
import type { LegalDocumentKey } from "@/lib/legal/types";
import { MarketingConsentToggle } from "@/components/legal/marketing-consent-toggle";

export const metadata: Metadata = {
  title: "Privacy & legal",
  robots: { index: false, follow: false },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
}

export default async function LegalSettingsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/settings/legal");
  const status = await getLegalStatus();
  const records = (status?.records ?? []).filter((r) => r.required || r.acceptedAt);

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Link href="/dashboard/settings" className="mb-3 -ml-1 inline-flex h-11 items-center gap-1 px-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Settings
      </Link>
      <h1 className="mb-1 text-[28px] font-bold tracking-tight">Privacy &amp; legal</h1>
      <p className="mb-6 text-sm text-muted-foreground">Your email choices and the documents you&apos;ve agreed to.</p>

      <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">Emails</h2>
      <div className="mb-6 overflow-hidden rounded-2xl bg-secondary">
        <MarketingConsentToggle initial={status?.marketing === true} />
      </div>

      <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">Documents</h2>
      <ul className="mb-3 overflow-hidden rounded-2xl bg-secondary">
        {records.map((r, i) => (
          <li key={r.document} className={`px-4 py-3 ${i < records.length - 1 ? "border-b border-border/60" : ""}`}>
            <Link href={legalDocumentHref(r.document as LegalDocumentKey)} className="text-[15px] font-medium underline-offset-2 hover:underline">
              {LEGAL_DOCUMENT_TITLE[r.document as LegalDocumentKey] ?? r.document}
            </Link>
            <p className="text-xs text-muted-foreground">
              {r.accepted && r.acceptedAt
                ? `${r.document === "privacy_policy" ? "Acknowledged" : "Accepted"} version ${r.version} on ${formatDate(r.acceptedAt)}`
                : `Version ${r.version} not yet accepted`}
            </p>
          </li>
        ))}
        {records.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No records yet.</li>}
      </ul>
      <p className="mb-6 px-1 text-xs text-muted-foreground">
        To ask for a copy of the personal information we hold about you, or to correct it, email{" "}
        <a href="mailto:hello@evntlyapp.com" className="underline underline-offset-2">hello@evntlyapp.com</a>.
      </p>

      <Link
        href="/dashboard/settings/delete-account"
        className="flex min-h-12 items-center rounded-2xl bg-secondary px-4 py-3 text-[15px] font-medium text-destructive hover:bg-accent"
      >
        Delete account
      </Link>
    </div>
  );
}
