// Typography — Deep-Space design canon.
// Body Korean: Pretendard. Pixel title/Korean mono: Galmuri11. Tiny labels/tags:
// Press Start 2P. Fonts are loaded in src/app/_layout.tsx through fontAssets.

import { Platform } from "react-native";

const BODY = Platform.select({
  ios: "Pretendard",
  android: "Pretendard",
  web: '"Pretendard", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  default: "sans-serif",
});

const PIXEL_KO = Platform.select({
  ios: "Galmuri11",
  android: "Galmuri11",
  web: '"Galmuri11", monospace',
  default: "monospace",
});

const PIXEL_EN = Platform.select({
  ios: "PressStart2P",
  android: "PressStart2P",
  web: '"PressStart2P", monospace',
  default: "monospace",
});

export const fontFamilies = {
  serifKo: PIXEL_KO,
  serifEn: PIXEL_EN,
  sans: BODY,
  mono: PIXEL_EN,
  pixel: PIXEL_KO,
  pixelKo: PIXEL_KO,
  pixelEn: PIXEL_EN,
  readable: BODY,
} as const;

export const fontWeights = {
  regular: "400",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const;

export const fontAssets = {
  Pretendard: require("../../assets/fonts/Pretendard-Regular.otf"),
  Galmuri11:
    Platform.OS === "web"
      ? require("../../assets/fonts/Galmuri11-subset.woff2")
      : require("../../assets/fonts/Galmuri11-subset.ttf"),
  PressStart2P: require("@expo-google-fonts/press-start-2p/400Regular/PressStart2P_400Regular.ttf"),
  // ── PIXEL-CLAY 2단계 (2026-08-20) — Galmuri 4종 추가 ────────────────
  //
  // 키 이름이 곧 RN 이 찾는 fontFamily 문자열이다. `m3.font.*` 와
  // `src/components/m3/typeface.ts` 가 이 이름들을 그대로 쓴다 — 어긋나면 텍스트가
  // 조용히 시스템 폰트로 떨어진다(`typography-m3-fonts.test.ts` 가 그 짝을 지킨다).
  //
  // 굵기를 별도 키로 등록하는 이유는 Roboto 때와 같다: RN 은 한 얼굴에서 선명한
  // 굵기를 만들어내지 못한다. 다만 Bold 를 파는 Galmuri 는 11 하나뿐이라 키도
  // 하나다.
  //
  // 바이너리는 `scripts/build-font-subsets.py` 가 `galmuri` 패키지에서 만든다.
  // 크기(서브셋 .ttf 2.3~3.0MB)는 그 스크립트 헤더에 근거와 함께 적어뒀다.
  Galmuri11Bold:
    Platform.OS === "web"
      ? require("../../assets/fonts/Galmuri11Bold-subset.woff2")
      : require("../../assets/fonts/Galmuri11Bold-subset.ttf"),
  Galmuri14:
    Platform.OS === "web"
      ? require("../../assets/fonts/Galmuri14-subset.woff2")
      : require("../../assets/fonts/Galmuri14-subset.ttf"),
  Galmuri9:
    Platform.OS === "web"
      ? require("../../assets/fonts/Galmuri9-subset.woff2")
      : require("../../assets/fonts/Galmuri9-subset.ttf"),
  GalmuriMono11:
    Platform.OS === "web"
      ? require("../../assets/fonts/GalmuriMono11-subset.woff2")
      : require("../../assets/fonts/GalmuriMono11-subset.ttf"),
  // Roboto 4종(Roboto / RobotoMedium / RobotoBold / RobotoMono)은 여기 없다
  // (2026-09-05 제거). M3 rev2 크롬·숫자 얼굴이었고 `m3.font.*` 가 2단계에서
  // Galmuri 로 옮겨간 뒤 `fontFamily` 소비자가 두 UI 모드 모두 0건이었다
  // (`grep -rnE "[\"'\`]Roboto(Medium|Bold|Mono)?[\"'\`]" src` 는 주석만 잡힌다).
  // 그런데도 여기 등록돼 있어서 스플래시 게이트(useFonts)가 매 기동마다 565,844B(약 566KB)를
  // 더 받고 있었다(2026-09-05 웹 export 실측). 다시 필요해지면 `@expo-google-fonts/roboto` 를 되살리고
  // `typography-m3-fonts.test.ts` 의 짝 검사에 키를 함께 넣을 것.
};
