// Phone sticky action bars (Claim, Start your listing, Request quote, Share)
// and the ad-consent card (src/components/ad-consent-banner.tsx) share the
// bottom of the screen. While the card is up it publishes two values on
// :root (see consentOffsetVars):
//   --consent-h    its height plus an 8px gap: how far anything resting on
//                  the tab bar moves up.
//   --consent-top  the distance from the screen's bottom edge to the card's
//                  top edge: where a bar with no tab bar under it must sit.
// The card itself floats at --consent-bottom (globals.css): just above the
// tab bar, or just above the home indicator when there's no tab bar.

/** Bottom offset classes for a fixed phone action bar. */
export function stickyBarOffset(hasTabBar: boolean): string {
  // Full literal strings so Tailwind generates them.
  return hasTabBar
    ? "bottom-[calc(var(--tabbar-height)+var(--consent-h,0px))]"
    : // With the card hidden both fallbacks are 0px: bottom 0 with home-indicator
      // padding. With it shown the bar rests on the card and the padding falls
      // back to 0.75rem, since --consent-top already clears the indicator.
      "bottom-[var(--consent-top,0px)] pb-[max(0.75rem,calc(env(safe-area-inset-bottom)-var(--consent-top,0px)))]";
}

/** The :root custom properties the consent card publishes while it's shown. */
export function consentOffsetVars(isPhone: boolean, cardHeight: number): Record<"--consent-h" | "--consent-top", string> {
  if (!isPhone) return { "--consent-h": "0px", "--consent-top": "0px" };
  return {
    "--consent-h": `${cardHeight + 8}px`,
    "--consent-top": `calc(var(--consent-bottom) + ${cardHeight}px)`,
  };
}
