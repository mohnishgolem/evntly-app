import { describe, expect, it } from "vitest";
import { isInAppBrowser } from "@/lib/in-app-browser";

describe("isInAppBrowser", () => {
  it("spots Instagram and Facebook's built-in browsers (where Google sign-in is blocked)", () => {
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; en_AU)"
      )
    ).toBe(true);
    expect(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1]"
      )
    ).toBe(true);
    expect(
      isInAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Instagram 350.0.0.0 Android")
    ).toBe(true);
  });

  it("leaves normal browsers alone", () => {
    expect(
      isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
    ).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe(false);
    expect(isInAppBrowser(null)).toBe(false);
    expect(isInAppBrowser("")).toBe(false);
  });
});
