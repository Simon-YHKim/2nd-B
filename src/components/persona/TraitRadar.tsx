/**
 * Big Five trait radar (rev2 P3a — 북극성 deck card). Renders the PersonaCard
 * traits (0-1) as a pentagon on the deep-space sky. Honesty rules:
 *  - the source line always says WHERE the shape came from (instrument vs
 *    journal-text approximation, the shipped approximation-notice wording) — an
 *    interpretation, never a verdict;
 *  - grid + shape only, no numeric scores (bands over raw numbers, D-25 spirit).
 * Geometry is pure + tested (trait-radar-geometry.ts).
 */
import { StyleSheet, View } from "react-native";
import Svg, { Line, Polygon, Text as SvgText } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import type { PersonaTraits, TraitsSource } from "@/lib/persona/build";
import { instrumentLabel } from "@/lib/persona/build";
import {
  RADAR_TRAIT_KEYS,
  RADAR_TRAIT_LABEL,
  radarAxisPoints,
  radarPoint,
  radarPolygonPoints,
} from "@/lib/persona/trait-radar-geometry";

const SIZE = 232;
const CX = SIZE / 2;
const CY = SIZE / 2 + 4;
const R = 78;
const GRID_LEVELS = [1 / 3, 2 / 3, 1];

export function TraitRadar({
  traits,
  traitsSource,
  locale,
}: {
  traits: PersonaTraits;
  traitsSource: TraitsSource;
  locale: "en" | "ko";
}) {
  const values = RADAR_TRAIT_KEYS.map((k) => traits[k]);
  const axes = radarAxisPoints(RADAR_TRAIT_KEYS.length, CX, CY, R);
  const instrument = instrumentLabel(traitsSource);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        locale === "ko"
          ? `성격 지형 레이더: ${RADAR_TRAIT_KEYS.map(
              (k, i) => `${RADAR_TRAIT_LABEL.ko[k]} ${Math.round(values[i] * 100)}`,
            ).join(", ")}`
          : `Trait radar: ${RADAR_TRAIT_KEYS.map(
              (k, i) => `${RADAR_TRAIT_LABEL.en[k]} ${Math.round(values[i] * 100)}`,
            ).join(", ")}`
      }
      style={styles.wrap}
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {GRID_LEVELS.map((level) => (
          <Polygon
            key={level}
            points={radarPolygonPoints(RADAR_TRAIT_KEYS.map(() => level), CX, CY, R)}
            fill="none"
            stroke={withAlpha(m3.accent.starDim, 0.28)}
            strokeWidth={1}
          />
        ))}
        {axes.map((a, i) => (
          <Line
            key={RADAR_TRAIT_KEYS[i]}
            x1={CX}
            y1={CY}
            x2={a.x}
            y2={a.y}
            stroke={withAlpha(m3.accent.starDim, 0.22)}
            strokeWidth={1}
          />
        ))}
        <Polygon
          points={radarPolygonPoints(values, CX, CY, R)}
          fill={withAlpha(m3.accent.starCore, 0.24)}
          stroke={m3.accent.starCore}
          strokeWidth={1.5}
        />
        {values.map((v, i) => {
          const p = radarPoint(i, values.length, v, CX, CY, R);
          return (
            <Polygon
              key={RADAR_TRAIT_KEYS[i]}
              points={`${p.x - 2},${p.y} ${p.x},${p.y - 2} ${p.x + 2},${p.y} ${p.x},${p.y + 2}`}
              fill={m3.accent.star}
            />
          );
        })}
        {axes.map((a, i) => {
          const key = RADAR_TRAIT_KEYS[i];
          const label = RADAR_TRAIT_LABEL[locale][key];
          const dx = a.x - CX;
          const anchor = Math.abs(dx) < 8 ? "middle" : dx > 0 ? "start" : "end";
          const lx = a.x + (anchor === "start" ? 7 : anchor === "end" ? -7 : 0);
          const ly = a.y < CY ? a.y - 7 : a.y + 15;
          return (
            <SvgText
              key={key}
              x={lx}
              y={ly}
              fill={withAlpha(m3.accent.skyText, 0.78)}
              fontSize={10}
              textAnchor={anchor}
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
      <Text variant="caption" color="textSubtle" style={styles.source}>
        {instrument
          ? locale === "ko"
            ? `${instrument} 검사 기반`
            : `From your ${instrument} assessment`
          : locale === "ko"
            ? "기록에서 만든 근사치예요. 검증 검사로 더 정확해져요."
            : "An approximation from your records. A validated check sharpens it."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  source: { marginTop: 2, textAlign: "center" },
});
