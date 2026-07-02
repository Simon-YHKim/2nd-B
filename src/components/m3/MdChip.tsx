// MdChip - Material 3 chip (rev2 migration, P1b). assist / filter / input /
// suggestion. Authentic M3 chips use an 8dp (m3.shape.small) corner, NOT a pill.
// Consumes m3.* tokens only; user-visible strings arrive via props.
//
// LAYOUT NOTE (device QA 2026-07-02): on Fabric Android, visual styles set on a
// Pressable could silently fail to apply (filter chips rendered as bare labels,
// no border/selection fill). The outer VIEW owns the chip container visuals;
// the inner Pressable only handles the hit + a11y. Do not move the container
// styles back onto the Pressable.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import { m3 } from "@/lib/theme/m3";

import { m3TextStyle } from "./typeface";

export type MdChipKind = "assist" | "filter" | "input" | "suggestion";

export interface MdChipProps {
  kind?: MdChipKind;
  label: string;
  /** filter chips only - the toggled state. */
  selected?: boolean;
  icon?: ReactNode;
  onPress?: () => void;
  /** input chips - trailing close affordance. */
  onClose?: () => void;
  accessibilityLabel?: string;
  removeAccessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function MdChip({
  kind = "assist",
  label,
  selected = false,
  icon,
  onPress,
  onClose,
  accessibilityLabel,
  removeAccessibilityLabel,
  style,
}: MdChipProps) {
  const isFilter = kind === "filter";
  const on = isFilter && selected;
  const fg = on ? m3.color.onSecondaryContainer : m3.color.onSurfaceVariant;
  return (
    <View style={[styles.chip, on ? styles.chipOn : styles.chipOff, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole={isFilter ? "checkbox" : "button"}
        accessibilityState={{ selected, checked: selected }}
        accessibilityLabel={accessibilityLabel ?? label}
        style={styles.hit}
      >
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text style={[m3TextStyle("labelLarge"), { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={removeAccessibilityLabel}
            style={styles.close}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Path d="M6 6l12 12M18 6L6 18" stroke={fg} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: m3.shape.small,
    minHeight: 44,
  },
  hit: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
    minHeight: 44,
    paddingHorizontal: m3.spacing.s3,
  },
  chipOff: { borderWidth: 1, borderColor: m3.color.outline },
  chipOn: { backgroundColor: m3.color.secondaryContainer },
  icon: { justifyContent: "center" },
  close: { marginLeft: m3.spacing.s1, justifyContent: "center", alignItems: "center" },
});
