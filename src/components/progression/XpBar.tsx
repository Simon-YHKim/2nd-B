// Compact level + XP progress bar. Pure presentational — pass a LevelProgress
// from useProgression(). Colors go through semantic tokens (DESIGN.md).

import { View, StyleSheet } from "react-native";

import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import type { LevelProgress } from "@/lib/progression/levels";

export function XpBar({ progress, locale = "ko" }: { progress: LevelProgress; locale?: "en" | "ko" }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
  const trailing = progress.isMaxLevel
    ? locale === "ko"
      ? `${progress.totalXp} XP · 최고 레벨`
      : `${progress.totalXp} XP · max level`
    : locale === "ko"
      ? `다음 레벨까지 ${progress.xpToNextLevel} XP`
      : `${progress.xpToNextLevel} XP to next level`;
  const accessibilityLabel =
    locale === "ko"
      ? `레벨 ${progress.level}, 경험치 진행률 ${pct}%`
      : `Level ${progress.level}, XP progress ${pct}%`;
  const accessibilityHint = progress.isMaxLevel
    ? locale === "ko"
      ? "이미 최고 레벨입니다."
      : "Already at the max level."
    : trailing;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: pct, text: trailing }}
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.row}>
        <Text variant="caption" color="brand" style={styles.lv}>
          Lv {progress.level}
        </Text>
        <Text variant="subtle" color="textSubtle">
          {trailing}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lv: { fontWeight: "700", letterSpacing: 0 },
  track: {
    height: 8,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: semantic.brand, borderRadius: radii.sm },
});
