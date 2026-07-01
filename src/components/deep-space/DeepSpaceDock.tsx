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

// Primary dock tabs (SCREEN_TREE_SPEC §0.1): 담기/알아가기/비서/나 + 중앙 세컨비.
// "lens"/"iden" remain valid values so existing 2nd-tier callsites (active="lens")
// keep type-checking; they are no longer rendered as primary dock tabs.
export type DeepSpaceTab = "home" | "capture" | "chat" | "ops" | "account" | "wiki" | "lens" | "iden";

export interface DockItem {
  key: DeepSpaceTab;
  label: string;
  accessibilityLabel: string;
}

export function TabIcon({ tab, color }: { tab: DeepSpaceTab; color: string }) {
  switch (tab) {
    case "home": // four-point star
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={color} />
        </Svg>
      );
    case "capture": // pencil
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M4 20l4-1L19 8l-3-3L5 16zM17 4l3 3" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case "chat": // speech bubble
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M4 5h16v11H9l-4 4V5z" stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
        </Svg>
      );
    case "ops": // 비서 — recommendation/routine list
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M5 7h14M5 12h14M5 17h9" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
        </Svg>
      );
    case "wiki": // 위키 — open book / knowledge
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M12 6C10 4.6 6.5 4.6 4 5.2v13c2.5-.6 6-.6 8 1 2-1.6 5.5-1.6 8-1v-13c-2.5-.6-6-.6-8 1zM12 6v13"
            stroke={color}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      );
    case "account": // 나 — person
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Circle cx={12} cy={8} r={3.5} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      );
    case "lens": // half-lit circle = 나
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M12 3a9 9 0 0 1 0 18z" fill={color} />
        </Svg>
      );
    case "iden": // id card
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M3 6h18v12H3z" stroke={color} strokeWidth={2} fill="none" />
          <Circle cx={8.5} cy={11} r={2} fill={color} />
          <Path d="M13 9h5M13 13h5" stroke={color} strokeWidth={2} strokeLinecap="round" />
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
