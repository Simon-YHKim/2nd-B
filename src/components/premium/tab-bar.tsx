// Premium bottom tab bar (A-to-Z premium pass — bottom navigator, enabled
// per user directive 2026-05-29; supersedes the earlier "no bottom nav"
// rule). Five primary village destinations on a glassy dark bar with a mint
// top-glow. Shows only on the primary routes; deeper screens keep the
// top-left BackArrow. Pixel-style SVG glyphs (no emoji), mint when active.

import { StyleSheet, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, router, type Href } from "expo-router";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { cosmic, spacing } from "@/lib/theme/tokens";

type TabId = "graph" | "explore" | "records" | "store" | "profile";

interface Tab {
  id: TabId;
  href: Href;
  ko: string;
  en: string;
}

const TABS: Tab[] = [
  { id: "graph", href: "/", ko: "그래프", en: "Graph" },
  { id: "explore", href: "/core-brain", ko: "탐험", en: "Explore" },
  { id: "records", href: "/records", ko: "기록", en: "Records" },
  { id: "store", href: "/wiki", ko: "보관소", en: "Store" },
  { id: "profile", href: "/profile", ko: "프로필", en: "Profile" },
];

// Routes the bar appears on (its own destinations).
const TAB_PATHS = new Set<string>(["/", "/core-brain", "/records", "/wiki", "/profile"]);

function TabIcon({ id, color }: { id: TabId; color: string }) {
  const sw = 1.8;
  switch (id) {
    case "graph":
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Line x1="6" y1="6" x2="11" y2="12" stroke={color} strokeWidth={sw} />
          <Line x1="16" y1="6" x2="11" y2="12" stroke={color} strokeWidth={sw} />
          <Line x1="11" y1="12" x2="8" y2="17" stroke={color} strokeWidth={sw} />
          <Circle cx="11" cy="12" r="2.6" fill={color} />
          <Circle cx="6" cy="6" r="1.8" fill={color} />
          <Circle cx="16" cy="6" r="1.8" fill={color} />
          <Circle cx="8" cy="17" r="1.6" fill={color} />
        </Svg>
      );
    case "explore":
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Circle cx="11" cy="11" r="4" fill={color} />
          <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={sw} fill="none" opacity={0.7} />
        </Svg>
      );
    case "records":
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Rect x="5" y="4" width="12" height="14" rx="2" stroke={color} strokeWidth={sw} fill="none" />
          <Line x1="8" y1="8" x2="14" y2="8" stroke={color} strokeWidth={sw} />
          <Line x1="8" y1="11" x2="14" y2="11" stroke={color} strokeWidth={sw} />
          <Line x1="8" y1="14" x2="12" y2="14" stroke={color} strokeWidth={sw} />
        </Svg>
      );
    case "store":
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Path d="M4 8 L11 4 L18 8 L18 16 L11 19 L4 16 Z" stroke={color} strokeWidth={sw} fill="none" />
          <Line x1="4" y1="8" x2="11" y2="11.5" stroke={color} strokeWidth={sw} />
          <Line x1="18" y1="8" x2="11" y2="11.5" stroke={color} strokeWidth={sw} />
          <Line x1="11" y1="11.5" x2="11" y2="19" stroke={color} strokeWidth={sw} />
        </Svg>
      );
    case "profile":
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Circle cx="11" cy="8" r="3.2" stroke={color} strokeWidth={sw} fill="none" />
          <Path d="M5 18 C5 13.5 17 13.5 17 18" stroke={color} strokeWidth={sw} fill="none" />
        </Svg>
      );
  }
}

/** Height of the bar's content (excludes the safe-area inset). */
export const TAB_BAR_HEIGHT = 58;

export function PremiumTabBar({ locale = "ko" }: { locale?: "en" | "ko" }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (!TAB_PATHS.has(pathname)) return null;
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, height: TAB_BAR_HEIGHT + insets.bottom }]} pointerEvents="box-none">
      <View style={styles.row}>
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          const color = active ? cosmic.signalMint : cosmic.mistGray;
          return (
            <Pressable
              key={tab.id}
              onPress={() => { if (!active) router.replace(tab.href); }}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={locale === "ko" ? tab.ko : tab.en}
              hitSlop={6}
            >
              <TabIcon id={tab.id} color={color} />
              <Text variant="subtle" style={[styles.label, { color }]}>{locale === "ko" ? tab.ko : tab.en}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(9,13,30,0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(114,242,199,0.22)",
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -2 },
  },
  row: { flexDirection: "row", height: TAB_BAR_HEIGHT, alignItems: "center" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingTop: spacing.xs },
  label: { fontSize: 10, letterSpacing: 0.3 },
});
