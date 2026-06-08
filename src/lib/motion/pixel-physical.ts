import { prefersReducedMotion } from "./signature";

export const BUTTON_PRESS_MS = 60;
export const DRILLDOWN_TRANSITION_MS = 80;
export const SCREEN_TRANSITION_DISTANCE_PX = 8;
export const SCREEN_TRANSITION_MS = 100;

type PixelStackAnimation = "simple_push" | "fade";

export function pixelMotionDuration(durationMs: number): number {
  return prefersReducedMotion() ? 0 : durationMs;
}

export function pixelStackTransition(animation: PixelStackAnimation = "simple_push") {
  const reducedMotion = prefersReducedMotion();
  return {
    animation: reducedMotion ? "none" : animation,
    animationDuration: reducedMotion ? 0 : SCREEN_TRANSITION_MS,
  } as const;
}
