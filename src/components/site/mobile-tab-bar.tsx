import { getCurrentUser, getUnreadMessageCount } from "@/lib/data/user";
import { navRole } from "@/lib/nav";
import { TabBar } from "@/components/site/tab-bar";

// Customers only: vendors and admins keep the drawer and their sidebars.
export async function MobileTabBar() {
  const session = await getCurrentUser();
  if (navRole(session?.profile?.role, !!session) !== "customer") return null;
  const unread = await getUnreadMessageCount();
  return <TabBar unread={unread} />;
}
