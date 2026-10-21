import type { Metadata } from "next";

// The page itself is a client component, which can't export metadata.
export const metadata: Metadata = {
  title: "Plan your event",
  description: "Tell us about your event and get matched with photographers, decorators, DJs, celebrants, venues and more in Sydney — no account needed to start.",
  alternates: { canonical: "/plan" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
