// Runs `callback` once, on the visitor's first scroll, tap, click, key press
// or mouse movement, whichever comes first. Used to hold back heavy,
// below-the-fold widgets (the home page map) until someone is actually using
// the page, so they don't compete with the first load.
export const ENGAGEMENT_EVENTS = ["scroll", "wheel", "touchstart", "pointerdown", "pointermove", "keydown"] as const;

export function onFirstEngagement(target: EventTarget, callback: () => void): () => void {
  let done = false;
  const handler = () => {
    if (done) return;
    done = true;
    cleanup();
    callback();
  };
  const cleanup = () => {
    for (const type of ENGAGEMENT_EVENTS) target.removeEventListener(type, handler);
  };
  for (const type of ENGAGEMENT_EVENTS) target.addEventListener(type, handler, { passive: true });
  return cleanup;
}
