// Premium bottom tab bar (A-to-Z premium pass — bottom navigator, enabled
// per user directive 2026-05-29; supersedes the earlier "no bottom nav"
// rule). Four primary village destinations on a layered dark bar with a mint
// top-glow. Shows only on the primary routes; deeper screens keep the
// top-left BackArrow. Pixel-style SVG glyphs (no emoji), mint when active.

import { StyleSheet, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, router, type Href } from "expo-router";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { spacing, typography } from "@/lib/theme/tokens";
import { PRIMARY_TAB_PATHS } from "@/lib/nav/tabs";
import { fontFamilies } from "@/theme/typography";

// Menu restructure Phase 3 (2026-05-31): the four tabs are now the VISION
// 3-axis IA - 그래프 / 담기 / 세컨비 / 나. The old explore(/core-brain),
// records(/records) and store(/wiki) tabs were removed: core-brain folds into
// the 나 hub (Phase 5), wiki + records are reached through the graph villages
// (Phase 4 routes a village to its records domain filter). 공상(divergent) is
// a mode inside 세컨비, not its own tab.
type TabId = "graph" | "capture" | "secondb" | "profile";

interface Tab {
  id: TabId;
  href: Href;
  ko: string;
  en: string;
}

const TABS: Tab[] = [
  { id: "graph", href: "/", ko: "그래프", en: "Graph" },
  { id: "capture", href: "/capture", ko: "담기", en: "Capture" },
  { id: "secondb", href: "/secondb", ko: "세컨비", en: "SecondB" },
  { id: "profile", href: "/profile", ko: "나", en: "Me" },
];

// Routes the bar appears on (its own destinations). Shared with BackArrow via
// PRIMARY_TAB_PATHS so the bar's show-list and the arrow's hide-list stay in
// lockstep. TABS above must list these same hrefs (labels/icons live here).
const TAB_PATHS = new Set<string>(PRIMARY_TAB_PATHS);

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
    case "capture":
      // 담기 — drop a piece into a tray (down arrow into an open box).
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Line x1="11" y1="3" x2="11" y2="12" stroke={color} strokeWidth={sw} />
          <Path
            d="M7 9 L11 13 L15 9"
            stroke={color}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M4 14 L4 18 L18 18 L18 14"
            stroke={color}
            strokeWidth={sw}
            fill="none"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "secondb":
      // 세컨비 — a chat speech bubble with two dots.
      return (
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Path
            d="M4 5 L18 5 L18 13 L9 13 L6 16 L6 13 L4 13 Z"
            stroke={color}
            strokeWidth={sw}
            fill="none"
            strokeLinejoin="round"
          />
          <Circle cx="9" cy="9" r="1.1" fill={color} />
          <Circle cx="13" cy="9" r="1.1" fill={color} />
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
export const TAB_BAR_HEIGHT = 62;

export function PremiumTabBar({ locale = "ko" }: { locale?: "en" | "ko" }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (!TAB_PATHS.has(pathname)) return null;
  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom, height: TAB_BAR_HEIGHT + insets.bottom }]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          const color = active ? gameboy.screen : gameboy.ink;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                if (!active) router.replace(tab.href);
              }}
              style={[styles.tab, active ? styles.tabActive : null]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={locale === "ko" ? tab.ko : tab.en}
              hitSlop={14}
            >
              {active ? <View style={styles.activeCue} /> : null}
              <TabIcon id={tab.id} color={color} />
              <Text
                variant="subtle"
                style={[styles.label, active ? styles.labelActive : null, { color }]}
              >
                {locale === "ko" ? tab.ko : tab.en}
              </Text>
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
    backgroundColor: gameboy.screen,
    borderTopWidth: gameboy.borderWidth,
    borderTopColor: gameboy.border,
    ...pixelShadowStyle(),
  },
  row: {
    flexDirection: "row",
    height: TAB_BAR_HEIGHT,
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingTop: spacing.xs,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    backgroundColor: gameboy.screen,
    position: "relative",
  },
  tabActive: {
    backgroundColor: gameboy.ink,
    borderColor: gameboy.ink,
  },
  activeCue: {
    position: "absolute",
    top: 4,
    alignSelf: "center",
    width: 28,
    height: gameboy.borderWidth,
    borderRadius: gameboy.borderWidth,
    backgroundColor: gameboy.power,
  },
  label: {
    fontFamily: fontFamilies.pixelKo,
    fontSize: typography.sizes.sm,
    lineHeight: 16,
    letterSpacing: 0,
    fontWeight: "600",
  },
  labelActive: { fontWeight: "800" },
});
