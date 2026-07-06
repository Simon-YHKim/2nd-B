/**
 * STEP 4 — <DeepSpaceDock /> : the bottom 5-tab dock from
 * design/prototype.dc.html (홈 ✦ · 담기 ✎ · 세컨비 💬 · 나 ◐ · IDEN 🪪). The
 * design used emoji placeholders; per DESIGN.md (emoji-as-decoration banned) the
 * glyphs are redrawn as small inline SVG marks tinted with deepSpace.* tokens.
 *
 * The active tab brightens (full opacity + cyan label); the rest recede. Labels
 * are injected by the caller (already locale-resolved) so no copy lives here.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

// Primary dock tabs (rev2 sb-data NAV): 별자리/담기/세컨비/위키/설정.
// "ops"/"lens"/"iden"/"account" remain valid values so existing 2nd-tier callsites
// (active="lens" etc.) keep type-checking; they are no longer primary dock tabs.
export type DeepSpaceTab = "home" | "capture" | "chat" | "ops" | "account" | "wiki" | "lens" | "iden" | "settings";

export interface DockItem {
  key: DeepSpaceTab;
  label: string;
  accessibilityLabel: string;
}

export function TabIcon({ tab, color, size = 18 }: { tab: DeepSpaceTab; color: string; size?: number }) {
  switch (tab) {
    case "home": // 별자리 — star_shine (rev2 sb-data NAV)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 3c.5 3.8 2.7 6 6.5 6.5-3.8.5-6 2.7-6.5 6.5-.5-3.8-2.7-6-6.5-6.5 3.8-.5 6-2.7 6.5-6.5Z" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case "capture": // 담기 — add_circle (rev2 sb-data NAV)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={8.4} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M12 8.2v7.6M8.2 12h7.6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      );
    case "chat": // 세컨비 — forum (rev2 sb-data NAV)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3 5h12v8H7l-4 3.2z" stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
          <Path d="M8 13.2V15h9l3 2.4V9.5h-2.5" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case "ops": // 비서 — recommendation/routine list
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 7h14M5 12h14M5 17h9" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
        </Svg>
      );
    case "wiki": // 위키 — inventory_2 (rev2 sb-data NAV)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3.5 7.5h17V20h-17z" stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
          <Path d="M3.5 7.5 5.5 4h13l2 3.5M12 7.5v4M9.5 11.5h5" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case "account": // 나 — person
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={8} r={3.5} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      );
    case "lens": // half-lit circle = 나
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M12 3a9 9 0 0 1 0 18z" fill={color} />
        </Svg>
      );
    case "iden": // id card
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3 6h18v12H3z" stroke={color} strokeWidth={2} fill="none" />
          <Circle cx={8.5} cy={11} r={2} fill={color} />
          <Path d="M13 9h5M13 13h5" stroke={color} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      );
    case "settings": // 설정 — tune (rev2 sb-data NAV, 2-track)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 7h9M17.5 7H20M4 17h2.5M11 17h9" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
          <Circle cx={15.5} cy={7} r={2.3} stroke={color} strokeWidth={2} fill="none" />
          <Circle cx={8.5} cy={17} r={2.3} stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      );
  }
}

export function DeepSpaceDock({
  active,
  items,
  onChange,
  bottomInset = 0,
}: {
  active: DeepSpaceTab;
  items: DockItem[];
  onChange: (tab: DeepSpaceTab) => void;
  bottomInset?: number;
}) {
  return (
    <View style={[styles.dock, { paddingBottom: 16 + bottomInset }]}>
      {items.map((item) => {
        const on = item.key === active;
        const color = on ? deepSpace.text : withAlpha(deepSpace.accentSoft, 0.55);
        return (
          <Pressable
            key={item.key}
            style={styles.tab}
            onPress={() => onChange(item.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={item.accessibilityLabel}
          >
            <View style={[styles.iconWrap, { opacity: on ? 1 : 0.5 }]}>
              <TabIcon tab={item.key} color={color} />
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const DOCK_HEIGHT = 64;

const styles = StyleSheet.create({
  dock: {
    flexDirection: "row",
    paddingTop: 11,
    paddingHorizontal: 16,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: withAlpha(deepSpace.accent, 0.12),
    backgroundColor: deepSpace.bgEdge,
  },
  tab: { flex: 1, alignItems: "center", gap: 3, minHeight: 44, justifyContent: "center" },
  iconWrap: { height: 18, justifyContent: "center" },
  label: { fontSize: 9, lineHeight: 13, fontFamily: fontFamilies.pixelKo },
});
