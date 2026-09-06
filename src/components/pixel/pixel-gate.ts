// PIXEL-CLAY gate 셸의 키보드 여백 계산.
//
// 값 계산을 JSX 밖의 순수 함수로 둔다. 이 저장소의 Jest(node)는 RN 컴포넌트를
// 직접 렌더하지 못하지만, Android IME 높이가 실제 하단 여백으로 이어지는 행동은
// 숫자로 검증해야 고정 padding 회귀를 막을 수 있다.
import { m3 } from "@/lib/theme/m3";

/** 키보드가 없을 때 CTA 와 safe-area 끝 사이의 기본 여백. */
export const PIXEL_GATE_BOTTOM_GUTTER = m3.spacing.s8 * 2;

/** Android IME 위에서 CTA 가 바로 붙지 않도록 남기는 한 줄 여백. */
export const PIXEL_GATE_IME_CLEARANCE = m3.spacing.s6 * 2;

export function pixelGateBottomPadding(platform: string, keyboardHeight: number): number {
  const imeHeight = Number.isFinite(keyboardHeight) ? Math.max(0, keyboardHeight) : 0;
  if (platform !== "android" || imeHeight === 0) return PIXEL_GATE_BOTTOM_GUTTER;
  return Math.max(PIXEL_GATE_BOTTOM_GUTTER, imeHeight + PIXEL_GATE_IME_CLEARANCE);
}
