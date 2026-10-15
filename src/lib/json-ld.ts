// Serialise JSON-LD for a <script type="application/ld+json"> tag. Values
// such as a vendor's name/bio are attacker-controlled, so escape everything
// that could close the <script> element or break the HTML/JS around it:
// "<", ">", "&" and the JS line separators U+2028/U+2029.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
