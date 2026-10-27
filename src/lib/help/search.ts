import { plainText } from "@/lib/legal/inline";
import type { HelpArticle, HelpBlock } from "@/lib/help/content";

// Client-side search over the Help Centre: small enough (a few dozen
// articles) to rank in the browser on every keystroke.

function blockText(block: HelpBlock): string {
  if (typeof block === "string") return plainText(block);
  if ("list" in block) return block.list.map(plainText).join(" ");
  if ("steps" in block) return block.steps.map((s) => `${s.title} ${plainText(s.body)}`).join(" ");
  if ("note" in block) return plainText(block.note);
  return block.statuses.map((s) => `${s.label} ${s.body}`).join(" ");
}

export type SearchDoc = {
  slug: string;
  title: string;
  summary: string;
  audience: HelpArticle["audience"];
  topic: HelpArticle["topic"];
  keywords: string;
  body: string;
};

/** The searchable text of each article — serialisable, so the server builds it. */
export function searchIndex(articles: HelpArticle[]): SearchDoc[] {
  return articles.map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    audience: a.audience,
    topic: a.topic,
    keywords: a.keywords.join(" ").toLowerCase(),
    body: a.blocks.map(blockText).join(" ").toLowerCase(),
  }));
}

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ");

/**
 * Articles matching every word of the query, best first: title hits beat
 * keyword hits beat body hits. Words are matched as prefixes, so "canc"
 * finds "cancel" and "cancellation".
 */
export function searchHelp(docs: SearchDoc[], query: string, audience?: "customer" | "vendor"): SearchDoc[] {
  const words = normalise(query).split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const scored: { doc: SearchDoc; score: number }[] = [];
  for (const doc of docs) {
    if (audience && doc.audience !== audience && doc.audience !== "both") continue;
    const title = normalise(doc.title);
    const summary = normalise(doc.summary);
    let score = 0;
    let all = true;
    for (const w of words) {
      const re = new RegExp(`(^|[\\s-])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
      const s =
        (re.test(title) ? 10 : 0) + (re.test(doc.keywords) ? 6 : 0) + (re.test(summary) ? 4 : 0) + (re.test(doc.body) ? 1 : 0);
      if (s === 0) {
        all = false;
        break;
      }
      score += s;
    }
    if (all) scored.push({ doc, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title)).map((s) => s.doc);
}
