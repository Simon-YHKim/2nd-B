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
import Svg, { G, Line, Text as SvgText } from "react-native-svg";

import { PixelNodeSvg, PixelStarSvg } from "@/components/pixel/PixelStarSvg";

import { Text } from "@/components/ui/Text";
import { MdChip } from "@/components/m3";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import type { RecordsGraph as RecordsGraphData } from "@/lib/records/records-graph";
import { initialTagLinksVisible, linkEdgeCount } from "@/lib/records/records-graph";
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
  // Adaptive default: a dense corpus (125+ records → hundreds of dashed links)
  // starts with the tag-link overlay OFF so the center stays readable; a small
  // corpus keeps the proto's default (ON). Initial only — a manual toggle wins.
  const linkCount = useMemo(() => linkEdgeCount(graph), [graph]);
  const [showTagLinks, setShowTagLinks] = useState(() => initialTagLinksVisible(linkCount));

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
            // Gate ONLY the tag-shared dashed overlay; spine/branch always draw.
            if (link && !showTagLinks) return null;
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
            // 별(북극성·도메인)은 4방향 글린트라 같은 반경의 원반보다 채워진
            // 면적이 훨씬 작다. 반경을 그대로 두면 기록 사각형보다 작아 보여서
            // 서열이 뒤집힌다 — 별자리 홈과 같은 1.35배를 여기에도 준다.
            const r = (isPolaris ? 13 * 1.35 : isDomain ? 9 * 1.35 : 5.5) / Math.sqrt(zoom);
            const fill = isPolaris ? POLARIS_COLOR : colorFor(node.domain);
            const alpha = isPolaris ? 1 : isDomain ? 0.95 : 0.8;
            const showLabel = isPolaris || isDomain || isSelected;
            return (
              <G key={node.id}>
                {isSelected ? (
                  <PixelNodeSvg cx={p.x * CANVAS} cy={p.y * CANVAS} r={r + 6} stroke={withAlpha(m3.accent.star, 0.7)} strokeWidth={2} />
                ) : null}
                {/* 북극성과 도메인은 **별**로, 개별 기록은 **사각형**으로 그린다
                    (PIXEL-CLAY 규칙 1). 기록 노드까지 광선을 달면 별자리
                    은유가 묽어진다 -- 빛나는 것은 북극성과 7 도메인뿐이다. */}
                {isPolaris || isDomain ? (
                  <PixelStarSvg
                    cx={p.x * CANVAS}
                    cy={p.y * CANVAS}
                    r={r}
                    fill={withAlpha(fill, alpha)}
                    onPress={() => selectNode(node.id, node.kind === "record")}
                    accessibilityLabel={node.label}
                  />
                ) : (
                  <PixelNodeSvg
                    cx={p.x * CANVAS}
                    cy={p.y * CANVAS}
                    r={r}
                    fill={withAlpha(fill, alpha)}
                    onPress={() => selectNode(node.id, node.kind === "record")}
                    accessibilityLabel={node.label}
                  />
                )}
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
        {/* Tag-link overlay toggle — no filter panel here (unlike the proto), so it
            rides beside the zoom controls as an M3 filter chip (checkbox role). */}
        <MdChip
          kind="filter"
          label={t("deepspace:recordsGraph.tagLinks")}
          selected={showTagLinks}
          onPress={() => setShowTagLinks((v) => !v)}
          style={styles.tagChip}
        />
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
    borderRadius: 0,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accentDim, 0.22),
    backgroundColor: withAlpha(deepSpace.bgMid, 0.35),
    overflow: "hidden",
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 8 },
  zoomBtn: { minWidth: 44, minHeight: 44, borderRadius: 0, borderWidth: 1, borderColor: withAlpha(deepSpace.accentDim, 0.4), alignItems: "center", justifyContent: "center" },
  zoomBtnText: { color: deepSpace.textHi, fontSize: 18, lineHeight: 22 },
  tagChip: { flexShrink: 0 },
  hint: { flex: 1, minWidth: 0 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 0 },
});
