/**
 * A deliberate vertical swipe is the only way out of the phone (Simon 2026-10-07: "핸드폰 화면에서 나가는건
 * 위 아래 스와이프만"): a pull down at the top of the content, or a push up at its bottom. In between,
 * the content scrolls. bottomGap is how far the content can still scroll down (Infinity = unknown).
 */
export function canBeginPhoneDismiss(dy: number, dx: number, scrollY: number, bottomGap = Infinity): boolean {
  if (dy >= 18 && dy > Math.abs(dx) * 1.3) return scrollY <= 2;
  if (dy <= -18 && -dy > Math.abs(dx) * 1.3) return bottomGap <= 2;
  return false;
}

/** Far enough, or fast enough in the same direction, in either direction. */
export function shouldCompletePhoneDismiss(dy: number, vy: number): boolean {
  const distance = Math.abs(dy);
  const speed = Math.sign(vy) === Math.sign(dy) ? Math.abs(vy) : 0;
  return distance >= 90 || (distance >= 24 && speed >= 0.75);
}
