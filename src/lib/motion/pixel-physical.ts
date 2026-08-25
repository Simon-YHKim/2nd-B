import { prefersReducedMotion } from "./signature";

export const BUTTON_PRESS_MS = 60;
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

// ── PIXEL-CLAY 절대 규칙 5 — 계단 이징만 ────────────────────────────────────
//
// 규칙은 "steps() 이징만, 곡선 이징 금지"다. 그런데 **React Native 의 Easing 에는
// CSS 의 steps() 가 없다.** step0/step1(경계에서 한 번 튀는 것) 뿐이다.
// 그래서 직접 만든다 — 이징은 그냥 0..1 을 0..1 로 보내는 함수라 한 줄이면 된다.
//
// 사다리는 레퍼런스가 정해 놓았다(design/pixel_clay_260825/data/tokens.json):
//
//   --step-1 = 60ms  steps(2,end)     빠른 반응 (누름·토글)
//   --step-2 = 120ms steps(3,end)     보통 (등장·강조)
//   --step-3 = 240ms steps(6,end)     느린 것 (숨쉬기·떠다니기)
//
// M3 브리지도 같은 값을 쓴다: standard = steps(2,end) · emphasized = steps(3,end).
//
// ⚠ `end` 방향이다: 값이 **구간 끝에서** 바뀐다(floor). CSS 의 steps(n, end) 와 같다.
//   start 방향(ceil)이 필요한 자리는 아직 없다 — 생기면 그때 추가할 것.
// ⚠ t=1 은 반드시 1 이어야 한다. floor(1*n)/n = 1 이라 그대로 맞다.
//   이게 어긋나면 애니메이션이 목표값에 **영원히 못 닿는다**.

/** 계단 이징. n 칸으로 끊는다. CSS `steps(n, end)` 와 같은 모양. */
export function pixelSteps(n: number): (t: number) => number {
  const steps = Math.max(1, Math.floor(n));
  return (t: number) => {
    if (t >= 1) return 1;
    if (t <= 0) return 0;
    return Math.floor(t * steps) / steps;
  };
}

/** 레퍼런스 사다리 3칸. 지속시간과 칸수는 한 벌로 움직인다. */
export const PIXEL_STEP = {
  /** 60ms / 2칸 — 누름·토글처럼 즉답이어야 하는 것. */
  fast: { duration: 60, easing: pixelSteps(2) },
  /** 120ms / 3칸 — 등장·강조. M3 의 emphasized 자리. */
  base: { duration: 120, easing: pixelSteps(3) },
  /** 240ms / 6칸 — 숨쉬기·떠다니기처럼 계속 도는 것. */
  slow: { duration: 240, easing: pixelSteps(6) },
} as const;

/**
 * 긴 주기 동작(숨쉬기·회전·떠다니기)의 칸수. 사다리 세 칸은 **상호작용**용이라
 * 60~240ms 인데, 주기 동작은 800~1500ms 라 그대로 쓸 수 없다 — 6칸으로 끊으면
 * 뚝뚝 끊긴다.
 *
 * 그래서 칸수를 **칸당 시간**에서 유도한다. 캐논의 비율이 그것을 정해 준다:
 *   60ms/2칸 = 30ms · 120ms/3칸 = 40ms · 240ms/6칸 = 40ms
 * 즉 한 칸이 30~40ms ≈ 25~33fps 다. 픽셀 애니메이션의 프레임 감각이고,
 * 곡선처럼 매끄럽지 않되 끊겨 보이지도 않는다.
 *
 * ⚠ 이것은 규칙 5 를 피해 가는 것이 아니다 — 여전히 계단이고, 다만 칸이 촘촘하다.
 */
export const PIXEL_STEP_MS = 40;

export function pixelStepsFor(durationMs: number): (t: number) => number {
  return pixelSteps(Math.max(2, Math.round(durationMs / PIXEL_STEP_MS)));
}
