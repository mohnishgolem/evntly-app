// Waitlist CSV import and recruitment CSV export. No dependencies: the files
// are small (hundreds of rows) and come from a spreadsheet or form tool.

export type WaitlistRow = {
  email: string;
  first_name: string | null;
  business_name: string | null;
  category: string | null;
  suburb: string | null;
  invite_consent: boolean;
  consent_note: string | null;
};

export type ParsedWaitlist = { rows: WaitlistRow[]; errors: string[] };

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => r.some((f) => f.trim()));
}

const HEADER_ALIASES: Record<keyof WaitlistRow, string[]> = {
  email: ["email", "email address", "e-mail"],
  first_name: ["first_name", "first name", "firstname", "name", "full name"],
  business_name: ["business_name", "business name", "business", "company"],
  category: ["category", "service", "service type", "vendor type"],
  suburb: ["suburb", "location", "area", "city"],
  invite_consent: ["invite_consent", "consent", "opted_in", "opted in", "opt in", "marketing consent", "invite"],
  consent_note: ["consent_note", "consent note", "consent source", "notes"],
};

const YES = new Set(["yes", "y", "true", "1", "opted in", "opt-in", "subscribed", "x", "✓"]);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const clip = (v: string | undefined, max: number) => {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Rows need an email. Consent is only true when the consent column says so
 * explicitly — a missing column means nobody is invitable.
 */
export function parseWaitlistCsv(text: string): ParsedWaitlist {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length === 0) return { rows: [], errors: ["The file is empty."] };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as (keyof WaitlistRow)[]).map((k) => [k, header.findIndex((h) => HEADER_ALIASES[k].includes(h))]),
  ) as Record<keyof WaitlistRow, number>;
  if (col.email < 0) return { rows: [], errors: ['No "email" column found in the first row.'] };
  if (col.invite_consent < 0) errors.push('No consent column ("invite_consent") — rows are imported but nobody can be invited until consent is recorded.');

  const seen = new Set<string>();
  const rows: WaitlistRow[] = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const email = cells[col.email]?.trim() ?? "";
    if (!EMAIL.test(email) || email.length > 254) {
      errors.push(`Row ${line}: "${email.slice(0, 60)}" isn't a valid email — skipped.`);
      return;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      errors.push(`Row ${line}: ${email} appears twice — kept the first.`);
      return;
    }
    seen.add(key);
    const get = (k: keyof WaitlistRow) => (col[k] >= 0 ? cells[col[k]] : undefined);
    const name = clip(get("first_name"), 80);
    rows.push({
      email,
      first_name: name ? name.split(/\s+/)[0] : null,
      business_name: clip(get("business_name"), 160),
      category: clip(get("category"), 40),
      suburb: clip(get("suburb"), 80),
      invite_consent: YES.has((get("invite_consent") ?? "").trim().toLowerCase()),
      consent_note: clip(get("consent_note"), 300),
    });
  });
  return { rows, errors };
}

/** CSV with every field quoted; formula-leading characters neutralised for spreadsheets. */
export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const cell = (v: string | number | boolean | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
