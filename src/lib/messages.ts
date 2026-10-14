// Direct-message conversation ids are "<vendorId>:<customerEmail>" (sorted),
// so the customer is whichever part is an email address.
export function conversationCustomerEmail(conversationId: string) {
  return conversationId.split(":").find((part) => part.includes("@")) ?? null;
}

// Resolves a human-readable name for the other side of a 1:1 conversation.
// Messages only store emails, so when the counterpart is the vendor (i.e. not
// the customer) we use their business name via provider_id; otherwise there's
// no name source for a customer, so we derive a short name from the email.
export function counterpartDisplayName(
  counterpartEmail: string,
  providerName: string | null,
  customerEmail: string | null
) {
  if (providerName && counterpartEmail !== customerEmail) {
    return providerName;
  }
  return personDisplayName(null, counterpartEmail);
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
