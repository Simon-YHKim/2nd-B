import { Image } from "expo-image";
import {
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Polygon, Rect } from "react-native-svg";

import { LivingAsset } from "@/components/motion/LivingAsset";
import type { PatternDataColorKey } from "@/lib/graph/pattern-data-color";
import { cosmic, flattenAlpha } from "@/lib/theme/tokens";

// ── 보석 면의 색 (PIXEL-CLAY 절대 규칙 4) ────────────────────────────
//
// 면마다 `opacity` 를 달아 음영을 만들고 있었다. 알파로 쌓은 깊이는 겹칠수록 색이
// 미끄러지는데, 픽셀아트는 **셀 수 있는 몇 개의 색**으로 깊이를 낸다.
// 그래서 각 면의 톤을 그 알파값으로 **미리 합성**해 불투명 색 하나로 만든다.
//
// ⚠ **바탕 선언**: 이 아트가 앉는 바닥은 `cosmic.space950`(화면 기본 배경)이다.
//   면들이 서로 겹치는 곳은 옛 알파 합성과 완전히 같지는 않다 — 알파는 아래 깔린
//   면과 섞였고 여기서는 바닥과 섞는다. **그 차이가 규칙이 없애려는 것**이다
//   (겹침에 따라 색이 달라지는 것).
//
// ⚠ 이 보석 면(아래 V10PatternDataVector)은 레거시 마을 그래프(NavGraph)만 그린다(배포는 deep-space 고정).
//   그래도 면제가 아니다 — #1304 의 "레거시를 지키지 않는다"는 **규칙을 적용한다**는 뜻이다.
const ART_GROUND = cosmic.space950;
const artFlat = (c: string, a: number): string => flattenAlpha(c, a, ART_GROUND);

const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;
const SNOW_CRYSTAL_HOT = cosmic.moonWhite;
const SNOW_CRYSTAL_COOL = cosmic.signalBlue;

// Only the soul core is drawn. The six pattern-core ids (work_growth ·
// relationship · knowledge · records · inspiration · routine) were passed only by
// the `EXPO_PUBLIC_UI=legacy` SceneHero half, which left with that lever on
// 2026-10-05 (Simon decision Q-261004-11). Widening this type again means
// bringing back art for those ids first.
export type FinalCoreId = "core";

// ─── What this module bundles (2026-10-04 · D-14 · L4-09 · L4-10) ───────────
// Metro bakes every static require() below into every web/APK/IPA bundle,
// whichever branch a screen renders. So a require stays here only while some
// renderer can reach it:
//
// - `core` -> tesseract-v10/soul_core.png. The shipped deep-space build draws it
//   on the /core-brain load-error and empty states (core-brain.tsx -> IslandArt
//   id="core"). It is the only tesseract a deep-space user sees.
// - the six pattern cores -> the v45 256px set (6 files, 71,931 B) was kept for
//   the EXPO_PUBLIC_UI=legacy rollback skin (SceneHero's legacy half) only. That
//   lever was retired on 2026-10-05 (Q-261004-11) and the set moved to
//   E:/Legacy/2ndB (MANIFEST.jsonl, batch qa261004-lever) with PATTERN_CORE_ART.
//
// Moved out of the repo to E:/Legacy/2ndB (MANIFEST.jsonl, batch qa261004-art):
// the v10 non-core PNGs, the v45 soul core and every v45 Pattern Data / Log /
// Pattern Link PNG, plus the code that had no caller: the `variant` prop (the
// v45 comparison set; its preview route left in #583), the soul-flame overlay,
// FinalPatternDataArt, FinalLogArt, FinalPatternLinkArt,
// finalPatternDataIdForDomain and finalLogIdForGraphPiece.
const SOUL_CORE_ART: ImageSourcePropType = require("../../../assets/legacy-art/tesseract-v10/soul_core.png");


// Tier-3 Pattern Data: 9 color variants keyed by PatternDataColorKey, resolved
// upstream by resolvePatternDataColor(). Production (v10) renders these with the
// recolorable vector renderer below rather than per-color PNGs (avoids ~16 MB of
// color-duplicate assets).

type PatternVectorTone = "shadow" | "base" | "mid" | "hot" | "glint";

