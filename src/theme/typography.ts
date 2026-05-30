// Typography — NeoDunggeunmo (둥근모꼴 / 네오둥근모) pixel bitmap font, applied
// app-wide per user directive (2026-05-29). It fits the Cosmic Pixel Graph
// Village aesthetic: a crisp Korean+Latin pixel face. SIL OFL 1.1.
// https://neodgm.dalgona.dev/
//
// Every text family below resolves to NeoDunggeunmo so the whole app reads
// in one consistent pixel voice; `mono` uses the fixed-width NeoDunggeunmoCode
// variant for numeric / code-ish spots.

import { Platform } from "react-native";

// Main proportional pixel face.
const PIXEL = Platform.select({
  ios: "NeoDunggeunmo",
  android: "NeoDunggeunmo",
  web: '"NeoDunggeunmo", "둥근모꼴", monospace',
  default: "monospace",
});

// Fixed-width pixel variant (code / numbers).
const PIXEL_MONO = Platform.select({
  ios: "NeoDunggeunmoCode",
  android: "NeoDunggeunmoCode",
  web: '"NeoDunggeunmoCode", "NeoDunggeunmo", monospace',
  default: "monospace",
});

// Readable sans (closeout-v3 #10): long Korean paragraphs / bottom-sheet
// descriptions / CTAs should NOT use the pixel face — it hurts legibility at
// small sizes. Use Pretendard / system sans for body copy. Pixel stays for
// labels, badges, and decorative headings.
const READABLE = Platform.select({
  ios: "Pretendard",
  android: "Pretendard",
  web: '"Pretendard", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  default: "sans-serif",
});

export const fontFamilies = {
  // All faces resolve to the one pixel face (user directive: 전부 적용).
  serifKo: PIXEL,
  serifEn: PIXEL,
  sans: PIXEL,
  // Fixed-width pixel variant for trait numbers / code.
  mono: PIXEL_MONO,
  // Explicit alias for callers that want to be unambiguous.
  pixel: PIXEL,
  // Readable sans for long-form Korean copy.
  readable: READABLE,
} as const;

export const fontWeights = {
  regular: "400",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const;

// expo-font useFonts() input. Asset paths resolve to the root assets/ dir.
// The font ships a single weight; weight props degrade gracefully.
export const fontAssets = {
  NeoDunggeunmo: require("../../assets/fonts/NeoDunggeunmo-Regular.ttf"),
  NeoDunggeunmoCode: require("../../assets/fonts/NeoDunggeunmoCode-Regular.ttf"),
};
