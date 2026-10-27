import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPaymentsStatus } from "@/lib/payments/server";
import { HELP_TOPICS, helpArticle, helpArticles } from "@/lib/help/content";
import { HelpArticleBody } from "@/components/help/help-blocks";

// Article metadata doesn't depend on the payments switch.
const STATIC_CONTEXT = { paymentsEnabled: false };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = helpArticle(slug, STATIC_CONTEXT);
  if (!article) return { title: "Help article not found" };
  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: `/help/articles/${article.slug}` },
  };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { enabled } = await getPaymentsStatus();
  const articles = helpArticles({ paymentsEnabled: enabled });
  const article = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  const topic = HELP_TOPICS.find((t) => t.id === article.topic);
  const related = (article.related ?? [])
    .map((s) => articles.find((a) => a.slug === s))
    .filter((a): a is NonNullable<typeof a> => !!a);
  const guide =
    article.audience === "vendor"
      ? { href: "/help/vendors", label: "Vendor guide" }
      : article.audience === "customer"
        ? { href: "/help/customers", label: "Customer guide" }
        : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href="/help" className="inline-flex min-h-11 items-center gap-1 hover:text-foreground">
              <ChevronLeft className="size-4" aria-hidden /> Help &amp; Guides
            </Link>
          </li>
          {topic && (
            <li aria-current="page" className="before:mr-1 before:content-['/']">
              {topic.title}
            </li>
          )}
        </ol>
      </nav>

      <article aria-labelledby="article-title">
        <h1 id="article-title" className="text-[28px] leading-tight font-bold tracking-tight sm:text-[34px]">
          {article.title}
        </h1>
        <p className="mt-2 mb-8 text-[17px] text-muted-foreground">{article.summary}</p>
        <HelpArticleBody article={article} />
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-12">
          <h2 id="related-heading" className="mb-3 text-[15px] font-semibold">
            Related
          </h2>
          <ul className="overflow-hidden rounded-2xl bg-secondary">
            {related.map((r, i) => (
              <li key={r.slug} className={i < related.length - 1 ? "border-b border-border/60" : ""}>
                <Link
                  href={`/help/articles/${r.slug}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3 text-[15px] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">{r.title}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        {guide && (
          <>
            Part of the{" "}
            <Link href={`${guide.href}#${article.slug}`} className="font-medium text-foreground underline underline-offset-2">
              {guide.label}
            </Link>
            .{" "}
          </>
        )}
        Didn&apos;t answer your question? Email{" "}
        <a href="mailto:hello@evntlyapp.com" className="font-medium text-foreground underline underline-offset-2">
          hello@evntlyapp.com
        </a>
        .
      </p>
    </div>
  );
}
