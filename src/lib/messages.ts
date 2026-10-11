// Direct-message conversation ids are "<vendorId>:<customerEmail>" (sorted),
// so the customer is whichever part is an email address.
export function conversationCustomerEmail(conversationId: string) {
  return conversationId.split(":").find((part) => part.includes("@")) ?? null;
}

// Resolves a human-readable name for the other side of a 1:1 conversation.
// Messages only store emails, so when the counterpart is the vendor (i.e. not
// the customer) we use their business name via provider_id; otherwise there's
// no name source for a customer, so we fall back to a prettified email.
export function counterpartDisplayName(
  counterpartEmail: string,
  providerName: string | null,
  customerEmail: string | null
) {
  if (providerName && counterpartEmail !== customerEmail) {
    return providerName;
  }
  return prettifyEmail(counterpartEmail);
}

function prettifyEmail(email: string) {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
