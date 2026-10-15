import type { Metadata } from "next";

// The page itself is a client component, which can't export metadata.
export const metadata: Metadata = {
  title: "List your business",
  description: "List your event business on Evntly and get quote requests from people planning events in Sydney.",
  alternates: { canonical: "/vendor-signup" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
