import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { Inline } from "@/components/legal/legal-document";
import type { HelpArticle, HelpBlock, StatusTone } from "@/lib/help/content";
import { cn } from "@/lib/utils";

const TONE: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  waiting: "bg-warning/15 text-warning",
  active: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  ended: "bg-muted text-muted-foreground",
};

function Block({ block }: { block: HelpBlock }) {
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
  if ("steps" in block)
    return (
      <ol className="space-y-3">
        {block.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums"
            >
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">{s.title}</span>
              <span className="block">
                <Inline text={s.body} />
              </span>
            </span>
          </li>
        ))}
      </ol>
    );
  if ("note" in block)
    return (
      <p role="note" className="flex items-start gap-2 rounded-2xl bg-secondary px-4 py-3 text-[15px]">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <Inline text={block.note} />
        </span>
      </p>
    );
  return (
    <dl className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-secondary">
      {block.statuses.map((s) => (
        <div key={s.label} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
          <dt className="shrink-0 sm:w-48">
            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[s.tone])}>{s.label}</span>
          </dt>
          <dd className="text-[15px]">{s.body}</dd>
        </div>
      ))}
    </dl>
  );
}

/** An article's body, with its "do it in the app" link. */
export function HelpArticleBody({ article }: { article: HelpArticle }) {
  return (
    <div className="space-y-4 text-[16px] leading-relaxed text-muted-foreground">
      {article.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
      {article.action && (
        <p>
          <Link
            href={article.action.href}
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
          >
            {article.action.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </p>
      )}
    </div>
  );
}
