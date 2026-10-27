import { getCurrentUser } from "@/lib/data/user";
import { getLegalStatus } from "@/lib/legal/status";
import { getPaymentsStatus } from "@/lib/payments/server";
import { shouldAutoStartOnboarding } from "@/lib/onboarding";
import { OnboardingWalkthrough } from "@/components/help/onboarding-walkthrough";

// Mounts the walkthrough for signed-in customers and vendors. It opens on
// its own only for accounts created after it shipped that haven't finished
// or skipped it; everyone else only sees it when they replay it from
// Help & Guides. Admins don't get one.
export async function OnboardingGate() {
  const session = await getCurrentUser();
  if (!session) return null;
  const profileRole = session.profile?.role;
  if (profileRole === "admin") return null;
  const role = profileRole === "vendor" || session.user.user_metadata.role === "vendor" ? "vendor" : "customer";

  // Same cached call LegalGate makes on this request.
  const legal = await getLegalStatus();
  const autoStart = shouldAutoStartOnboarding({
    accountCreatedAt: session.profile?.created_at,
    metadata: session.user.user_metadata,
    legalOutstanding: legal?.outstanding.length ?? 0,
  });
  // Only new accounts need this up front; a replay from Help & Guides
  // passes the current value along with it.
  const paymentsEnabled = autoStart ? (await getPaymentsStatus()).enabled : false;

  return <OnboardingWalkthrough userId={session.user.id} role={role} autoStart={autoStart} paymentsEnabled={paymentsEnabled} />;
}
