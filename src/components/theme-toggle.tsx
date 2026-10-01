"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export const THEME_CHANGE_EVENT = "evntly-theme-change";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    // This component is server-rendered (inside SiteHeader), so the real
    // theme — set on <html> by the bootstrap script, see layout.tsx — can
    // only be read client-side; a lazy useState initializer would read
    // `document` during SSR and either throw or desync from the DOM.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    localStorage.setItem("evntly-theme", next);
    setTheme(next);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: next }));
  }

  // Render nothing identifiable until mounted — the bootstrap script picks
  // the real theme before paint, but React doesn't know which icon to show
  // until it reads the class client-side, so avoid a hydration mismatch.
  if (!theme) {
    return <Button variant="ghost" size="icon" aria-hidden className="invisible" />;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
