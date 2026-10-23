import { AccountFrame } from "@/components/site/account-frame";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AccountFrame>{children}</AccountFrame>;
}
