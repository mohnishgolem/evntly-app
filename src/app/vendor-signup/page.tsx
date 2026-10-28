import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { VendorSignupWizard } from "@/components/vendor-signup-wizard";
import { Button } from "@/components/ui/button";

const WHAT_YOU_NEED = [
  "Your business name, a short description and your ABN",
  "Your hourly rate (you can add packages later)",
  "The suburbs you service",
  "A few photos of your work — add them after you submit",
];

// Signed-out visitors create an account first: the wizard's submit needs
// one, and asking at the end lost everything they'd typed. Signed-in users who already have a listing are sent to manage
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

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="mb-2 text-2xl font-bold">List your business on Evntly</h1>
        <p className="mb-6 text-muted-foreground">
          It&apos;s free to list. Customers find you, send you their event details, and you reply with a quote.
          Setting up takes about 5 minutes.
        </p>
        <div className="mb-6 rounded-2xl border border-border p-5">
          <p className="mb-3 font-medium">What you&apos;ll need</p>
          <ul className="space-y-2 text-sm">
            {WHAT_YOU_NEED.map((item) => (
              <li key={item} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2">
          <Button size="lg" nativeButton={false} render={<Link href="/signup?role=vendor">Create your free vendor account</Link>} />
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href={`/login?next=${encodeURIComponent("/vendor-signup")}`}>I already have an account</Link>}
          />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Every listing is checked by our team before it goes live.{" "}
          <Link href="/help/vendors" className="underline underline-offset-2">
            Vendor guide
          </Link>
        </p>
      </div>
    );
  }

  return <VendorSignupWizard />;
}
