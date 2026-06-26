/**
 * Home constellation from design/screen-design.dc.html: a 12-o'clock 북극성,
 * a recognizable 북두칠성 arc, then the large SecondB head as the one hero
 * character. No legacy village/cosmic node art is used here.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, Polyline, RadialGradient, Stop } from "react-native-svg";

import { deepSpace, deepSpaceGradients, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { DOMAIN_STARS, type DomainId } from "@/lib/persona/domain-stars";
import { type LadderLevel } from "@/lib/persona/brightness";
import { starOpacity, soulCoreOpacity } from "@/lib/persona/constellation-brightness";
import { SecondbHead } from "./SecondbHead";

const W = 320;
const STAR_H = 292;

// The seven Big-Dipper points map to the layer-A DOMAIN stars (career → … →
// collect), in DOMAIN_STARS order. Coordinates + sizes are the canon arc from
// design/screen-design.dc.html, unchanged from the prior labeling — only the
// star identity moved from the layer-B constructs to the life domains.
const STARS: { id: DomainId; x: number; y: number; size: number }[] = [
  { id: "career", x: 48, y: 238, size: 14 },
  { id: "finance", x: 91, y: 205, size: 14 },
  { id: "growth", x: 133, y: 196, size: 14 },
  { id: "relation", x: 174, y: 206, size: 14 },
  { id: "health", x: 206, y: 238, size: 13 },
  { id: "recreation", x: 272, y: 204, size: 14 },
  { id: "collect", x: 248, y: 150, size: 14 },
];

const NAME = Object.fromEntries(
  DOMAIN_STARS.map((s) => [s.id, { ko: s.nameKo, en: s.nameEn }]),
) as Record<DomainId, { ko: string; en: string }>;

export function ConstellationHome({
  isKo,
  hint,
  polarisLabel,
  onStarPress,
  onPolarisPress,
  starLevels = {},
  northStarBrightness = 0.2,
}: {
  isKo: boolean;
  hint: string;
  polarisLabel: string;
  onStarPress: (id: DomainId) => void;
  onPolarisPress: () => void;
  // Per-domain value-ladder levels and the aggregate 북극성 brightness (0-1),
  // from the no-LLM loadDomainLevels path. Default = an honest empty sky (every
  // star L1, 북극성 at its floor) so a brand-new user sees a dim constellation
  // that brightens as they gather data. Brightness drives OPACITY only; the
  // tier-1 size hierarchy (polaris r=12 vs star r<=7) is left untouched.
  starLevels?: Partial<Record<DomainId, LadderLevel>>;
  northStarBrightness?: number;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.starStage}>
        <View pointerEvents="none" style={styles.constellationGlow} />
        <Svg width={W} height={STAR_H} viewBox="0 0 320 292" style={styles.svg} pointerEvents="none">
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
            points="48,238 91,205 133,196 174,206"
            fill="none"
            stroke={withAlpha(deepSpace.accentDim, 0.34)}
            strokeWidth={1.1}
          />
          <Polyline
            points="174,206 206,238 272,204 248,150 174,206"
            fill="none"
            stroke={withAlpha(deepSpace.accentDim, 0.34)}
            strokeWidth={1.1}
          />
          <Line
            x1={248}
            y1={150}
            x2={160}
            y2={36}
            stroke={deepSpace.soulLine}
            strokeWidth={1}
            strokeDasharray="2 5"
          />
          <Circle
            cx={160}
            cy={36}
            r={12}
            fill="url(#ds-polaris)"
            opacity={soulCoreOpacity(northStarBrightness)}
          />
          {STARS.map((s) => (
            <Circle
              key={s.id}
              cx={s.x}
              cy={s.y}
              r={s.size / 2}
              fill="url(#ds-star)"
              opacity={starOpacity(starLevels[s.id] ?? 1)}
            />
          ))}
        </Svg>

        {/* Visible domain + 북극성 labels (PF-1): the NAME map was accessibility-only,
            so a sighted first-run user saw seven unlabeled dots and didn't know what
            to tap. Render the names (matching design/05-home). Non-interactive — the
            Pressables below own the taps; small + muted so the tier-1 hero/북극성 stay
            dominant. */}
        {STARS.map((s) => (
          <Text
            key={`label-${s.id}`}
            numberOfLines={1}
            style={[styles.starLabel, { left: s.x - 30, top: s.y + 9 }]}
          >
            {isKo ? NAME[s.id].ko : NAME[s.id].en}
          </Text>
        ))}
        <Text numberOfLines={2} style={[styles.polarisLabelText, { left: 160 - 60, top: 36 + 14 }]}>
          {polarisLabel}
        </Text>

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
  starStage: { position: "relative", width: W, height: STAR_H, marginTop: 0 },
  constellationGlow: {
    position: "absolute",
    left: 18,
    top: 28,
    width: 284,
    height: 236,
    borderRadius: 142,
    backgroundColor: withAlpha(deepSpace.bgMid, 0.7),
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accent, 0.12),
  },
  svg: { position: "absolute", top: 0, left: 0 },
  polarisHit: {
    position: "absolute",
    left: 136,
    top: 12,
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
  starLabel: {
    position: "absolute",
    width: 60,
    textAlign: "center",
    color: withAlpha(deepSpace.text, 0.62),
    fontSize: 9,
    lineHeight: 12,
    fontFamily: fontFamilies.readable,
  },
  polarisLabelText: {
    position: "absolute",
    width: 120,
    textAlign: "center",
    color: withAlpha(deepSpace.textHi, 0.82),
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    fontFamily: fontFamilies.readable,
  },
  hero: {
    width: 190,
    minHeight: 176,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
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
