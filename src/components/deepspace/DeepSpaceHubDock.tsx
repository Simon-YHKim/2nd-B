import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { colors, spacing } from "@/theme/tokens";
import { withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export type DeepSpaceHubTab = "capture" | "secondb" | "trend" | "review";

interface DockItem {
  key: DeepSpaceHubTab;
  label: string;
  accessibilityLabel: string;
}

const DOCK_ITEMS: DockItem[] = [
  { key: "capture", label: "담기", accessibilityLabel: "담기 탭" },
  { key: "secondb", label: "세컨비", accessibilityLabel: "세컨비 탭" },
  { key: "trend", label: "트렌드", accessibilityLabel: "트렌드 탭" },
  { key: "review", label: "점검", accessibilityLabel: "점검 탭" },
];

function HubDockIcon({ tab, color }: { tab: DeepSpaceHubTab; color: string }) {
  switch (tab) {
    case "capture":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M12 8v8M8 12h8" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
        </Svg>
      );
    case "secondb":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M4 6h12v8H8l-4 3z" stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
          <Path d="M9 14.5V16h8l3 2.4V10h-2.4" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case "trend":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill={color} opacity={0.35} />
        </Svg>
      );
    case "review":
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={2} fill="none" />
          <Path d="m8 12.3 2.6 2.6L16.5 9" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
  }
}

interface DeepSpaceHubDockProps {
  active: DeepSpaceHubTab;
  onChange: (tab: DeepSpaceHubTab) => void;
}

export function DeepSpaceHubDock({ active, onChange }: DeepSpaceHubDockProps) {
  return (
    <View style={styles.wrap}>
      {DOCK_ITEMS.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.accessibilityLabel}
            onPress={() => onChange(item.key)}
            style={styles.item}
            android_ripple={{ color: withAlpha(colors.cyan, 0.12) }}
          >
            <View style={[styles.icon, selected ? styles.activeIcon : styles.inactiveIcon]}>
              <HubDockIcon tab={item.key} color={selected ? colors.cyanBright : colors.textLo} />
            </View>
            <Text style={[styles.label, selected ? styles.activeLabel : styles.inactiveLabel]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 16,
    backgroundColor: colors.bgDeep,
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
  },
  item: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: spacing.xs,
  },

  icon: {
    height: 20,
    justifyContent: "center",
  },
  activeIcon: {
    opacity: 1,
  },
  inactiveIcon: {
    opacity: 0.4,
  },
  label: {
    fontFamily: fontFamilies.pixelKo,
    fontSize: 10,
    lineHeight: 13,
  },
  activeLabel: {
    color: colors.cyanBright,
  },
  inactiveLabel: {
    color: colors.textLo,
  },
});
