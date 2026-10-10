// Contact info (phone/email/social) is always sendable — never blocked —
// but only *shown* once there's a real booking behind the conversation.
// Before that, matches are masked at read time; the stored message is
// never altered, so the same message simply renders unmasked once a
// qualifying booking exists (see hasBookingWithVendor).

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

export function maskContactInfo(content: string): string {
  let masked = content;
  for (const { category, regex } of PATTERNS) {
    masked = masked.replace(regex, (match) => {
      if (category === "phone") {
        // Avoid false-positives on plain numbers (e.g. "50 guests", "$1200-1500")
        if (!/\d{3}.*\d{3}/.test(match.replace(/\D/g, ""))) return match;
        if (isLikelyDate(match.trim())) return match;
      }
      return "[hidden until booking confirmed]";
    });
  }
  return masked;
}
