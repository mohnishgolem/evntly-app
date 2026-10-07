"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toggleSavedVendor } from "@/lib/actions/saved-vendors";
import { cn } from "@/lib/utils";

export function SaveVendorButton({
  vendorId,
  initialSaved,
  isAuthenticated,
  className,
  size = "sm",
}: {
  vendorId: string;
  initialSaved: boolean;
  isAuthenticated: boolean;
  className?: string;
  size?: "sm" | "lg";
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push("/signup");
      return;
    }
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const res = await toggleSavedVendor(vendorId);
      if (res?.error) {
        setSaved(!next);
      } else if (res) {
        setSaved(res.saved ?? next);
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={saved ? "Remove from saved vendors" : "Save vendor"}
      aria-pressed={saved}
      className={cn(
        "flex items-center justify-center rounded-full bg-white shadow-sm transition-transform active:scale-90",
        size === "sm" ? "h-7 w-7" : "h-10 w-10",
        className
      )}
    >
      <Heart
        className={cn(size === "sm" ? "size-3.5" : "size-5", saved ? "fill-primary text-primary" : "text-muted-foreground")}
      />
    </button>
  );
}
