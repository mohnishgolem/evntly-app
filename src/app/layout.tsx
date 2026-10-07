import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { SITE_URL, LAUNCH_CITY } from "@/lib/config";

// Resolves light/dark before first paint (localStorage, falling back to
// system preference) and sets it as a class on <html> — avoids a flash of
// the wrong theme that a client-only effect in ThemeToggle would cause.
const THEME_BOOTSTRAP = `(function(){try{var s=localStorage.getItem("evntly-theme");var t=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.classList.add(t);}catch(e){document.documentElement.classList.add("dark");}})();`;

// The Evntly wordmark uses this bold rounded script — matches the brand logo
// (Magnolia Script by Tanya Cherkiz, SIL OFL 1.1, self-hosted from ./fonts).
// Body/UI text uses the system font stack (see globals.css --font-sans) for
// an authentically Apple-inspired feel: SF Pro on Apple devices, with no
// download needed.
export const logoFont = localFont({
  src: "./fonts/MagnoliaScript.otf",
  variable: "--font-logo",
  weight: "400",
});

const DEFAULT_DESCRIPTION =
  `Book DJs, photographers, florists and caterers for your wedding, birthday or corporate event in ${LAUNCH_CITY}.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Evntly — Find trusted event vendors",
    template: "%s | Evntly",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: "Evntly",
  keywords: [
    "event vendors",
    `${LAUNCH_CITY} wedding vendors`,
    "DJ hire",
    "wedding photographer",
    "florist",
    "caterer",
    "event planning",
  ],
  openGraph: {
    type: "website",
    siteName: "Evntly",
    title: "Evntly — Find trusted event vendors",
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Evntly — Find trusted event vendors",
    description: DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${logoFont.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP}
        </Script>
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
