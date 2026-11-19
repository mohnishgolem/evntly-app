"use client";

import { useState } from "react";

/** Phones get a bottom sheet (as iOS presents them); wider screens a side panel. */
export function useSheetSide() {
  const [side] = useState<"bottom" | "right">(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches ? "right" : "bottom"
  );
  return side;
}
