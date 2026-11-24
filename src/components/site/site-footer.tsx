import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { AdChoicesLink } from "@/components/ad-choices-link";
import { LAUNCH_CITY } from "@/lib/config";
import { categoryPages } from "@/lib/seo";

const INSTAGRAM_URL = "https://www.instagram.com/evntly.au/";

// At least 24px tall (WCAG 2.5.8 target size) without changing the layout much.
const linkClass = "inline-flex min-h-6 items-center hover:text-foreground";
const headingClass = "mb-3 text-xs font-semibold tracking-wide text-foreground uppercase";

// Links grouped into three short columns (19 Nov: one wrapped row of 11 links
// read as clutter). Every page still links every category landing page.
export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 print:hidden">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm text-muted-foreground">
              Find and book trusted event vendors in {LAUNCH_CITY}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:contents">
            <nav aria-label="Evntly">
              <p className={headingClass}>Evntly</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/how-it-works" className={linkClass}>
                    How it works
                  </Link>
                </li>
                <li>
                  <Link href="/help" className={linkClass}>
                    Help &amp; Guides
                  </Link>
                </li>
                <li>
                  <a href="mailto:hello@evntlyapp.com" className={linkClass}>
                    Contact
                  </a>
                </li>
                <li>
                  <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    Instagram
                  </a>
                </li>
              </ul>
            </nav>

            <nav aria-label="For vendors">
              <p className={headingClass}>For vendors</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/vendor-signup" className={linkClass}>
                    List your business
                  </Link>
                </li>
                <li>
                  <Link href="/founding-vendors" className={linkClass}>
                    Founding vendors
                  </Link>
                </li>
                <li>
                  <Link href="/vendor-agreement" className={linkClass}>
                    Vendor Agreement
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="Legal">
              <p className={headingClass}>Legal</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/terms" className={linkClass}>
                    Terms &amp; Conditions
                  </Link>
                </li>
                <li>
                  <Link href="/privacy-policy" className={linkClass}>
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/cancellation-refund-dispute-policy" className={linkClass}>
                    Cancellations &amp; refunds
                  </Link>
                </li>
                <AdChoicesListItem />
              </ul>
            </nav>
          </div>
        </div>

        {/* Every category landing page, linked from every page. */}
        <nav aria-label={`Event vendors in ${LAUNCH_CITY}`} className="mt-10 border-t border-border/60 pt-6">
          <p className={headingClass}>Event vendors in {LAUNCH_CITY}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
            {categoryPages().map((p) => (
              <li key={p.slug}>
                <Link href={p.path} className={linkClass}>
                  {p.heading}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>Sai Mohnish Golem trading as Evntly · ABN 49 193 658 959 · Sydney, Australia</p>
          <p>© {new Date().getFullYear()} Evntly. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

// AdChoicesLink renders nothing when the Meta pixel isn't configured; wrap it
// so that case doesn't leave an empty <li>.
function AdChoicesListItem() {
  return (
    <li className="empty:hidden">
      <AdChoicesLink className={`text-left ${linkClass}`} />
    </li>
  );
}
