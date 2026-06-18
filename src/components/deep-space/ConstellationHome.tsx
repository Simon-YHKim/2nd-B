/**
 * STEP 4 — <ConstellationHome /> : the home hero from design/prototype.dc.html.
 * 북극성 (Soul Core, tier-1, tappable → IDEN) at the top, the 북두칠성 7 self-
 * understanding stars below (tier-3, tappable → lens). A star's brightness IS
 * its real ladder level (lit at >= L2), so the home reflects actual progress.
 *
 * The Soul Core uses the sanctioned soul radial gradient; star glows pair iOS
 * shadow with Android elevation (ANDROID_QA §1). Colors are deepSpace.* tokens.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, Polyline, RadialGradient, Stop } from "react-native-svg";

import { deepSpace, deepSpaceGradients, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SELF_UNDERSTANDING_STARS, type StarId } from "@/lib/persona/stars";
import type { LadderLevel } from "@/lib/persona/brightness";

const BOX_W = 320;
const BOX_H = 300;

// Star screen positions, lifted from the prototype constellation layout.
const STAR_POS: Record<StarId, { top: number; left: number; size: number }> = {
  now: { top: 78, left: 70, size: 14 },
  recall: { top: 112, left: 88, size: 13 },
  seen: { top: 144, left: 113, size: 13 },
  rhythm: { top: 144, left: 124, size: 11 },
  relational: { top: 204, left: 63, size: 12 },
  possible: { top: 226, left: 104, size: 13 },
  values: { top: 204, left: 144, size: 12 },
};

export function ConstellationHome({
  starLevels,
  isKo,
  hint,
  polarisLabel,
  onStarPress,
  onPolarisPress,
}: {
  starLevels?: Partial<Record<StarId, LadderLevel>>;
  isKo: boolean;
  hint: string;
  polarisLabel: string;
  onStarPress: (id: StarId) => void;
  onPolarisPress: () => void;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.box}>
        <Svg width={BOX_W} height={BOX_H} style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Soul-line down to the constellation + the cyan star links. */}
          <Line x1={160} y1={46} x2={120} y2={150} stroke={deepSpace.soulLine} strokeWidth={1} strokeDasharray="3 4" />
          <Polyline
            points="77,85 95,119 120,150 131,150 70,210 111,232 151,210"
            fill="none"
            stroke={withAlpha(deepSpace.accentSoft, 0.32)}
            strokeWidth={1}
          />
        </Svg>

        {/* 북극성 · Soul Core (tier-1). */}
        <Pressable
          onPress={onPolarisPress}
          style={styles.polaris}
          accessibilityRole="button"
          accessibilityLabel={polarisLabel}
          hitSlop={14}
        >
          <Svg width={44} height={44} viewBox="0 0 44 44">
            <Defs>
              <RadialGradient id="ds-soul-core" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={deepSpaceGradients.soulCore[0]} />
                <Stop offset="1" stopColor={deepSpaceGradients.soulCore[1]} />
              </RadialGradient>
            </Defs>
            <Circle cx={22} cy={22} r={11} fill={withAlpha(deepSpace.soul, 0.25)} />
            <Circle cx={22} cy={22} r={7} fill="url(#ds-soul-core)" />
          </Svg>
        </Pressable>
        <Text style={styles.polarisLabel}>{polarisLabel}</Text>

        {/* The 7 self-understanding stars (tier-3). */}
        {SELF_UNDERSTANDING_STARS.map((s) => {
          const pos = STAR_POS[s.id];
          const lit = (starLevels?.[s.id] ?? 1) >= 2;
          const color = lit ? deepSpace.accentSoft : deepSpace.accentDim;
          return (
            <Pressable
              key={s.id}
              onPress={() => onStarPress(s.id)}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel={isKo ? s.nameKo : s.nameEn}
              style={[
                styles.star,
                {
                  top: pos.top,
                  left: pos.left,
                  width: pos.size,
                  height: pos.size,
                  borderRadius: pos.size / 2,
                  backgroundColor: color,
                  shadowColor: color,
                  opacity: lit ? 1 : 0.5,
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
  root: { flex: 1, alignItems: "center", justifyContent: "flex-start" },
  box: { width: BOX_W, height: BOX_H, marginTop: 6 },
  polaris: { position: "absolute", top: 24, left: BOX_W / 2 - 22, width: 44, height: 44 },
  polarisLabel: {
    position: "absolute",
    top: 62,
    left: 0,
    width: BOX_W,
    textAlign: "center",
    color: withAlpha(deepSpace.soul, 0.75),
    fontSize: 10,
    fontFamily: fontFamilies.pixelKo,
  },
  star: {
    position: "absolute",
    shadowOpacity: 0.85,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  hint: {
    marginTop: 2,
    paddingHorizontal: 20,
    textAlign: "center",
    color: withAlpha(deepSpace.text, 0.5),
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fontFamilies.readable,
  },
});
