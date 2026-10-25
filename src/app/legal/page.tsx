import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { LEGAL_CONTACT_EMAIL, LEGAL_DRAFT, LEGAL_ENTITY } from "@/lib/legal/versions";

export const metadata: Metadata = {
  title: "Legal",
  description: "Evntly's Terms, Privacy Policy, Cancellation, Refund & Dispute Policy and Vendor Service Agreement.",
  alternates: { canonical: "/legal" },
};

export default function LegalIndexPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[34px]">Legal</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
        The documents that apply when you use Evntly. Evntly is operated by {LEGAL_ENTITY}, Sydney NSW.
      </p>
      {LEGAL_DRAFT && (
        <p role="note" className="mt-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <strong className="font-semibold">Draft.</strong> These documents are awaiting final review by an Australian
          solicitor and may change.
        </p>
      )}
      <ul className="mt-8 overflow-hidden rounded-2xl bg-secondary">
        {LEGAL_DOCUMENTS.map((d, i) => (
          <li key={d.key} className={i < LEGAL_DOCUMENTS.length - 1 ? "border-b border-border/60" : ""}>
            <Link href={d.path} className="flex items-center gap-3 px-4 py-4 hover:bg-accent">
              <FileText className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{d.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{d.summary}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-muted-foreground">
        Questions? Email{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-medium text-foreground underline underline-offset-2">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
