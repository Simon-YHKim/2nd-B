// MdTopAppBar - M3 small top app bar for windowed sub-screens (rev2 sb-app
// TopAppBar 1:1): 56dp row, back icon button, title-large, optional trailing
// action slot. Presentational; the caller owns navigation (onBack).
//
// LAYOUT NOTE (PR 680): Fabric Android drops function-form Pressable styles,
// so the 40dp chip layout lives on a View and the Pressable inside is a bare
// touch surface with an android_ripple state layer.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { m3 } from "@/lib/theme/m3";

import { m3TextStyle } from "./typeface";

export function MdTopAppBar({
  title,
  onBack,
  action,
  backAccessibilityLabel,
}: {
  title: string;
  onBack: () => void;
  action?: ReactNode;
  backAccessibilityLabel?: string;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.backChip}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel ?? title}
          android_ripple={{ color: m3.color.secondaryContainer, borderless: true }}
          hitSlop={8}
          style={styles.backPress}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path
              d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2z"
              fill={m3.color.onSurface}
            />
          </Svg>
        </Pressable>
      </View>
      <Text style={[m3TextStyle("titleLarge"), styles.title]} numberOfLines={1}>
        {title}
      </Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 4,
    paddingRight: 8,
  },
  backChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  backPress: { alignItems: "center", justifyContent: "center", width: 40, height: 40 },
  title: { flexShrink: 1, color: m3.color.onSurface },
  action: { marginLeft: "auto", flexDirection: "row", alignItems: "center", paddingRight: 4 },
});
