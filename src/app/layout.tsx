import type { Metadata } from "next";
import { Great_Vibes } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site/site-header";

// The Evntly wordmark uses this cursive script — matches the brand logo.
// Body/UI text uses the system font stack (see globals.css --font-sans) for
// an authentically Apple-inspired feel: SF Pro on Apple devices, with no
// download needed.
export const greatVibes = Great_Vibes({
  variable: "--font-logo",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Evntly — Find trusted event vendors",
  description:
    "Book DJs, photographers, florists and caterers for your wedding, birthday or corporate event in Sydney.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${greatVibes.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
