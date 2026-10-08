// Anti-disintermediation scanning: detects contact info shared in messages
// (phone numbers, emails, social handles/links) so vendors and customers
// can't quietly move a deal off-platform. Matches are redacted before the
// message is stored, and the original is logged to leakage_events for
// admin review.

const PATTERNS: { category: string; regex: RegExp }[] = [
  {
    category: "phone",
    regex: /(\+?\d[\d\s().-]{7,}\d)/g,
  },
  {
    category: "email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  {
    category: "social",
    regex:
      /(?:@[a-zA-Z0-9_.]{3,}|(?:instagram\.com|wa\.me|whatsapp\.com|t\.me|facebook\.com|fb\.com)\/[a-zA-Z0-9_.]+)/gi,
  },
];

// Matches common date shapes: ISO "2026-10-09", or day/month/year written
// as "09/10/2026", "9-10-26", etc. Real phone numbers don't fall into these
// shapes — AU numbers group as 4-3-3 or 2-4-4, not 1-2 digit day/month runs.
function isLikelyDate(s: string): boolean {
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(s) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(s);
}

export type LeakageMatch = { category: string; snippet: string };

export function scanForLeakage(content: string): {
  redacted: string;
  matches: LeakageMatch[];
  hasLeakage: boolean;
} {
  let redacted = content;
  const matches: LeakageMatch[] = [];

  for (const { category, regex } of PATTERNS) {
    redacted = redacted.replace(regex, (match) => {
      if (category === "phone") {
        // Avoid false-positives on plain numbers (e.g. "50 guests", "$1200-1500")
        if (!/\d{3}.*\d{3}/.test(match.replace(/\D/g, ""))) {
          return match;
        }
        // Event dates ("2026-10-09", "09/10/2026", "9-10-2026") are exactly
        // the kind of thing people constantly mention in this app's
        // messages — don't treat a date-shaped number as a phone number.
        if (isLikelyDate(match.trim())) {
          return match;
        }
      }
      matches.push({ category, snippet: match });
      return "[hidden by Evntly]";
    });
  }

  return { redacted, matches, hasLeakage: matches.length > 0 };
}
