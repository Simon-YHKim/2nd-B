/**
 * Records tag-graph (D-27 Phase 1b) — the deep-space view of the user's own
 * records as the canonical node-set (NOT wiki_pages). Renders buildRecordsGraph:
 * 북극성(polaris) at center, the domain stars on a ring, each domain's records
 * fanned around it, and DASHED cross-domain tag-links (records in different
 * domains that share a user tag) as the visible "connection" surface. Pure tag
 * overlap, no LLM/embeddings ($0, works from record #2). Tapping a record selects
 * it; tapping again opens it. Mirrors WikiGraph's SVG/zoom conventions.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import type { RecordsGraph as RecordsGraphData } from "@/lib/records/records-graph";
import { DOMAIN_COLOR, layoutRecordsGraph } from "@/lib/records/records-graph-layout";

const CANVAS = 1000;
const ZOOMS = [1, 1.6, 2.6] as const;
const POLARIS_COLOR = m3.accent.polaris;

export function RecordsGraph({
  graph,
  onOpenRecord,
}: {
  graph: RecordsGraphData;
  onOpenRecord: (id: string) => void;
}) {
  const { t } = useTranslation("deepspace");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(0);

  const pos = useMemo(() => layoutRecordsGraph(graph), [graph]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const domainsPresent = useMemo(
    () => graph.nodes.filter((n) => n.kind === "domain"),
    [graph],
  );

  const zoom = ZOOMS[zoomIdx];
  const focus = selectedId ? pos[selectedId] : undefined;
  const cx = (focus?.x ?? 0.5) * CANVAS;
  const cy = (focus?.y ?? 0.5) * CANVAS;
  const span = CANVAS / zoom;
  const vbX = Math.min(Math.max(cx - span / 2, 0), CANVAS - span);
  const vbY = Math.min(Math.max(cy - span / 2, 0), CANVAS - span);

  const selectNode = (id: string, openable: boolean) => {
    if (selectedId === id && openable) onOpenRecord(id);
    else setSelectedId(id);
  };

  const selected = selectedId ? nodeById.get(selectedId) : undefined;

  const colorFor = (domain: string | undefined): string =>
    (domain && DOMAIN_COLOR[domain as keyof typeof DOMAIN_COLOR]) || m3.accent.starDim;

  return (
    <View style={styles.root}>
      <View style={styles.canvasWrap}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`${vbX} ${vbY} ${span} ${span}`}
          accessibilityLabel={t("deepspace:recordsGraph.a11yGraph")}
        >
          {/* edges — draw links (dashed) under nodes; spine/branch faint */}
          {graph.edges.map((e, i) => {
            const a = pos[e.a];
            const b = pos[e.b];
            if (!a || !b) return null;
            const link = e.kind === "link";
            const dom = link ? undefined : nodeById.get(e.b)?.domain ?? nodeById.get(e.a)?.domain;
            return (
              <Line
                key={i}
                x1={a.x * CANVAS}
                y1={a.y * CANVAS}
                x2={b.x * CANVAS}
                y2={b.y * CANVAS}
                stroke={
                  link
                    ? withAlpha(m3.accent.star, 0.42)
                    : e.kind === "branch"
                      ? withAlpha(colorFor(dom), 0.28)
                      : withAlpha(m3.accent.starDim, 0.22)
                }
                strokeWidth={(link ? 1.4 : 1) / zoom + 0.5}
                strokeDasharray={link ? `${5 / zoom + 2},${4 / zoom + 2}` : undefined}
              />
            );
          })}

          {graph.nodes.map((node) => {
            const p = pos[node.id];
            if (!p) return null;
            const isPolaris = node.kind === "polaris";
            const isDomain = node.kind === "domain";
            const isSelected = node.id === selectedId;
            const r = (isPolaris ? 13 : isDomain ? 9 : 5.5) / Math.sqrt(zoom);
            const fill = isPolaris ? POLARIS_COLOR : colorFor(node.domain);
            const alpha = isPolaris ? 1 : isDomain ? 0.95 : 0.8;
            const showLabel = isPolaris || isDomain || isSelected;
            return (
              <G key={node.id}>
                {isSelected ? (
                  <Circle cx={p.x * CANVAS} cy={p.y * CANVAS} r={r + 6} fill="none" stroke={withAlpha(m3.accent.star, 0.7)} strokeWidth={2} />
                ) : null}
                <Circle
                  cx={p.x * CANVAS}
                  cy={p.y * CANVAS}
                  r={r}
                  fill={withAlpha(fill, alpha)}
                  onPress={() => selectNode(node.id, node.kind === "record")}
                />
                {showLabel ? (
                  <SvgText
                    x={p.x * CANVAS}
                    y={p.y * CANVAS - r - 5}
                    fill={withAlpha(m3.accent.skyTextHi, isDomain || isPolaris ? 0.9 : 0.8)}
                    fontSize={(isPolaris || isDomain ? 15 : 12) / Math.sqrt(zoom) + 4}
                    fontWeight={isDomain || isPolaris ? "700" : "400"}
                    textAnchor="middle"
                  >
                    {node.label.length > 14 ? `${node.label.slice(0, 13)}…` : node.label}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => setZoomIdx((z) => Math.max(0, z - 1))} hitSlop={10} style={styles.zoomBtn} accessibilityRole="button" accessibilityLabel={t("deepspace:recordsGraph.a11yZoomOut")}>
          <Text style={styles.zoomBtnText}>-</Text>
        </Pressable>
        <Pressable onPress={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))} hitSlop={10} style={styles.zoomBtn} accessibilityRole="button" accessibilityLabel={t("deepspace:recordsGraph.a11yZoomIn")}>
          <Text style={styles.zoomBtnText}>+</Text>
        </Pressable>
        <Text variant="caption" color="textSubtle" style={styles.hint} numberOfLines={1}>
          {selected && selected.kind === "record"
            ? t("deepspace:recordsGraph.hintSelected", { label: selected.label })
            : t("deepspace:recordsGraph.hintDefault")}
        </Text>
      </View>

      <View style={styles.legend}>
        {domainsPresent.map((d) => (
          <View key={d.id} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colorFor(d.domain) }]} />
            <Text variant="caption" color="textMuted">{d.label}</Text>
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
  zoomBtn: { minWidth: 44, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: withAlpha(deepSpace.accentDim, 0.4), alignItems: "center", justifyContent: "center" },
  zoomBtnText: { color: deepSpace.textHi, fontSize: 18, lineHeight: 22 },
  hint: { flex: 1, minWidth: 0 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
