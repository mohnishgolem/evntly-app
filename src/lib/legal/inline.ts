// Tiny inline-markup tokenizer shared by the page renderer and the Markdown
// exporter: **bold**, [text](href) and [[TBC: note]] placeholders.

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; value: string; href: string }
  | { type: "tbc"; value: string };

const PATTERN = /\*\*(.+?)\*\*|\[\[TBC:\s*(.+?)\]\]|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    if (m.index > last) tokens.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: "bold", value: m[1] });
    else if (m[2] !== undefined) tokens.push({ type: "tbc", value: m[2] });
    else tokens.push({ type: "link", value: m[3], href: m[4] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}

/** Plain text with markup removed — for page descriptions. */
export function plainText(text: string) {
  return tokenizeInline(text)
    .map((t) => (t.type === "tbc" ? `[To be confirmed: ${t.value}]` : t.value))
    .join("");
}