const V10_PATTERN_DATA_PALETTE: Record<PatternDataColorKey, Record<PatternVectorTone, string>> = {
  red: { shadow: cosmic.space800, base: cosmic.guardRose, mid: cosmic.dreamPink, hot: cosmic.pixelLamp, glint: cosmic.moonWhite },
  orange: { shadow: cosmic.space800, base: cosmic.pixelLamp, mid: cosmic.guardRose, hot: cosmic.moonWhite, glint: cosmic.softWhite },
  yellow: { shadow: cosmic.space800, base: cosmic.pixelLamp, mid: cosmic.signalMint, hot: cosmic.moonWhite, glint: cosmic.softWhite },
  green: { shadow: cosmic.space800, base: cosmic.signalMint, mid: cosmic.signalBlue, hot: cosmic.moonWhite, glint: cosmic.softWhite },
  blue: { shadow: cosmic.space800, base: cosmic.signalBlue, mid: cosmic.signalMint, hot: cosmic.moonWhite, glint: cosmic.softWhite },
  indigo: { shadow: cosmic.space800, base: cosmic.soulViolet2, mid: cosmic.signalBlue, hot: cosmic.moonWhite, glint: cosmic.softWhite },
  violet: { shadow: cosmic.space800, base: cosmic.soulViolet, mid: cosmic.dreamPink, hot: cosmic.moonWhite, glint: cosmic.softWhite },
  white: { shadow: cosmic.space700, base: cosmic.moonWhite, mid: cosmic.mistGray, hot: cosmic.signalMint, glint: cosmic.softWhite },
  black: { shadow: cosmic.space950, base: cosmic.space700, mid: cosmic.lineDim, hot: cosmic.mistGray, glint: cosmic.moonWhite },
};

// ⚠ 필드 이름이 `opacity` 에서 `mix` 로 바뀌었다. 이제 이 숫자는 렌더 불투명도가
//   아니라 **바탕과 섞는 비율**이다(위 `artFlat`). 이름이 사실과 달라지면
//   다음 사람이 알파로 되돌린다.
const V10_PATTERN_DATA_FACETS: readonly { points: string; tone: PatternVectorTone; mix?: number }[] = [
  { points: "48,5 76,19 90,48 74,79 48,91 22,79 6,48 20,19", tone: "shadow", mix: 0.86 },
  { points: "48,11 72,23 83,48 68,73 48,84 28,73 13,48 24,23", tone: "base", mix: 0.9 },
  { points: "48,11 72,23 55,43 48,48 41,43 24,23", tone: "mid", mix: 0.78 },
  { points: "13,48 41,43 48,48 28,73", tone: "base", mix: 0.74 },
  { points: "83,48 55,43 48,48 68,73", tone: "hot", mix: 0.74 },
  { points: "28,73 48,48 68,73 48,84", tone: "mid", mix: 0.7 },
  { points: "41,43 48,11 55,43 48,48", tone: "glint", mix: 0.72 },
];

const V10_PATTERN_DATA_PIXELS: readonly { x: number; y: number; size: number; tone: PatternVectorTone; mix?: number }[] = [
  { x: 45, y: 18, size: 6, tone: "glint", mix: 0.9 },
  { x: 33, y: 28, size: 5, tone: "hot", mix: 0.82 },
  { x: 58, y: 29, size: 5, tone: "glint", mix: 0.76 },
  { x: 24, y: 45, size: 6, tone: "mid", mix: 0.82 },
  { x: 67, y: 45, size: 6, tone: "hot", mix: 0.8 },
  { x: 39, y: 54, size: 5, tone: "glint", mix: 0.7 },
  { x: 52, y: 58, size: 5, tone: "mid", mix: 0.74 },
  { x: 45, y: 72, size: 6, tone: "base", mix: 0.8 },
  { x: 14, y: 38, size: 4, tone: "hot", mix: 0.65 },
  { x: 78, y: 38, size: 4, tone: "glint", mix: 0.65 },
];

