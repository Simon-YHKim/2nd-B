// Typography pairing — Nanum Myeongjo (KO serif) + Source Serif 4 (EN serif)
// + Pretendard (sans UI) + monospace. Phytoncide design system.

import { Platform } from "react-native";

export const fontFamilies = {
  // 한국어 명조 — Display, Quote
  serifKo: Platform.select({
    ios: "NanumMyeongjo-Regular",
    android: "NanumMyeongjo-Regular",
    web: '"Nanum Myeongjo", "본명조", Georgia, serif',
    default: "serif",
  }),
  // 영어 세리프 — Display Italic, English Quote
  serifEn: Platform.select({
    ios: "SourceSerif4-Regular",
    android: "SourceSerif4-Regular",
    web: '"Source Serif 4", "Iowan Old Style", Georgia, serif',
    default: "serif",
  }),
  // 본문·UI 산세리프
  sans: Platform.select({
    ios: "Pretendard",
    android: "Pretendard",
    web: '"Pretendard", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, sans-serif',
    default: "sans-serif",
  }),
  // 모노스페이스 — 트레잇 수치, 코드
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    web: "ui-monospace, SFMono-Regular, Menlo, monospace",
    default: "monospace",
  }),
} as const;

export const fontWeights = {
  regular: "400",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const;

// expo-font useFonts() input. Asset paths resolve to the root assets/ dir.
export const fontAssets = {
  "NanumMyeongjo-Regular": require("../../assets/fonts/NanumMyeongjo-Regular.ttf"),
  "NanumMyeongjo-Bold": require("../../assets/fonts/NanumMyeongjo-Bold.ttf"),
  "NanumMyeongjo-ExtraBold": require("../../assets/fonts/NanumMyeongjo-ExtraBold.ttf"),
  "SourceSerif4-Regular": require("../../assets/fonts/SourceSerif4-Regular.ttf"),
  "SourceSerif4-SemiBold": require("../../assets/fonts/SourceSerif4-SemiBold.ttf"),
  "SourceSerif4-Bold": require("../../assets/fonts/SourceSerif4-Bold.ttf"),
};
