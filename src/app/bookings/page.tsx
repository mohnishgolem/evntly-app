import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { navRole } from "@/lib/nav";

// Only individual bookings live under /bookings/[id]; the lists are in each
// dashboard. Anyone landing on the bare address (typed, or coming back from
// login) goes to their own list instead of a 404.
export default async function BookingsIndexPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/bookings");
  const role = navRole(session.profile?.role, true);
  redirect(role === "vendor" ? "/vendor-dashboard/bookings" : "/dashboard/bookings");
}
