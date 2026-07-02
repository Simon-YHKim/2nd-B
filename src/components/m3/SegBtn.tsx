// SegBtn - Material 3 segmented button group (rev2 migration, P1b). Controlled:
// the parent owns `selected` and reacts to `onSelect(key)`. Stadium container
// with outline dividers, per the approved M3-track exception.
//
// LAYOUT NOTE (device QA 2026-07-02): on Fabric Android, layout/visual styles
// set on a Pressable inside this row silently failed to apply (segments
// collapsed to bare labels at the container's top-left). Each segment is
// therefore a styled VIEW that owns width/divider/selection visuals, with an
// inner Pressable that only handles the hit + a11y. Do not move the styles
// back onto the Pressable.
import type { ReactNode } from "react";
import {
  type DimensionValue,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from "react-native";

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
  const segWidth = `${100 / Math.max(1, segments.length)}%` as DimensionValue;
  return (
    <View style={[styles.group, style]} accessibilityRole={multiSelect ? undefined : "radiogroup"}>
      {segments.map((seg, i) => {
        const on = selected.includes(seg.key);
        const fg = on ? m3.color.onSecondaryContainer : m3.color.onSurface;
        return (
          <View
            key={seg.key}
            style={[styles.seg, { width: segWidth }, i > 0 && styles.divider, on && styles.segOn]}
          >
            <Pressable
              android_ripple={{ color: m3.color.secondaryContainer }}
              onPress={() => onSelect(seg.key)}
              accessibilityRole={multiSelect ? "checkbox" : "radio"}
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={seg.label}
              style={styles.hit}
            >
              {seg.icon ? <View style={styles.icon}>{seg.icon}</View> : null}
              <Text style={[m3TextStyle("labelLarge"), { color: fg }]} numberOfLines={1}>
                {seg.label}
              </Text>
            </Pressable>
          </View>
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
    // 24 = minHeight/2: Android mis-clips children when borderRadius exceeds
    // the view size under overflow:hidden (stadium silhouette preserved).
    borderRadius: 24,
    overflow: "hidden",
    minHeight: 48,
  },
  seg: {
    minHeight: 48,
  },
  hit: {
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
  icon: { justifyContent: "center" },
});
