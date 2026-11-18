import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Metadata lives here so the page can stay focused on the listing check.
export const metadata: Metadata = pageMetadata({
  title: "List your business",
  description: "List your event business on Evntly and get quote requests from people planning events in Sydney.",
  path: "/vendor-signup",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
