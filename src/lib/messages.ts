// Resolves a human-readable name for the other side of a 1:1 conversation.
// Messages only store emails, so when the counterpart is a vendor we look up
// their business name via provider_id; otherwise there's no name source for
// a customer, so we fall back to a prettified version of their email.
export function counterpartDisplayName(
  counterpartEmail: string,
  provider: { name: string; owner_email: string | null } | null
) {
  if (provider && counterpartEmail === provider.owner_email) {
    return provider.name;
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
