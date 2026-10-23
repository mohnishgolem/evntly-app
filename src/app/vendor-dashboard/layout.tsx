import { getCurrentUser } from "@/lib/data/user";
import { getVendorAttention } from "@/lib/data/vendor-attention";
import { AppSidebar, SidebarFrame } from "@/components/site/app-sidebar";

// Navigation only. Each page under /vendor-dashboard does its own auth
// check (a layout isn't re-run on client-side navigation between pages).
// Phones use the bottom tab bar (root layout); tablets the rail; desktops
// the sidebar — all the same five destinations.
export default async function VendorDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser();
  const isVendor = session?.profile?.role === "vendor";
  const attention = isVendor ? await getVendorAttention() : null;

  return (
    <SidebarFrame
      rail={isVendor}
      sidebar={
        session ? (
          <AppSidebar title="Your business" nav="vendor" rail={isVendor} leads={attention?.leadCount ?? 0} />
        ) : null
      }
    >
      {children}
    </SidebarFrame>
  );
}
