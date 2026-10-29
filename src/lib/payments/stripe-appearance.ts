import type { Appearance } from "@stripe/stripe-js";

// Styles Stripe's payment fields (Appearance API) to look like Evntly's own
// inputs inside the payment sheet. Values mirror the tokens in globals.css
// (:root and .dark): Stripe renders in its own iframe, so it can't read our
// CSS variables, and its colour variables must be solid colours.

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
const PRIMARY = "#e8604a";

const TOKENS = {
  light: {
    surface: "#ffffff", // --popover (the sheet's background)
    text: "#1d1d1f", // --foreground
    muted: "#6e6e73", // --muted-foreground
    input: "rgba(0, 0, 0, 0.12)", // --input
    tab: "#f5f5f7", // --secondary
    ring: "rgba(232, 96, 74, 0.4)", // --ring
    danger: "#c9182b", // --destructive
  },
  dark: {
    surface: "#1b1c22",
    text: "#ffffff",
    muted: "#a5a7b2",
    input: "rgba(255, 255, 255, 0.14)",
    tab: "#17171b", // --muted
    ring: "rgba(232, 96, 74, 0.5)",
    danger: "#ff6b6b", // readable on the dark sheet; --destructive is too dark here
  },
} as const;

export type SheetTheme = keyof typeof TOKENS;

export function stripeAppearance(theme: SheetTheme): Appearance {
  const t = TOKENS[theme];
  return {
    theme: theme === "dark" ? "night" : "stripe",
    variables: {
      colorPrimary: PRIMARY,
      colorBackground: t.surface,
      colorText: t.text,
      colorTextSecondary: t.muted,
      colorTextPlaceholder: t.muted,
      colorDanger: t.danger,
      fontFamily: FONT,
      fontSizeBase: "15px",
      fontWeightMedium: "500",
      borderRadius: "12px",
      spacingUnit: "4px",
      gridRowSpacing: "14px",
    },
    rules: {
      ".Input": {
        backgroundColor: t.surface,
        border: `1px solid ${t.input}`,
        boxShadow: "none",
        padding: "12px 14px",
      },
      ".Input:focus": { borderColor: PRIMARY, boxShadow: `0 0 0 3px ${t.ring}` },
      ".Input--invalid": { borderColor: t.danger, boxShadow: "none" },
      ".Label": { color: t.muted, fontWeight: "500", fontSize: "13px" },
      ".Tab": { backgroundColor: t.tab, border: `1px solid ${t.input}`, boxShadow: "none" },
      // Outlined like Evntly's selected chips; Stripe's night theme would fill it solid.
      ".Tab--selected": { backgroundColor: t.surface, borderColor: PRIMARY, boxShadow: `0 0 0 1px ${PRIMARY}`, color: PRIMARY },
      ".TabIcon--selected": { fill: PRIMARY, color: PRIMARY },
      ".TabLabel--selected": { color: PRIMARY },
      ".Tab:focus": { boxShadow: `0 0 0 3px ${t.ring}` },
      ".AccordionItem": { backgroundColor: t.surface, border: `1px solid ${t.input}`, boxShadow: "none" },
      ".CheckboxInput": { border: `1px solid ${t.input}` },
      ".CheckboxInput--checked": { backgroundColor: PRIMARY, borderColor: PRIMARY },
    },
  };
}

/** The theme Evntly is showing right now (the toggle sets a class on <html>). */
export function currentSheetTheme(): SheetTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}
