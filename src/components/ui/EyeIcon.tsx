// Eye / eye-off icons for password visibility toggles (refine-v2 #6).
//
// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
// 원래 여기 있던 곡선은 `eye_icon.svg` 를 그대로 옮긴 것이었다(PIXEL-CLAY 규칙 1
// 위반). 눈은 사각 눈꺼풀 + 동공이고, 가림은 거기에 대각선 하나다.

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { cosmic } from "@/lib/theme/tokens";

export function EyeIcon({ size = 20, color = cosmic.signalMint }: { size?: number; color?: string }) {
  return <PixelGlyph name="visibility" color={color} size={size} />;
}

export function EyeOffIcon({ size = 20, color = cosmic.mistGray }: { size?: number; color?: string }) {
  return <PixelGlyph name="visibility_off" color={color} size={size} />;
}
