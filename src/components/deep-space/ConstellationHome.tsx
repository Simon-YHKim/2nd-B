/**
 * Home constellation from design/screen-design.dc.html: a 12-o'clock 북극성,
 * a recognizable 북두칠성 arc, then the large SecondB head as the one hero
 * character. No legacy village/cosmic node art is used here.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, Polyline, RadialGradient, Stop } from "react-native-svg";

import { deepSpace, deepSpaceGradients, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SELF_UNDERSTANDING_STARS, type StarId } from "@/lib/persona/stars";
import { SecondbHead } from "./SecondbHead";

const W = 320;
const STAR_H = 248;

const STARS: { id: StarId; x: number; y: number; size: number }[] = [
  { id: "possible", x: 63, y: 224, size: 10 },
  { id: "recall", x: 98, y: 189, size: 10 },
  { id: "values", x: 128, y: 188, size: 10 },
  { id: "rhythm", x: 167, y: 179, size: 10 },
  { id: "now", x: 188, y: 206, size: 9 },
  { id: "relational", x: 244, y: 174, size: 10 },
  { id: "seen", x: 226, y: 136, size: 10 },
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
      <View style={styles.starStage}>
        <Svg width={W} height={STAR_H} viewBox="0 0 320 248" style={styles.svg} pointerEvents="none">
          <Defs>
            <RadialGradient id="ds-star" cx="50%" cy="45%" r="55%">
              <Stop offset="0" stopColor={deepSpace.accentBright} />
              <Stop offset="0.72" stopColor={deepSpace.accent} />
              <Stop offset="1" stopColor={deepSpace.accentDim} />
            </RadialGradient>
            <RadialGradient id="ds-polaris" cx="50%" cy="45%" r="55%">
              <Stop offset="0" stopColor={deepSpace.textHi} />
              <Stop offset="0.48" stopColor={deepSpaceGradients.soulCore[0]} />
              <Stop offset="1" stopColor={deepSpaceGradients.soulCore[1]} />
            </RadialGradient>
          </Defs>
          <Polyline
            points="63,224 98,189 128,188 167,179"
            fill="none"
            stroke={withAlpha(deepSpace.accentDim, 0.34)}
            strokeWidth={1.1}
          />
          <Polyline
            points="167,179 188,206 244,174 226,136 167,179"
            fill="none"
            stroke={withAlpha(deepSpace.accentDim, 0.34)}
            strokeWidth={1.1}
          />
          <Line
            x1={226}
            y1={136}
            x2={140}
            y2={30}
            stroke={deepSpace.soulLine}
            strokeWidth={1}
            strokeDasharray="2 5"
          />
          <Circle cx={140} cy={30} r={8} fill="url(#ds-polaris)" />
          {STARS.map((s) => (
            <Circle key={s.id} cx={s.x} cy={s.y} r={s.size / 2} fill="url(#ds-star)" />
          ))}
        </Svg>

        <Pressable
          onPress={onPolarisPress}
          hitSlop={18}
          accessibilityRole="button"
          accessibilityLabel={polarisLabel}
          style={styles.polarisHit}
        />
        {STARS.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => onStarPress(s.id)}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={isKo ? NAME[s.id].ko : NAME[s.id].en}
            style={[styles.starHit, { left: s.x - 15, top: s.y - 15 }]}
          />
        ))}
      </View>

      <View style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SecondbHead size={158} mood="positive" />
      </View>

      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "space-between", paddingBottom: 14 },
  starStage: { position: "relative", width: W, height: STAR_H, marginTop: 4 },
  svg: { position: "absolute", top: 0, left: 0 },
  polarisHit: {
    position: "absolute",
    left: 120,
    top: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  starHit: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  hero: {
    width: 190,
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -8,
  },
  hint: {
    textAlign: "center",
    color: withAlpha(deepSpace.text, 0.66),
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fontFamilies.readable,
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
});
