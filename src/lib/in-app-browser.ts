// Instagram, Facebook and Messenger open links in their own built-in browser.
// Google refuses sign-in from these ("disallowed_useragent"), so the Google
// button would only show an error page there. Paid Meta ads land people in
// exactly this browser.
const IN_APP_UA = /\b(Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|MessengerForiOS)\b/i;

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  return !!userAgent && IN_APP_UA.test(userAgent);
}
