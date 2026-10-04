// "The opening's images are in" — a one-shot signal the web font loader waits on.
//
// Measured 2026-10-04 on a production-like static build over a 4G-like link:
// dropping the fonts' HTML preload alone moved the first scene only 0.4 s
// (9.5 s -> 9.1 s), because the fonts then downloaded right after the app code,
// at the same moment as the opening's images, and took the line from them.
// So on the web the fonts wait until the opening has its images (or gave up on
// them), then load during the 10 s opening. A fallback timer bounds the wait so
// fonts never stall when no opening plays.

let settled = false;
const waiters = new Set<() => void>();

/** Called by the opening when every image is loaded, or loading failed. Idempotent. */
export function markOpeningImagesSettled(): void {
  if (settled) return;
  settled = true;
  for (const waiter of [...waiters]) waiter();
  waiters.clear();
}

/** Runs callback once the opening's images settle, or after fallbackMs. Returns a cancel function. */
export function whenOpeningImagesSettled(callback: () => void, fallbackMs: number): () => void {
  if (settled) {
    callback();
    return () => undefined;
  }
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    clearTimeout(timer);
    waiters.delete(fire);
    callback();
  };
  const timer = setTimeout(fire, fallbackMs);
  waiters.add(fire);
  return () => {
    fired = true;
    clearTimeout(timer);
    waiters.delete(fire);
  };
}

/** Test seam. */
export function resetOpeningImagesSignal(): void {
  settled = false;
  waiters.clear();
}
