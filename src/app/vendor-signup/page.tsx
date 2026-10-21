import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { VendorSignupWizard } from "@/components/vendor-signup-wizard";

// Anyone can start the wizard (signed-out visitors are asked to log in when
// they submit). Signed-in users who already have a listing are sent to manage
// it instead of filling in a form that would only bounce them on submit —
// submitVendorListing allows one listing per account.
export default async function VendorSignupPage() {
  const session = await getCurrentUser();
  if (session) {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .rpc("my_service_providers")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (existing) redirect("/vendor-dashboard/business");
  }

  return <VendorSignupWizard />;
}
