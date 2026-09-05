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
import { PixelGlyph } from "@/components/pixel/PixelGlyph";

import { m3 } from "@/lib/theme/m3";

import { m3TextStyle } from "./typeface";

export type MdChipKind = "assist" | "filter" | "input" | "suggestion";

export interface MdChipProps {
  kind?: MdChipKind;
  label: string;
  /** filter chips only - the toggled state. */
  selected?: boolean;
  disabled?: boolean;
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
  disabled = false,
  icon,
  onPress,
  onClose,
  accessibilityLabel,
  removeAccessibilityLabel,
  style,
}: MdChipProps) {
  const isFilter = kind === "filter";
  // checked only belongs on filter chips (role checkbox): leaking it onto
  // assist/suggestion buttons made TalkBack announce plain chips as untoggled
  // controls the user thinks they must toggle.
  const on = isFilter && selected;
  let fg: string = on ? m3.color.onSecondaryContainer : m3.color.onSurfaceVariant;
  if (disabled) {
    fg = on ? m3.disabled.onSecondaryContainer : m3.disabled.onSurface;
  }
  return (
    <View
      style={[
        styles.chip,
        on ? styles.chipOn : styles.chipOff,
        disabled && (on ? styles.chipOnDisabled : styles.chipOffDisabled),
        style,
      ]}
    >
      <Pressable
        android_ripple={disabled ? undefined : { color: m3.color.secondaryContainer }}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole={isFilter ? "checkbox" : "button"}
        accessibilityState={
          isFilter ? { selected, checked: selected, disabled } : { disabled }
        }
        accessibilityLabel={accessibilityLabel ?? label}
        style={styles.hit}
      >
        {/* M3 filter chip: selection swaps the leading slot for a check glyph
            (reference sb-data.jsx MdChip renders the same 18dp check when selected). */}
        {on ? (
          <View style={styles.icon}>
            <PixelGlyph name="check" color={fg} size={18} />
          </View>
        ) : icon ? (
          <View style={styles.icon}>{icon}</View>
        ) : null}
        <Text style={[m3TextStyle("labelLarge"), { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
        {onClose ? (
          <Pressable
            onPress={onClose}
            disabled={disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            accessibilityLabel={removeAccessibilityLabel}
            style={styles.close}
          >
            <PixelGlyph name="close" color={fg} size={16} />
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
    // This Pressable owns the semantic checkbox/button target. The outer
    // visual border does not count toward its DOM/TalkBack hit rectangle.
    minWidth: m3.minTouch,
    minHeight: 44,
    paddingHorizontal: m3.spacing.s3,
  },
  chipOff: { borderWidth: 1, borderColor: m3.color.outline },
  chipOn: { backgroundColor: m3.color.secondaryContainer },
  chipOffDisabled: { borderColor: m3.disabled.outline },
  chipOnDisabled: { backgroundColor: m3.disabled.secondaryContainer },
  icon: { justifyContent: "center" },
  close: { marginLeft: m3.spacing.s1, justifyContent: "center", alignItems: "center" },
});
