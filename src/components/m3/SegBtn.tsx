// SegBtn - Material 3 segmented button group (rev2 migration, P1b). Controlled:
// the parent owns `selected` and reacts to `onSelect(key)`. Stadium container
// (m3.shape.full) with outline dividers, per the approved M3-track exception.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from "react-native";

import { m3 } from "@/lib/theme/m3";

import { m3TextStyle } from "./typeface";

export interface SegBtnSegment {
  key: string;
  label: string;
  icon?: ReactNode;
}

export interface SegBtnProps {
  segments: SegBtnSegment[];
  /** Currently-selected segment keys (single-element for single-select). */
  selected: string[];
  onSelect: (key: string) => void;
  multiSelect?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SegBtn({ segments, selected, onSelect, multiSelect = false, style }: SegBtnProps) {
  return (
    <View style={[styles.group, style]} accessibilityRole={multiSelect ? undefined : "radiogroup"}>
      {segments.map((seg, i) => {
        const on = selected.includes(seg.key);
        const fg = on ? m3.color.onSecondaryContainer : m3.color.onSurface;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onSelect(seg.key)}
            accessibilityRole={multiSelect ? "checkbox" : "radio"}
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={seg.label}
            style={({ pressed }) => [styles.seg, i > 0 && styles.divider, on && styles.segOn, pressed && styles.pressed]}
          >
            {seg.icon ? <View style={styles.icon}>{seg.icon}</View> : null}
            <Text style={[m3TextStyle("labelLarge"), { color: fg }]} numberOfLines={1}>
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: m3.color.outline,
    borderRadius: m3.shape.full,
    overflow: "hidden",
    minHeight: 48,
  },
  seg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s3,
    minHeight: 48,
  },
  divider: { borderLeftWidth: 1, borderLeftColor: m3.color.outline },
  segOn: { backgroundColor: m3.color.secondaryContainer },
  pressed: { opacity: 0.85 },
  icon: { justifyContent: "center" },
});
