// MdNavBar - Material 3 bottom navigation bar (rev2 migration, P1b).
// PRESENTATIONAL ONLY: a controlled `active` + `items[]` + `onSelect(key)` +
// `bottomInset`, mirroring the current DeepSpaceDock contract so P2 can drop it
// in where the dock sits today (router wiring stays in the SCREEN, not here).
// The active state is cued by a pill indicator (not colour alone) + label
// weight + accessibilityState, keeping the tab-bar-active-cue lineage.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from "react-native";

import { m3 } from "@/lib/theme/m3";

import { m3TextStyle } from "./typeface";

export interface MdNavItem {
  key: string;
  label: string;
  accessibilityLabel?: string;
  /** icon renderer - receives the resolved token colour so active/inactive tint. */
  icon: (color: string) => ReactNode;
  /** center-emphasised slot (e.g. 세컨비) - uses the tertiary (violet) indicator. */
  center?: boolean;
}

export interface MdNavBarProps {
  items: MdNavItem[];
  active: string;
  onSelect: (key: string) => void;
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
}

export function MdNavBar({ items, active, onSelect, bottomInset = 0, style }: MdNavBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: m3.spacing.s2 + bottomInset }, style]}>
      {items.map((item) => {
        const on = item.key === active;
        const pillBg = item.center ? m3.color.tertiaryContainer : m3.color.secondaryContainer;
        const activeFg = item.center ? m3.color.onTertiaryContainer : m3.color.onSecondaryContainer;
        const iconColor = on ? activeFg : m3.color.onSurfaceVariant;
        const labelColor = on ? m3.color.onSurface : m3.color.onSurfaceVariant;
        // LAYOUT NOTE (#680): Fabric Android drops function-form Pressable
        // styles (the flex:1 was lost, packing all five tabs to the left), so
        // the tab layout lives on a View and the Pressable inside is a plain
        // touch surface with an android_ripple state layer (#698 idiom).
        return (
          <View key={item.key} style={styles.tab}>
            <Pressable
              onPress={() => onSelect(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.accessibilityLabel ?? item.label}
              android_ripple={{ color: m3.color.secondaryContainer, borderless: true }}
              style={styles.press}
            >
              <View style={[styles.indicator, item.center && styles.indicatorCenter, on && { backgroundColor: pillBg }]}>
                {item.icon(iconColor)}
              </View>
              <Text style={[m3TextStyle("labelMedium"), styles.label, { color: labelColor }]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: m3.color.surfaceContainer,
    paddingTop: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s2,
  },
  tab: { flex: 1, minHeight: 48, justifyContent: "center" },
  press: { alignItems: "center", gap: m3.spacing.s1, justifyContent: "center", minHeight: 48 },
  indicator: {
    minWidth: 56,
    height: 32,
    borderRadius: m3.shape.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s4,
  },
  indicatorCenter: { minWidth: 64, height: 36 },
  label: { textAlign: "center" },
});
