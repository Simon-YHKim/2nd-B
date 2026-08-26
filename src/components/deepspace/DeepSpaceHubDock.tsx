import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/theme/tokens";
import { withAlpha } from "@/lib/theme/tokens";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
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

// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
const HUB_DOCK_GLYPH: Record<DeepSpaceHubTab, "add_circle" | "forum" | "target" | "task_alt"> = {
  capture: "add_circle",
  secondb: "forum",
  trend: "target",
  review: "task_alt",
};

function HubDockIcon({ tab, color }: { tab: DeepSpaceHubTab; color: string }) {
  return <PixelGlyph name={HUB_DOCK_GLYPH[tab]} color={color} size={18} />;
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
