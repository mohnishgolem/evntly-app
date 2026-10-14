import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? null;

  return { user, profile, displayName };
}

// Gate for vendor-only pages: logged-out visitors go to login (and come back
// afterwards); logged-in users without a listing go to /vendor-dashboard,
// which offers to create one. A "vendor" is anyone who owns a listing, in
// any review status.
export async function requireVendor(path: string) {
  const session = await getCurrentUser();
  if (!session) redirect(`/login?next=${encodeURIComponent(path)}`);

  const supabase = await createClient();
  const { data: listing } = await supabase
    .rpc("my_service_providers")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!listing) redirect("/vendor-dashboard");

  return session;
}
