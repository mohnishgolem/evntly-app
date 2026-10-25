import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccountForm } from "@/components/legal/delete-account-form";

export const metadata: Metadata = {
  title: "Delete account",
  robots: { index: false, follow: false },
};

export default async function DeleteAccountPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/settings/delete-account");

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("account_deletion_requests")
    .select("requested_at")
    .eq("user_id", session.user.id)
    .eq("status", "pending")
    .maybeSingle();

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Link href="/dashboard/settings/legal" className="mb-3 -ml-1 inline-flex h-11 items-center gap-1 px-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Privacy &amp; legal
      </Link>
      <h1 className="mb-3 text-[28px] font-bold tracking-tight">Delete account</h1>
      <div className="mb-6 space-y-2 text-sm text-muted-foreground">
        <p>
          We&apos;ll delete your profile, events, saved vendors and any listing and portfolio, and delete or de-identify
          your personal information.
        </p>
        <p>
          We keep some records where the law or a legitimate need requires it, such as booking records, the record of
          which Terms you accepted, and safety records. The{" "}
          <Link href="/privacy-policy#retention" className="font-medium text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>{" "}
          explains what we keep and for how long.
        </p>
        <p>Before you go, please settle any upcoming bookings with the other party.</p>
      </div>
      <DeleteAccountForm pendingSince={request?.requested_at ?? null} />
    </div>
  );
}
