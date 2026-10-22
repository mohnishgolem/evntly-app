import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { getVapidPublicKey } from "@/lib/push";
import { normalisePrefs } from "@/lib/notification-prefs";
import { NotificationPreferences } from "@/components/notification-preferences";
import { PushToggle } from "@/components/push-toggle";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export default async function NotificationSettingsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/settings/notifications");

  const supabase = await createClient();
  const [{ data: row }, { data: listing }, publicKey] = await Promise.all([
    supabase.from("notification_preferences").select("prefs").eq("user_id", session.user.id).maybeSingle(),
    supabase.rpc("my_service_providers").select("id").limit(1).maybeSingle(),
    getVapidPublicKey(),
  ]);
  // Vendors see vendor wording; anyone with a listing is a vendor here.
  const audience = listing || session.profile?.role === "vendor" ? "vendor" : "customer";

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Link href="/dashboard/settings" className="mb-3 -ml-1 inline-flex h-11 items-center gap-1 px-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Settings
      </Link>
      <h1 className="mb-1 text-[28px] font-bold tracking-tight">Notifications</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Choose what reaches you and how. Everything still appears in your dashboard.
      </p>

      <section aria-labelledby="device" className="mb-6">
        <h2 id="device" className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Push on this device
        </h2>
        <div className="rounded-2xl bg-secondary p-4">
          <PushToggle publicKey={publicKey} />
        </div>
      </section>

      <section aria-labelledby="kinds">
        <h2 id="kinds" className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          What to send
        </h2>
        <NotificationPreferences initial={normalisePrefs(row?.prefs)} audience={audience} />
      </section>
    </div>
  );
}
