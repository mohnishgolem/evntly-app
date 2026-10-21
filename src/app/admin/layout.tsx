import { getAdminSession } from "@/lib/data/user";
import { AppSidebar, SidebarFrame } from "@/components/site/app-sidebar";

// Navigation only — the sidebar is drawn for verified admins, but each page
// enforces access itself with requireAdminPage().
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { admin, mfa } = await getAdminSession();
  const showNav = admin && mfa === "ok";

  return (
    <SidebarFrame sidebar={showNav ? <AppSidebar title="Admin" nav="admin" /> : null}>
      {children}
    </SidebarFrame>
  );
}
