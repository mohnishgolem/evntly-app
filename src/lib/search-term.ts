// Turns what someone typed into Explore's search box into a term that is safe
// to put inside a PostgREST `.or()` filter. Commas and brackets are filter
// syntax there, so "North Sydney, NSW" used to break the whole query (no
// results) and crafted input could add its own filter conditions.
export function cleanSearchTerm(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .split(",")[0] // "North Sydney, NSW 2060" → "North Sydney"
    .replace(/[%*()\\"]/g, " ")
    .replace(/\b(nsw|new south wales)\b/gi, " ")
    .replace(/\b\d{4}\b/g, " ") // postcodes
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
