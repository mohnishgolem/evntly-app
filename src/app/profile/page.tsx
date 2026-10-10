import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  CalendarClock,
  Heart,
  ShieldCheck,
  Settings,
  FileText,
  Mail,
  Store,
  LogOut,
} from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";

function Row({
  icon: Icon,
  label,
  href,
  last,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  last?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent ${last ? "" : "border-b border-border/60"}`}
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="flex-1 text-[15px]">{label}</span>
      <ChevronRight className="size-4 text-muted-foreground/60" />
    </Link>
  );
}

export default async function ProfilePage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/profile");

  const email = session.user.email as string;
  const supabase = await createClient();

  const [{ count: bookingsCount }, { data: vendorListing }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("client_email", email),
    supabase.from("service_providers").select("id").eq("owner_email", email).limit(1).maybeSingle(),
  ]);

  const savedCount = session.profile?.saved_providers?.length ?? 0;
  const isAdmin = session.profile?.role === "admin";
  const label = session.displayName || email;
  const initial = (label ?? "?").charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">Profile</h1>

      <div className="mb-6 flex flex-col items-center rounded-2xl bg-secondary px-4 py-8 text-center">
        <div className="mb-3 flex size-16 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
          {initial}
        </div>
        <p className="text-lg font-semibold">{session.displayName || "Your account"}</p>
        <p className="text-sm text-muted-foreground">{email}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/bookings"
          className="rounded-2xl bg-secondary p-4 transition-colors hover:bg-accent"
        >
          <CalendarClock className="mb-2 size-5 text-primary" strokeWidth={1.75} />
          <p className="text-sm font-semibold">My Bookings</p>
          <p className="text-sm text-muted-foreground">{bookingsCount ?? 0} total</p>
        </Link>
        <Link href="/saved" className="rounded-2xl bg-secondary p-4 transition-colors hover:bg-accent">
          <Heart className="mb-2 size-5 text-primary" strokeWidth={1.75} />
          <p className="text-sm font-semibold">Saved Vendors</p>
          <p className="text-sm text-muted-foreground">{savedCount} saved</p>
        </Link>
      </div>

      {isAdmin && (
        <Link
          href="/admin"
          className="mb-6 flex items-center gap-3 rounded-2xl bg-foreground px-4 py-4 text-background transition-opacity hover:opacity-90"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background/15">
            <ShieldCheck className="size-5" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <p className="text-[15px] font-semibold">Admin Dashboard</p>
            <p className="text-sm text-background/70">Manage vendors, payouts, and user roles</p>
          </div>
          <ChevronRight className="size-4 text-background/60" />
        </Link>
      )}

      <div className="mb-6 overflow-hidden rounded-2xl bg-secondary">
        <Row icon={Settings} label="Account settings" href="/dashboard/settings" />
        <Row icon={FileText} label="My Quote Requests" href="/dashboard/quotes" />
        {vendorListing ? (
          <Row icon={Store} label="My vendor listing" href="/vendor-dashboard" last />
        ) : (
          <Row icon={Store} label="List your business" href="/vendor-signup" last />
        )}
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl bg-secondary">
        <Row icon={FileText} label="Terms & Conditions" href="/terms" />
        <Row icon={Mail} label="Contact us" href="mailto:hello@evntlyapp.com" last />
      </div>

      <form action={logout} className="overflow-hidden rounded-2xl bg-secondary">
        <button
          type="submit"
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium text-destructive transition-colors hover:bg-accent"
        >
          <LogOut className="size-5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1">Log out</span>
          <ChevronRight className="size-4 text-muted-foreground/60" />
        </button>
      </form>
    </div>
  );
}
