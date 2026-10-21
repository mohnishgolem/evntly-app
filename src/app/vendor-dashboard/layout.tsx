import { getCurrentUser, getUnreadMessageCount } from "@/lib/data/user";
import { AppSidebar, SidebarFrame } from "@/components/site/app-sidebar";

// Navigation only. Each page under /vendor-dashboard does its own auth
// check (a layout isn't re-run on client-side navigation between pages).
export default async function VendorDashboardLayout({ children }: { children: React.ReactNode }) {
  const [session, unread] = await Promise.all([getCurrentUser(), getUnreadMessageCount()]);

  return (
    <SidebarFrame
      sidebar={session ? <AppSidebar title="Your business" nav="vendor" unread={unread} /> : null}
    >
      {children}
    </SidebarFrame>
  );
}