// `id` stays a required prop typed FinalCoreId, so a caller that passes any other
// id fails to compile instead of silently drawing the soul core.
export function FinalCoreArt({
  size,
  style,
}: {
  id: FinalCoreId;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <SoulCoreArt size={size} style={style} />;
}

function SoulCoreArt({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      pointerEvents="none"
      style={[{ width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image source={SOUL_CORE_ART} style={[{ width: size, height: size }, PIXELATED]} contentFit="contain" />
    </View>
  );
}

type PixelCell = { x: number; y: number; w: number; h: number; color: string; opacity?: number };

const SNOWFLAKE_CELLS: PixelCell[] = [
  { x: 0.5, y: 0.04, w: 1, h: 1.6, color: SNOW_CRYSTAL_HOT },
  { x: 0.5, y: 0.96, w: 1, h: 1.6, color: SNOW_CRYSTAL_COOL },
  { x: 0.04, y: 0.5, w: 1.6, h: 1, color: SNOW_CRYSTAL_COOL },
  { x: 0.96, y: 0.5, w: 1.6, h: 1, color: SNOW_CRYSTAL_HOT },
  { x: 0.21, y: 0.21, w: 1.25, h: 1.25, color: SNOW_CRYSTAL_COOL, opacity: 0.92 },
  { x: 0.79, y: 0.21, w: 1.25, h: 1.25, color: SNOW_CRYSTAL_HOT, opacity: 0.92 },
  { x: 0.21, y: 0.79, w: 1.25, h: 1.25, color: SNOW_CRYSTAL_HOT, opacity: 0.86 },
  { x: 0.79, y: 0.79, w: 1.25, h: 1.25, color: SNOW_CRYSTAL_COOL, opacity: 0.88 },
  { x: 0.5, y: 0.5, w: 1.7, h: 1.7, color: SNOW_CRYSTAL_HOT },
];

// Pattern Data snowflake: only the orphan NavGraph imports it. It stays while
// NavGraph sits in src/ (tsconfig compiles it); it bundles no image file.
export function FinalPatternDataSnowflakeArt({
  colorKey,
  size,
  style,
  animated = true,
}: {
  colorKey: PatternDataColorKey;
  size: number;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}) {
  const px = Math.max(1.5, size * 0.045);
  return (
    <LivingAsset preset="patternData" id={`pd-snow-${colorKey}`} size={size} style={style} enabled={animated} pointerEvents="none">
      <View style={[styles.snowflakeFrame, { width: size, height: size }]}>
        {SNOWFLAKE_CELLS.map((cell, i) => (
          <View
            key={`${cell.x}-${cell.y}-${i}`}
            style={[
              styles.snowflakeCell,
              {
                left: size * cell.x - (px * cell.w) / 2,
                top: size * cell.y - (px * cell.h) / 2,
                width: px * cell.w,
                height: px * cell.h,
                backgroundColor: cell.color,
                opacity: cell.opacity ?? 1,
              },
            ]}
          />
        ))}
        <V10PatternDataVector colorKey={colorKey} size={size} style={styles.snowflakeImage} />
      </View>
    </LivingAsset>
  );
}

function V10PatternDataVector({
  colorKey,
  size,
  style,
}: {
  colorKey: PatternDataColorKey;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = V10_PATTERN_DATA_PALETTE[colorKey];
  return (
    <View
      pointerEvents="none"
      style={[{ width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox="0 0 96 96" focusable={false}>
        <Rect x={28} y={8} width={40} height={80} fill={artFlat(palette.shadow, 0.1)} />
        <Rect x={8} y={28} width={80} height={40} fill={artFlat(palette.shadow, 0.1)} />
        {V10_PATTERN_DATA_FACETS.map((facet, index) => (
          <Polygon
            key={`${facet.points}-${index}`}
            points={facet.points}
            fill={artFlat(palette[facet.tone], facet.mix ?? 1)}
          />
        ))}
        <Rect x={22} y={22} width={52} height={52} fill="none" stroke={artFlat(palette.glint, 0.36)} strokeWidth={2} />
        <Rect x={30} y={30} width={36} height={36} fill="none" stroke={artFlat(palette.hot, 0.42)} strokeWidth={2} />
        {V10_PATTERN_DATA_PIXELS.map((pixel, index) => (
          <Rect
            key={`${pixel.x}-${pixel.y}-${index}`}
            x={pixel.x}
            y={pixel.y}
            width={pixel.size}
            height={pixel.size}
            fill={artFlat(palette[pixel.tone], pixel.mix ?? 1)}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  snowflakeFrame: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: SNOW_CRYSTAL_COOL,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  snowflakeCell: {
    position: "absolute",
    borderRadius: 0,
    shadowColor: SNOW_CRYSTAL_COOL,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  snowflakeImage: {
    position: "absolute",
  },
});
