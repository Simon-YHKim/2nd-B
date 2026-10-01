/** Only a deliberate downward pull at the top of the phone's content dismisses it. */
export function canBeginPhoneDismiss(dy: number, dx: number, scrollY: number): boolean {
  return scrollY <= 2 && dy >= 18 && dy > Math.abs(dx) * 1.3;
}

export function shouldCompletePhoneDismiss(dy: number, vy: number): boolean {
  return dy >= 90 || (dy >= 24 && vy >= 0.75);
}
