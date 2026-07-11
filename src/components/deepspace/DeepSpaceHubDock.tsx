import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/theme/tokens";
import { withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export type DeepSpaceHubTab = "capture" | "secondb" | "trend" | "review";

interface DockItem {
  key: DeepSpaceHubTab;
  icon: string;
  label: string;
}

const DOCK_ITEMS: DockItem[] = [
  { key: "capture", icon: "✎", label: "담기" },
  { key: "secondb", icon: "💬", label: "세컨비" },
  { key: "trend", icon: "◒", label: "트렌드" },
  { key: "review", icon: "✓", label: "점검" },
];

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
            onPress={() => onChange(item.key)}
            style={styles.item}
            android_ripple={{ color: withAlpha(colors.cyan, 0.12) }}
          >
            <Text style={[styles.icon, selected ? styles.activeIcon : styles.inactiveIcon]}>{item.icon}</Text>
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
    fontSize: 16,
    lineHeight: 20,
  },
  activeIcon: {
    opacity: 1,
  },
  inactiveIcon: {
    opacity: 0.4,
  },
  label: {
    fontFamily: fontFamilies.pixelKo,
    fontSize: 9,
    lineHeight: 13,
  },
  activeLabel: {
    color: colors.cyanBright,
  },
  inactiveLabel: {
    color: colors.textLo,
  },
});
