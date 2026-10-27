import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { GuideSection, HelpArticle } from "@/lib/help/content";
import { HelpArticleBody } from "@/components/help/help-blocks";

// A whole guide on one page: every article in order, with a contents list
// (sticky beside the text on wide screens, at the top on phones).
export function GuideView({
  title,
  intro,
  sections,
  articles,
  otherGuide,
}: {
  title: string;
  intro: string;
  sections: GuideSection[];
  articles: HelpArticle[];
  otherGuide: { href: string; label: string };
}) {
  const bySlug = new Map(articles.map((a) => [a.slug, a]));
  const resolved = sections.map((s) => ({
    ...s,
    items: s.articles.map((slug) => bySlug.get(slug)).filter((a): a is HelpArticle => !!a),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <Link href="/help" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Help &amp; Guides
      </Link>
      <header className="max-w-2xl">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[40px]">{title}</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">{intro}</p>
      </header>

      <div className="mt-10 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Guide contents" className="mb-10 lg:mb-0">
          <div className="rounded-2xl bg-secondary p-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:bg-transparent lg:p-0">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Contents</p>
            <ol className="space-y-3">
              {resolved.map((s, i) => (
                <li key={s.title}>
                  <a href={`#section-${i + 1}`} className="text-[15px] font-semibold hover:text-primary">
                    {i + 1}. {s.title}
                  </a>
                  <ul className="mt-1 space-y-0.5 border-l border-border pl-3">
                    {s.items.map((a) => (
                      <li key={a.slug}>
                        <a href={`#${a.slug}`} className="block py-0.5 text-sm text-muted-foreground hover:text-foreground">
                          {a.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="min-w-0 max-w-2xl">
          {resolved.map((s, i) => (
            <section key={s.title} id={`section-${i + 1}`} aria-labelledby={`section-${i + 1}-title`} className="scroll-mt-24 not-first:mt-14">
              <p className="text-sm font-semibold text-primary tabular-nums">Part {i + 1}</p>
              <h2 id={`section-${i + 1}-title`} className="text-2xl font-bold tracking-tight">
                {s.title}
              </h2>
              {s.items.map((a) => (
                <article key={a.slug} id={a.slug} aria-labelledby={`${a.slug}-title`} className="mt-8 scroll-mt-24">
                  <h3 id={`${a.slug}-title`} className="mb-3 text-[19px] font-semibold tracking-tight">
                    {a.title}
                  </h3>
                  <HelpArticleBody article={a} />
                </article>
              ))}
            </section>
          ))}

          <div className="mt-14 flex flex-col gap-3 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] text-muted-foreground">
              Questions? Email{" "}
              <a href="mailto:hello@evntlyapp.com" className="font-medium text-foreground underline underline-offset-2">
                hello@evntlyapp.com
              </a>
            </p>
            <Link href={otherGuide.href} className="text-[15px] font-medium text-primary hover:underline">
              {otherGuide.label}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
