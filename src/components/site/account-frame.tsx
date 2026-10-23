import { getCurrentUser, getUnreadMessageCount } from "@/lib/data/user";
import { getVendorAttention } from "@/lib/data/vendor-attention";
import { navRole } from "@/lib/nav";
import { AppSidebar, SidebarFrame } from "@/components/site/app-sidebar";

// Frame for signed-in account pages shared by roles (/dashboard, /profile,
// /saved): customers get their five-item sidebar (desktop) or rail
// (tablet); vendors visiting a shared page (settings, profile) keep theirs.
// Admins and signed-out visitors get no sidebar. Navigation only — each
// page still checks the session itself.
export async function AccountFrame({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser();
  const role = navRole(session?.profile?.role, !!session);

  if (role === "customer") {
    return (
      <SidebarFrame rail sidebar={<AppSidebar title="Your planning" nav="customer" rail />}>
        {children}
      </SidebarFrame>
    );
  }
  if (role === "vendor") {
    const [attention, unread] = await Promise.all([getVendorAttention(), getUnreadMessageCount()]);
    return (
      <SidebarFrame
        rail
        sidebar={<AppSidebar title="Your business" nav="vendor" rail leads={attention?.leadCount ?? 0} unread={unread} />}
      >
        {children}
      </SidebarFrame>
    );
  }
  return <>{children}</>;
}
