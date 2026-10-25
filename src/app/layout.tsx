import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { ErrorReporter } from "@/components/error-reporter";
import { PageViewTracker } from "@/components/page-view-tracker";
import { TermsGate } from "@/components/terms-gate";
import "./globals.css";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { MobileTabBar } from "@/components/site/mobile-tab-bar";
import { SITE_URL, LAUNCH_CITY, THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "@/lib/config";

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

// iPhone screens as [width, height, pixel ratio] in CSS px, newest first;
// images in public/splash are the wordmark on black, like the app icon.
const SPLASH_SCREENS: [number, number, number][] = [
  [440, 956, 3], // 16/17 Pro Max
  [430, 932, 3], // 14 Pro Max, 15/16 Plus, 15 Pro Max
  [402, 874, 3], // 16/17 Pro, 17
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [375, 667, 2], // SE, 8
];

const DEFAULT_DESCRIPTION =
  `Book photographers, decorators, DJs, celebrants and more for your wedding, birthday or corporate event in ${LAUNCH_CITY}.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Evntly — Find trusted event vendors",
    template: "%s | Evntly",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: "Evntly",
  // Home-screen icon: the white wordmark on black. A fixed URL (rather than
  // the apple-icon file convention's hashed query string) is the path iOS
  // also probes on its own when it misses the <link>.
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Installed on iOS: launch full-screen with a translucent status bar.
  appleWebApp: {
    capable: true,
    title: "Evntly",
    statusBarStyle: "black-translucent",
    // Launch screen while the app loads — without these iOS shows plain
    // white. Matched by exact screen size, so one per iPhone size.
    startupImage: SPLASH_SCREENS.map(([w, h, dpr]) => ({
      url: `/splash/splash-${w * dpr}x${h * dpr}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
    })),
  },
  keywords: [
    "event vendors",
    `${LAUNCH_CITY} wedding vendors`,
    "wedding photographer",
    "event decorator",
    "DJ hire",
    "wedding celebrant",
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

// Browser chrome / installed-app title bar follows the system theme.
// viewport-fit=cover makes env(safe-area-inset-*) report the notch and home
// indicator (they're 0 without it), so the header and phone tab bar can pad
// around them in the installed app.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR_DARK },
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR_LIGHT },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The proxy puts a fresh nonce in the request's CSP header (src/proxy.ts).
  const nonce =
    (await headers()).get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1] ?? undefined;

  return (
    <html lang="en" className={`${logoFont.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Runs before first paint so the theme never flashes. Rendered by
            hand with the request's CSP nonce: browsers hide nonce values from
            the DOM, so React would otherwise report a hydration mismatch. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Session-dependent pieces sit behind Suspense so the server can
            send the page shell (styles, scripts, header bar) straight away
            instead of holding every byte until the session queries finish —
            in the installed app that wait was a blank white screen. */}
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Suspense>
          <MobileTabBar />
        </Suspense>
        <Analytics />
        <ErrorReporter />
        <PageViewTracker />
        <Suspense>
          <TermsGate />
        </Suspense>
      </body>
    </html>
  );
}
