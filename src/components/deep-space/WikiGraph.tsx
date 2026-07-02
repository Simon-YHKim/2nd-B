/**
 * Wiki node graph (rev2 P4b) — the force-directed view of the personal wiki.
 * Pure-layout (graph-layout.ts, deterministic) rendered as SVG on the deep-space
 * sky: node size = degree, color = page kind (concept cyan / entity violet /
 * source mint), labels only on the biggest hubs + the selection (density rule).
 * Zoom = +/- buttons around the selected node (no gesture dependency); tapping
 * a node selects it, tapping it again opens the page (progressive disclosure).
 */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import type { WikiPageKind } from "@/lib/wiki/types";
import { layoutWikiGraph, type GraphEdge } from "@/lib/wiki/graph-layout";

const CANVAS = 1000;
const LABELED_HUBS = 8;
const ZOOMS = [1, 1.6, 2.6] as const;

export interface WikiGraphPage {
  id: string;
  title: string;
  kind: WikiPageKind;
}

const KIND_COLOR: Record<WikiPageKind, string> = {
  concept: m3.accent.starCore,
  entity: m3.accent.polaris,
  source: m3.accent.moodPositive,
};

export function WikiGraph({
  pages,
  edges,
  isKo,
  onOpenPage,
}: {
  pages: WikiGraphPage[];
  edges: GraphEdge[];
  isKo: boolean;
  onOpenPage: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(0);

  const layout = useMemo(
    () => layoutWikiGraph(pages.map((p) => p.id), edges),
    [pages, edges],
  );
  const byId = useMemo(() => new Map(layout.map((n) => [n.id, n])), [layout]);
  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const hubIds = useMemo(
    () =>
      new Set(
        [...layout]
          .sort((a, b) => b.degree - a.degree)
          .slice(0, LABELED_HUBS)
          .filter((n) => n.degree > 0)
          .map((n) => n.id),
      ),
    [layout],
  );

  const zoom = ZOOMS[zoomIdx];
  const focus = selectedId ? byId.get(selectedId) : undefined;
  const cx = (focus?.x ?? 0.5) * CANVAS;
  const cy = (focus?.y ?? 0.5) * CANVAS;
  const span = CANVAS / zoom;
  const vbX = Math.min(Math.max(cx - span / 2, 0), CANVAS - span);
  const vbY = Math.min(Math.max(cy - span / 2, 0), CANVAS - span);

  const selectNode = (id: string) => {
    if (selectedId === id) onOpenPage(id);
    else setSelectedId(id);
  };

  const selected = selectedId ? pageById.get(selectedId) : undefined;

  return (
    <View style={styles.root}>
      <View style={styles.canvasWrap}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`${vbX} ${vbY} ${span} ${span}`}
          accessibilityLabel={isKo ? "위키 노드 그래프" : "Wiki node graph"}
        >
          {edges.map((e, i) => {
            const a = byId.get(e.from_page);
            const b = byId.get(e.to_page);
            if (!a || !b) return null;
            return (
              <Line
                key={i}
                x1={a.x * CANVAS}
                y1={a.y * CANVAS}
                x2={b.x * CANVAS}
                y2={b.y * CANVAS}
                stroke={withAlpha(m3.accent.starDim, 0.3)}
                strokeWidth={1.2 / zoom + 0.6}
              />
            );
          })}
          {layout.map((node) => {
            const page = pageById.get(node.id);
            if (!page) return null;
            const r = (7 + Math.min(13, node.degree * 2.4)) / Math.sqrt(zoom);
            const isSelected = node.id === selectedId;
            return (
              <G key={node.id}>
                {isSelected ? (
                  <Circle
                    cx={node.x * CANVAS}
                    cy={node.y * CANVAS}
                    r={r + 7}
                    fill="none"
                    stroke={withAlpha(m3.accent.star, 0.7)}
                    strokeWidth={2}
                  />
                ) : null}
                <Circle
                  cx={node.x * CANVAS}
                  cy={node.y * CANVAS}
                  r={r}
                  fill={withAlpha(KIND_COLOR[page.kind], node.degree > 0 ? 0.9 : 0.45)}
                  onPress={() => selectNode(node.id)}
                />
                {hubIds.has(node.id) || isSelected ? (
                  <SvgText
                    x={node.x * CANVAS}
                    y={node.y * CANVAS - r - 6}
                    fill={withAlpha(m3.accent.skyTextHi, 0.85)}
                    fontSize={13 / Math.sqrt(zoom) + 5}
                    textAnchor="middle"
                  >
                    {page.title.length > 14 ? `${page.title.slice(0, 13)}…` : page.title}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={() => setZoomIdx((z) => Math.max(0, z - 1))}
          hitSlop={10}
          style={styles.zoomBtn}
          accessibilityRole="button"
          accessibilityLabel={isKo ? "축소" : "Zoom out"}
        >
          <Text style={styles.zoomBtnText}>-</Text>
        </Pressable>
        <Pressable
          onPress={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))}
          hitSlop={10}
          style={styles.zoomBtn}
          accessibilityRole="button"
          accessibilityLabel={isKo ? "확대" : "Zoom in"}
        >
          <Text style={styles.zoomBtnText}>+</Text>
        </Pressable>
        <Text variant="caption" color="textSubtle" style={styles.hint} numberOfLines={1}>
          {selected
            ? isKo
              ? `${selected.title} · 한 번 더 누르면 열려요`
              : `${selected.title} · tap again to open`
            : isKo
              ? "노드를 누르면 선택, 한 번 더 누르면 열려요"
              : "Tap to select a node, tap again to open"}
        </Text>
      </View>

      <View style={styles.legend}>
        {(Object.keys(KIND_COLOR) as WikiPageKind[]).map((kind) => (
          <View key={kind} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: KIND_COLOR[kind] }]} />
            <Text variant="caption" color="textMuted">
              {isKo
                ? kind === "concept" ? "개념" : kind === "entity" ? "존재" : "원본"
                : kind}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  canvasWrap: {
    aspectRatio: 1,
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accentDim, 0.22),
    backgroundColor: withAlpha(deepSpace.bgMid, 0.35),
    overflow: "hidden",
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 8 },
  zoomBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accentDim, 0.4),
    alignItems: "center",
    justifyContent: "center",
  },
  zoomBtnText: { color: deepSpace.textHi, fontSize: 18, lineHeight: 22 },
  hint: { flex: 1, minWidth: 0 },
  legend: { flexDirection: "row", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
