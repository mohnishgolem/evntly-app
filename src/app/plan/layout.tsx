import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// The page itself is a client component, which can't export metadata.
export const metadata: Metadata = pageMetadata({
  title: "Plan your event",
  description: "Tell us about your event and get matched with photographers, decorators, DJs, celebrants and more in Sydney — no account needed to start.",
  path: "/plan",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
