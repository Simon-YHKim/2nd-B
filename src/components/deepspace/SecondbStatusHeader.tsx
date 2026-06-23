import { StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";

import { colors, radius, spacing } from "@/theme/tokens";
import { Text } from "@/components/ui/Text";
import { backArrowVisible } from "@/components/ui/BackArrow";

import { SecondbHead, type SecondbMood } from "./SecondbHead";

interface SecondbStatusHeaderProps {
  text: string;
  tip: string;
  mood?: SecondbMood;
}

export function SecondbStatusHeader({ text, tip, mood = "neutral" }: SecondbStatusHeaderProps) {
  // Reserve top headroom on sub-screens so the floating BackArrow chip does not
  // overlap the head/bubble. On tab roots (arrow hidden) no extra room is added.
  const needHeadroom = backArrowVisible(usePathname());
  return (
    <View style={[styles.wrap, needHeadroom ? styles.wrapHeadroom : null]}>
      <SecondbHead mood={mood} size={48} />
      <View style={styles.bubble}>
        <View style={styles.tail} />
        <Text variant="body" style={styles.text}>{text}</Text>
        <View style={styles.tipRow}>
          <Text variant="caption" pixelEn style={styles.tipLabel}>TIP</Text>
          <Text variant="body" style={styles.tipText}>{tip}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    marginHorizontal: 12,
    marginTop: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  // Sub-screens: clear the floating BackArrow chip (top-left ~44pt) above the head.
  wrapHeadroom: { marginTop: 52 },
  bubble: {
    flex: 1,
    position: "relative",
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 4,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: spacing.sm,
  },
  tail: {
    position: "absolute",
    left: -5,
    top: 11,
    width: 9,
    height: 9,
    backgroundColor: colors.cardBg,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    transform: [{ rotate: "45deg" }],
  },
  text: {
    color: colors.textHi,
    fontSize: 14,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 7,
  },
  tipLabel: {
    color: colors.mint,
    fontSize: 9,
    letterSpacing: 0.48,
    lineHeight: 13,
  },
  tipText: {
    flex: 1,
    color: colors.textLo,
    fontSize: 12,
  },
});
