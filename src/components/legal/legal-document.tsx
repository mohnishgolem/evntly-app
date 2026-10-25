import Link from "next/link";
import { FileText } from "lucide-react";
import type { LegalBlock, LegalDocument } from "@/lib/legal/types";
import { tokenizeInline } from "@/lib/legal/inline";
import { LEGAL_DRAFT } from "@/lib/legal/versions";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

function formatVersion(version: string) {
  return new Date(`${version}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

export function Inline({ text }: { text: string }) {
  return (
    <>
      {tokenizeInline(text).map((t, i) => {
        if (t.type === "bold") return <strong key={i} className="font-semibold text-foreground">{t.value}</strong>;
        if (t.type === "tbc")
          return (
            <mark key={i} className="rounded bg-warning/15 px-1 py-0.5 text-[0.95em] text-foreground">
              To be confirmed: {t.value}
            </mark>
          );
        if (t.type === "link")
          return t.href.startsWith("/") ? (
            <Link key={i} href={t.href} className="font-medium text-foreground underline underline-offset-2">
              {t.value}
            </Link>
          ) : (
            <a key={i} href={t.href} className="font-medium text-foreground underline underline-offset-2" target="_blank" rel="noreferrer">
              {t.value}
            </a>
          );
        return <span key={i}>{t.value}</span>;
      })}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string")
    return (
      <p>
        <Inline text={block} />
      </p>
    );
  if ("list" in block)
    return (
      <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground/60">
        {block.list.map((item, i) => (
          <li key={i}>
            <Inline text={item} />
          </li>
        ))}
      </ul>
    );
  return (
    <p className="rounded-xl bg-secondary px-4 py-3">
      <Inline text={block.note} />
    </p>
  );
}

// Public legal page layout, shared by /terms, /privacy-policy,
// /vendor-agreement and /cancellation-refund-dispute-policy.
export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  const related = LEGAL_DOCUMENTS.filter((d) => d.key !== doc.key);
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Link href="/legal" className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground">
        Legal
      </Link>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[34px]">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Version {doc.version} · Last updated {formatVersion(doc.version)}
      </p>

      {LEGAL_DRAFT && (
        <p role="note" className="mt-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
          <strong className="font-semibold">Draft.</strong> This document is awaiting final review by an Australian
          solicitor and may change. Items marked &ldquo;To be confirmed&rdquo; haven&apos;t been decided yet.
        </p>
      )}

      <p className="mt-6 text-[17px] leading-relaxed text-foreground">{doc.summary}</p>

      {doc.keyPoints && (
        <section aria-labelledby="key-points" className="mt-6 rounded-2xl bg-secondary p-5">
          <h2 id="key-points" className="mb-3 text-base font-semibold">
            The key points
          </h2>
          <ul className="space-y-2 text-[15px] leading-relaxed text-foreground/90">
            {doc.keyPoints.map((p, i) => (
              <li key={i} className="flex gap-2.5">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-highlight" />
                <span>
                  <Inline text={p} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">This summary helps you find your way. The full text below is what applies.</p>
        </section>
      )}

      <details className="group mt-6 rounded-2xl border border-border print:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
          Contents
          <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <ol className="space-y-0.5 px-4 pb-4 text-[15px]">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="block py-1.5 text-muted-foreground hover:text-foreground">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </details>

      <div className="mt-8 space-y-9 text-[15px] leading-relaxed text-foreground/85">
        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24 space-y-3">
            <h2 id={`${s.id}-h`} className="text-lg font-semibold tracking-tight text-foreground">
              {s.title}
            </h2>
            {s.blocks.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </section>
        ))}
      </div>

      <nav aria-label="Other legal documents" className="mt-12 border-t border-border pt-6 print:hidden">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Other legal documents</h2>
        <ul className="overflow-hidden rounded-2xl bg-secondary">
          {related.map((d, i) => (
            <li key={d.key} className={i < related.length - 1 ? "border-b border-border/60" : ""}>
              <Link href={d.path} className="flex min-h-12 items-center gap-3 px-4 py-3 text-[15px] hover:bg-accent">
                <FileText className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
