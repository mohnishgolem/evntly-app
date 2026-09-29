import Link from "next/link";
import { getCurrentUser } from "@/lib/data/user";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/site/user-menu";
import { MobileNav } from "@/components/site/mobile-nav";
import { Logo } from "@/components/site/logo";

// Global top-level nav is identical for every visitor (Home/Explore), always
// visible, never swapped by role. Only the right-hand side changes based on
// auth state — that's the secondary menu the call asked for.
export async function SiteHeader() {
  const session = await getCurrentUser();

  return (
    <header className="glass-material sticky top-0 z-50 border-b border-border/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <Link href="/" className="text-foreground/80 hover:text-foreground transition-colors">
              Home
            </Link>
            <Link href="/explore" className="text-foreground/80 hover:text-foreground transition-colors">
              Explore
            </Link>
            <Link href="/bundles" className="text-foreground/80 hover:text-foreground transition-colors">
              Bundles
            </Link>
            <Link href="/plan" className="text-foreground/80 hover:text-foreground transition-colors">
              Start planning
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {session ? (
            <UserMenu
              profile={session.profile}
              email={session.user.email ?? ""}
              displayName={session.displayName}
            />
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/login">Log in</Link>}
              />
              <Button nativeButton={false} render={<Link href="/signup">Sign up</Link>} />
            </div>
          )}
          <MobileNav isAuthenticated={!!session} profile={session?.profile ?? null} />
        </div>
      </div>
    </header>
  );
}
