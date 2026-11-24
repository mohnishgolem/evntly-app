import { getCurrentUser, getUnreadMessageCount } from "@/lib/data/user";
import { getVendorAttention } from "@/lib/data/vendor-attention";
import { navRole } from "@/lib/nav";
import { TabBar } from "@/components/site/tab-bar";

// Phones only (the bar is md:hidden). Guests, customers and vendors each get
// five tabs. Admins keep the drawer.
export async function MobileTabBar() {
  const session = await getCurrentUser();
  const role = navRole(session?.profile?.role, !!session);
  if (role === "guest") return <TabBar nav="guestTabs" />;
  if (role === "customer") return <TabBar nav="customerTabs" unread={await getUnreadMessageCount()} />;
  if (role === "vendor") {
    const attention = await getVendorAttention();
    return <TabBar nav="vendor" leads={attention?.leadCount ?? 0} />;
  }
  return null;
}
