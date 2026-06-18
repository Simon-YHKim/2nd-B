/**
 * Home constellation — a 1:1 clone of the `isHome` block in
 * design/prototype.dc.html: 북극성 (Soul Core) + the 북두칠성 seven stars at the
 * design's exact positions, sizes and FIXED brightness (4 bright #9fe4ff, 3 dim
 * #7fc9f0 — per the design, not data-driven), plus the soul line + the
 * constellation polyline and the bottom hint. Colors come from deepSpace.* tokens.
 *
 * Stars route to their lens; 북극성 routes to the Soul Core. (Real per-star
 * brightness from the ladder is a later overlay — the design shows them lit.)
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, Polyline, RadialGradient, Stop } from "react-native-svg";

import { deepSpace, deepSpaceGradients, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SELF_UNDERSTANDING_STARS, type StarId } from "@/lib/persona/stars";

const W = 320;
const H = 300;

// Exact prototype positions / sizes / brightness (soft = #9fe4ff, dim = #7fc9f0).
const STARS: { id: StarId; top: number; left: number; size: number; soft: boolean }[] = [
  { id: "now", top: 78, left: 70, size: 14, soft: true },
  { id: "recall", top: 112, left: 88, size: 13, soft: true },
  { id: "seen", top: 144, left: 113, size: 13, soft: true },
  { id: "rhythm", top: 144, left: 124, size: 11, soft: false },
  { id: "relational", top: 204, left: 63, size: 12, soft: false },
  { id: "possible", top: 226, left: 104, size: 13, soft: true },
  { id: "values", top: 204, left: 144, size: 12, soft: false },
];

const NAME = Object.fromEntries(
  SELF_UNDERSTANDING_STARS.map((s) => [s.id, { ko: s.nameKo, en: s.nameEn }]),
) as Record<StarId, { ko: string; en: string }>;

export function ConstellationHome({
  isKo,
  hint,
  polarisLabel,
  onStarPress,
  onPolarisPress,
}: {
  isKo: boolean;
  hint: string;
  polarisLabel: string;
  onStarPress: (id: StarId) => void;
  onPolarisPress: () => void;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        <Svg width={W} height={H} viewBox="0 0 320 300" style={styles.svg} pointerEvents="none">
          <Line x1={160} y1={40} x2={120} y2={150} stroke={deepSpace.soulLine} strokeWidth={1} strokeDasharray="3 4" />
          <Polyline
            points="70,210 110,232 150,210 130,150 120,150 95,120 78,86"
            fill="none"
            stroke={withAlpha(deepSpace.text, 0.35)}
            strokeWidth={1}
          />
        </Svg>

        {/* 북극성 · Soul Core — top 26, left 144, 32px, radial soul gradient + glow. */}
        <Pressable
          onPress={onPolarisPress}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel={polarisLabel}
          style={styles.polaris}
        >
          <View style={styles.polarisGlow}>
            <Svg width={32} height={32} viewBox="0 0 32 32">
              <Defs>
                <RadialGradient id="ch-soul" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={deepSpaceGradients.soulCore[0]} />
                  <Stop offset="1" stopColor={deepSpaceGradients.soulCore[1]} />
                </RadialGradient>
              </Defs>
              <Circle cx={16} cy={16} r={16} fill="url(#ch-soul)" />
            </Svg>
          </View>
        </Pressable>
        <Text style={styles.label}>{polarisLabel}</Text>

        {STARS.map((s) => {
          const color = s.soft ? deepSpace.accentSoft : deepSpace.accentDim;
          return (
            <Pressable
              key={s.id}
              onPress={() => onStarPress(s.id)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={isKo ? NAME[s.id].ko : NAME[s.id].en}
              style={[
                styles.star,
                {
                  top: s.top,
                  left: s.left,
                  width: s.size,
                  height: s.size,
                  borderRadius: s.size / 2,
                  backgroundColor: color,
                  shadowColor: color,
                },
              ]}
            />
          );
        })}
      </View>

      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center" },
  stage: { width: W, height: H, marginTop: 6 },
  svg: { position: "absolute", top: 0, left: 0 },
  polaris: { position: "absolute", top: 26, left: 144, width: 32, height: 32 },
  polarisGlow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: deepSpace.soulDeep,
    shadowColor: deepSpace.soul,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  label: {
    position: "absolute",
    top: 60,
    left: 0,
    width: W,
    textAlign: "center",
    color: withAlpha(deepSpace.soul, 0.7),
    fontSize: 10,
    fontFamily: fontFamilies.pixelKo,
  },
  star: {
    position: "absolute",
    shadowOpacity: 0.6,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  hint: {
    position: "absolute",
    bottom: 14,
    left: 20,
    right: 20,
    textAlign: "center",
    color: withAlpha(deepSpace.text, 0.5),
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fontFamilies.readable,
  },
});
