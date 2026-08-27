import { cosmic, withAlpha } from "./tokens";
import { UI_MODE } from "../ui-mode";

// Pixel geometry differs by build: sharp corners + hard offset shadow (legacy)
// vs rounded + flat (deep-space). The cyan pivot moved colors; this moves SHAPE
// too, so the deep-space build reads as the smooth design, not retro pixel chrome.
const geometryCosmic = {
  borderWidth: 2,
  radius: 0,
  pixelShadow: {
    offsetX: 4,
    offsetY: 4,
    blur: 0,
  },
  scanlineOpacity: 0.07,
  grid: 8,
  elevation: 4, // Android material depth for the raised pixel chrome
} as const;

const geometryDeepSpace = {
  borderWidth: 1,
  // PIXEL-CLAY 규칙 2 (Simon 결정 2026-08-21). 아래 주석이 "deep-space 는 매끄러운
  // 디자인" 이라고 적고 있는데 **그 전제가 뒤집혔다** -- 이제 딥스페이스가 픽셀아트고
  // 라운드는 전 화면 0 이다. 이 한 줄이 `gameboy.radius` 를 읽는 딥스페이스 쪽
  // 70곳을 한 번에 옮긴다. cosmic 쪽은 원래부터 0 이라 그대로다.
  radius: 0,
  // No hard pixel shadow (DESIGN.md: no drop shadows on dark surfaces).
  pixelShadow: {
    offsetX: 0,
    offsetY: 0,
    blur: 0,
  },
  scanlineOpacity: 0,
  grid: 8,
  elevation: 0, // flat on Android too — the deep-space design has no drop shadow
} as const;

// Legacy cosmic mapping (EXPO_PUBLIC_UI=legacy). Kept exported for the token test
// + the legacy track.
export const gameboyCosmic = {
  ...geometryCosmic,
  screen: cosmic.space950,
  ink: cosmic.moonWhite,
  accent: cosmic.signalBlue,
  power: cosmic.signalMint,
  amber: cosmic.pixelLamp,
  border: withAlpha(cosmic.signalBlue, 0.68),
} as const;

// Deep-space build (2026-06-18, Phase 2): the Game-Boy chrome reads as the smooth
// eye-cyan design — cyan colors AND flat geometry (1px border, no hard pixel
// shadow / scanlines).
//
// ⚠ 2026-08-21: 이 문단이 원래 "rounded ... (radius 13)" 이라고 적고 있었다.
// PIXEL-CLAY 로 오면서 **그 방향이 뒤집혔다** — 딥스페이스가 이제 픽셀아트다.
// 색은 그대로 두고 모서리만 0 이 됐다.
const gameboyDeepSpace = {
  ...geometryDeepSpace,
  screen: "#0A0E1A",
  ink: "#E8F7FF",
  accent: "#46B6FF",
  power: "#5FF0C0",
  amber: "#FFD166",
  // ⚠ **이 하나는 알파로 남겨둔다** (PIXEL-CLAY 규칙 4의 예외가 아니라 미결).
  //
  //   미리 합성하려면 바탕을 골라야 하는데, 이 테두리는 **밝기가 다른 여러 표면**에
  //   그려진다. 이 팔레트의 `screen`(#0A0E1A) 위에 합성하면 `#3380b6` 가 되고,
  //   그 색을 더 밝은 `cosmic.space700`(#243056) 위에 놓으면 대비가 **정확히 3.00** —
  //   비문자 바닥에 여유가 0 이라 반올림만으로도 깨진다. 알파로 두면 3.51 이다.
  //   (`lib/__tests__/premium-button-a11y.test.ts` 가 그 바닥을 지킨다.)
  //
  //   따라서 이건 **자리별 결정**이다 — 이 테두리를 쓰는 표면들이 각자의 바탕으로
  //   합성한 값을 갖거나, 테두리를 디더로 바꿔야 한다. 전역으로 한 번에 합성하지 말 것.
  border: "rgba(70,182,255,0.68)", // alpha matches cosmic; clears the 3:1 edge floor on dark
} as const;

export const gameboy = UI_MODE === "deep-space" ? gameboyDeepSpace : gameboyCosmic;

export const androidElevation = {
  pixelShadow: 4,
  authForm: 3,
  card: 2,
} as const;

export type AndroidElevationStyle = {
  elevation: number;
};

export type PixelShadowStyle = {
  shadowColor: string;
  shadowOffset: {
    width: number;
    height: number;
  };
  shadowRadius: number;
  shadowOpacity: number;
  elevation: number;
};

export function androidElevationStyle(elevation: number = androidElevation.card): AndroidElevationStyle {
  return { elevation };
}

export function pixelShadowStyle(shadowColor: string = gameboy.border): PixelShadowStyle {
  return {
    shadowColor,
    shadowOffset: {
      width: gameboy.pixelShadow.offsetX,
      height: gameboy.pixelShadow.offsetY,
    },
    shadowRadius: gameboy.pixelShadow.blur,
    shadowOpacity: 1,
    // Android ignores shadow* and uses elevation. Legacy pixel chrome is raised
    // (elevation 4); the deep-space design is flat (elevation 0) so Android matches
    // the no-drop-shadow look instead of rendering a material shadow.
    ...androidElevationStyle(gameboy.elevation),
  };
}
