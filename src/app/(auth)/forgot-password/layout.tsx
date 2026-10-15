import type { Metadata } from "next";

// The page itself is a client component, which can't export metadata.
export const metadata: Metadata = {
  title: "Forgot password",
  description: "Reset your Evntly password.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
