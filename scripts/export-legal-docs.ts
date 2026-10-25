// Writes the public legal documents to docs/legal/*.md for solicitor review,
// from the same source the website renders (src/lib/legal/documents).
//
//   npx vite-node --config vitest.config.mts scripts/export-legal-docs.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { tokenizeInline } from "@/lib/legal/inline";
import type { LegalBlock } from "@/lib/legal/types";
import { SITE_URL } from "@/lib/config";

function inline(text: string) {
  return tokenizeInline(text)
    .map((t) => {
      if (t.type === "bold") return `**${t.value}**`;
      if (t.type === "tbc") return `**[TO BE CONFIRMED: ${t.value}]**`;
      if (t.type === "link") return `[${t.value}](${t.href.startsWith("/") ? SITE_URL + t.href : t.href})`;
      return t.value;
    })
    .join("");
}

function block(b: LegalBlock) {
  if (typeof b === "string") return inline(b);
  if ("list" in b) return b.list.map((i) => `- ${inline(i)}`).join("\n");
  return `> ${inline(b.note)}`;
}

mkdirSync("docs/legal", { recursive: true });
for (const doc of LEGAL_DOCUMENTS) {
  const md = [
    `# ${doc.title}`,
    "",
    `**DRAFT — requires final review and approval by a practising Australian solicitor before reliance.**`,
    "",
    `Version ${doc.version} · Published at ${SITE_URL}${doc.path}`,
    "",
    doc.summary,
    "",
    ...(doc.keyPoints ? ["## Key points", "", ...doc.keyPoints.map((p) => `- ${inline(p)}`), ""] : []),
    ...doc.sections.flatMap((s) => [`## ${s.title}`, "", ...s.blocks.flatMap((b) => [block(b), ""])]),
  ].join("\n");
  const file = `docs/legal/${doc.path.slice(1)}.md`;
  writeFileSync(file, md);
  console.log("wrote", file);
}
