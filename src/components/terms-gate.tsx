import { getCurrentUser } from "@/lib/data/user";
import { TERMS_VERSION } from "@/lib/config";
import { TermsPrompt } from "@/components/terms-prompt";

// Signed-in users whose recorded Terms version isn't the current one are
// asked to accept (Google sign-ins never saw the signup checkbox, older
// accounts were never recorded, and everyone after a Terms update).
export async function TermsGate() {
  const session = await getCurrentUser();
  if (!session?.profile || session.profile.terms_version === TERMS_VERSION) return null;
  return <TermsPrompt updated={!!session.profile.terms_version} />;
}
