import Link from "next/link";
import { Logo } from "@/components/site/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Logo />
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
            <Link href="/privacy-policy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <a href="mailto:hello@evntlyapp.com" className="hover:text-foreground">
              Contact
            </a>
            <Link href="/vendor-signup" className="hover:text-foreground">
              List your business
            </Link>
          </nav>
        </div>
        <p className="text-xs text-muted-foreground">
          ABN 49 193 658 959 · Sydney, Australia
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Evntly. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
