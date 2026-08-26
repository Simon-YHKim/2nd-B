/**
 * STEP 4 — <DeepSpaceDock /> : the bottom 5-tab dock from
 * legacy/design/prototype.dc.html (홈 ✦ · 담기 ✎ · 세컨비 💬 · 나 ◐ · IDEN 🪪). The
 * design used emoji placeholders; per DESIGN.md (emoji-as-decoration banned) the
 * glyphs are drawn as **integer rects** (PIXEL-CLAY rule 1) tinted with the
 * caller's color. The coordinates live in components/pixel/pixel-glyphs.ts.
 *
 * The active tab brightens (full opacity + cyan label); the rest recede. Labels
 * are injected by the caller (already locale-resolved) so no copy lives here.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { deepSpace, flattenAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { PIXEL_GLYPHS, GLYPH_BOX } from "@/components/pixel/pixel-glyphs";
import { fontFamilies } from "@/theme/typography";

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `m3.accent.stageFloor` — 독은 무대 바닥 위에 얹힌다.
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const dockAlpha = (c: string, a: number): string => flattenAlpha(c, a, m3.accent.stageFloor);

// Primary dock tabs (rev2 sb-data NAV): 별자리/담기/세컨비/위키/설정.
// "ops"/"lens"/"iden"/"account" remain valid values so existing 2nd-tier callsites
// (active="lens" etc.) keep type-checking; they are no longer primary dock tabs.
export type DeepSpaceTab = "home" | "capture" | "chat" | "ops" | "account" | "wiki" | "lens" | "iden" | "settings";

export interface DockItem {
  key: DeepSpaceTab;
  label: string;
  accessibilityLabel: string;
}

/**
 * 탭 아이콘 — **정수 rect 만**(PIXEL-CLAY 절대 규칙 1).
 *
 * 좌표는 여기 없다. `components/pixel/pixel-glyphs.ts` 가 정본이고, 문자열
 * 마크업으로 그리는 레지스트리(`shell/SbIcon`)도 같은 배열을 읽는다 — 전에는
 * 같은 아이콘이 JSX 와 문자열 두 벌로 있어서 한쪽만 고쳐지곤 했다.
 *
 * ⚠ `size` 는 24 의 정수배(24 · 48)일 때 셀이 기기 픽셀에 정확히 떨어진다.
 * 다른 값이면 SVG 가 알아서 스케일하지만 경계가 흐려질 수 있다. 지금 살아 있는
 * 호출부(DeepSpaceScreen:115)는 24 를 넘긴다.
 */
export function TabIcon({ tab, color, size = 18 }: { tab: DeepSpaceTab; color: string; size?: number }) {
  const rects = PIXEL_GLYPHS[tab];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`}>
      {/* 축에 정렬된 정수 rect 라 안티에일리어싱이 생길 여지가 없다 —
          crispEdges 를 따로 켤 필요가 없고, react-native-svg 의 Svg 는
          그 prop 을 받지도 않는다(문자열 마크업 쪽은 켜 둔다). */}
      {rects.map((g, i) => (
        <Rect key={i} x={g.x} y={g.y} width={g.w} height={g.h} fill={color} />
      ))}
    </Svg>
  );
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
        const color = on ? deepSpace.text : dockAlpha(deepSpace.accentSoft, 0.55);
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
    borderTopColor: dockAlpha(deepSpace.accent, 0.12),
    backgroundColor: deepSpace.bgEdge,
  },
  tab: { flex: 1, alignItems: "center", gap: 3, minHeight: 44, justifyContent: "center" },
  iconWrap: { height: 18, justifyContent: "center" },
  label: { fontSize: 12, lineHeight: 14, fontFamily: fontFamilies.pixelKo },
});
