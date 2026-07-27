import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Path } from "react-native-svg";

import { colors, spacing } from "@/theme/tokens";
import { withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export type DeepSpaceHubTab = "capture" | "secondb" | "trend" | "review";

interface DockItem {
  key: DeepSpaceHubTab;
}

const DOCK_ITEMS: DockItem[] = [
  { key: "capture" },
  { key: "secondb" },
  { key: "trend" },
  { key: "review" },
];

const DOCK_LABELS: Record<string, Record<DeepSpaceHubTab, string>> = {
  en: { capture: "Capture", secondb: "SecondB", trend: "Trends", review: "Review" },
  ko: { capture: "담기", secondb: "세컨비", trend: "트렌드", review: "점검" },
  es: { capture: "Capturar", secondb: "SecondB", trend: "Tendencias", review: "Revisar" },
  pt: { capture: "Capturar", secondb: "SecondB", trend: "Tendencias", review: "Revisar" },
  id: { capture: "Tangkap", secondb: "SecondB", trend: "Tren", review: "Tinjau" },
};

function dockLabelsFor(language: string | undefined): Record<DeepSpaceHubTab, string> {
  const base = language?.split("-")[0] ?? "en";
  return DOCK_LABELS[base] ?? DOCK_LABELS.en;
}

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
  const { i18n } = useTranslation();
  const labels = dockLabelsFor(i18n.language);

  return (
    <View style={styles.wrap}>
      {DOCK_ITEMS.map((item) => {
        const selected = item.key === active;
        const label = labels[item.key];
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            style={styles.item}
            android_ripple={{ color: withAlpha(colors.cyan, 0.12) }}
          >
            <View style={[styles.icon, selected ? styles.activeIcon : styles.inactiveIcon]}>
              <HubDockIcon tab={item.key} color={selected ? colors.cyanBright : colors.textLo} />
            </View>
            <Text style={[styles.label, selected ? styles.activeLabel : styles.inactiveLabel]}>{label}</Text>
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
