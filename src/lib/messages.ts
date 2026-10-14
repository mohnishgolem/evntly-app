// Direct-message conversation ids are "<providerId>:<customerUserId>" — no
// email address in them, since they show up in URLs and notification links.
// The DB (fill_message_recipient) parses the same format to address messages.
export function conversationIdFor(providerId: string, customerUserId: string) {
  return `${providerId}:${customerUserId}`;
}

/** Pre-2026-10 ids embedded the customer's email instead of their user id. */
export function isLegacyConversationId(conversationId: string) {
  return conversationId.includes("@");
}

// "Jane D." from a stored name, or from the email's local part when there's
// no name. Shown to the other side of a quote/conversation before any booking
// exists, so it must never reveal the email itself — a full "john.smith99"
// local part is usually enough to guess the address, hence only the first
// word and a last initial.
export function personDisplayName(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback = "Customer"
) {
  const source = name?.trim() || email?.split("@")[0] || "";
  const words = source
    .split(/[\s._\-+]+/)
    .map((w) => w.replace(/\d+/g, ""))
    .filter(Boolean);
  if (words.length === 0) return fallback;
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase();
  return words.length === 1
    ? cap(words[0])
    : `${cap(words[0])} ${words[words.length - 1][0].toUpperCase()}.`;
}
