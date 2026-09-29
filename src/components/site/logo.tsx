import { cn } from "@/lib/utils";

// The Evntly wordmark — cursive script, matches the brand logo.
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn("text-3xl leading-none", className)}
      style={{ fontFamily: "var(--font-logo)" }}
    >
      Evntly
    </span>
  );
}
