import { getLegalStatus } from "@/lib/legal/status";
import { LegalPrompt } from "@/components/legal/legal-prompt";

// Signed-in users who haven't accepted the current version of every document
// that applies to them (Google sign-ups never saw the signup checkboxes,
// older accounts, and everyone after a document update) are asked to accept.
// The database also refuses quotes, messages, bookings and listings until
// they do, so this prompt can't be bypassed by calling the API directly.
export async function LegalGate() {
  const status = await getLegalStatus();
  if (!status || status.outstanding.length === 0) return null;
  return (
    <LegalPrompt
      outstanding={status.outstanding}
      firstTime={!status.hasHistory}
      askMarketing={status.marketing === null}
    />
  );
}
