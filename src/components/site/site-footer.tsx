import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { AdChoicesLink } from "@/components/ad-choices-link";
import { LAUNCH_CITY } from "@/lib/config";
import { categoryPages } from "@/lib/seo";

const INSTAGRAM_URL = "https://www.instagram.com/evntly.au/";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 print:hidden">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Logo />
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/how-it-works" className="hover:text-foreground">
              How it works
            </Link>
            <Link href="/help" className="hover:text-foreground">
              Help &amp; Guides
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms &amp; Conditions
            </Link>
            <Link href="/privacy-policy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <AdChoicesLink className="text-left hover:text-foreground" />
            <Link href="/cancellation-refund-dispute-policy" className="hover:text-foreground">
              Cancellations &amp; refunds
            </Link>
            <Link href="/vendor-agreement" className="hover:text-foreground">
              Vendor Agreement
            </Link>
            <a href="mailto:hello@evntlyapp.com" className="hover:text-foreground">
              Contact
            </a>
            <Link href="/founding-vendors" className="hover:text-foreground">
              Founding vendors
            </Link>
            <Link href="/vendor-signup" className="hover:text-foreground">
              List your business
            </Link>
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              Instagram
            </a>
          </nav>
        </div>
        {/* Every category landing page, linked from every page. */}
        <nav aria-label={`Event vendors in ${LAUNCH_CITY}`} className="mb-6">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Event vendors in {LAUNCH_CITY}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            {categoryPages().map((p) => (
              <li key={p.slug}>
                <Link href={p.path} className="hover:text-foreground">
                  {p.heading}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-xs text-muted-foreground">
          Sai Mohnish Golem trading as Evntly · ABN 49 193 658 959 · Sydney, Australia
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Evntly. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
