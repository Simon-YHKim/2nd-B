// Reduced-motion 단일 지점: lite mode 설정과 OS 의 prefers-reduced-motion 을 한 곳에서 OR 한다.
//
// 이 파일에 있던 옛 시그니처 모션 스펙(SAVE/CONNECTION/IMAGINE_MOTION · savePopTotalMs,
// accent 가 은퇴한 캐릭터 색 키)은 읽는 곳이 테스트뿐이었고, 그 근거로 적힌 DESIGN.md 의
// "Signature motion" 절과 useSignatureMotion.ts 도 이미 없었다. 2026-10-05 에
// E:/Legacy/2ndB 로 옮겼다(QA R2E-12, batch qa261005-tokens-motion). 파일 이름은 import 하는
// 곳들 때문에 그대로 둔다.

import { isLiteModeEnabled } from "../settings/lite-mode";

/**
 * Whether motion should be suppressed: the user's lite-mode preference OR the
 * OS `prefers-reduced-motion` setting (web matchMedia; absent on native).
 *
 * NOT a render-path API anymore: the result is user-mutable mid-session and
 * the React Compiler memoizes zero-input render calls per instance, freezing
 * them at mount. Components (and effects gating ambient loops) use
 * `useReducedMotionPref()` from `src/lib/motion/use-reduced-motion.ts`;
 * one-shot effect/handler reads may keep this function.
 */
export function prefersReducedMotion(): boolean {
  // Lite mode (O-R2 ③) forces the reduced path through this same chokepoint
  // every animation consumer already honors - one flag, zero new branches.
  if (isLiteModeEnabled()) return true;
  const g = globalThis as unknown as {
    matchMedia?: (q: string) => { matches: boolean };
  };
  if (typeof g.matchMedia !== "function") return false;
  try {
    return g.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
