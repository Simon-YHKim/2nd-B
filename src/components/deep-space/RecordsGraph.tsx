/**
 * Records tag-graph (D-27 Phase 1b) — the deep-space view of the user's own
 * records as the canonical node-set (NOT wiki_pages). Renders buildRecordsGraph:
 * 북극성(polaris) at center, the domain stars around it, each domain's records
 * on dedicated lattice slots, and DASHED cross-domain tag-links (records in different
 * domains that share a user tag) as the visible "connection" surface. Pure tag
 * overlap, no LLM/embeddings ($0, works from record #2). Tapping a record selects
 * it; tapping again opens it. Mirrors WikiGraph's SVG/zoom conventions.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, View } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";

import { TelescopeControls } from "./TelescopeControls";
import { moveTelescopeCamera } from "@/lib/motion/camera-remote";

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { PixelNodeSvg, PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { stepLine } from "@/components/pixel/pixel-line";

import { Text } from "@/components/ui/Text";
import { deepSpace, flattenAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import type { RecordsGraph as RecordsGraphData } from "@/lib/records/records-graph";
import { initialTagLinksVisible, linkEdgeCount } from "@/lib/records/records-graph";
import {
  DOMAIN_COLOR,
  RECORDS_GRAPH_MAX_ZOOM,
  budgetRecordsGraphEdgeCells,
  layoutRecordsGraph,
  recordsGraphViewport,
  zoomRecordsGraphCamera,
  type GraphEdgeCellBatch,
  type Pt,
  type RecordsGraphCamera,
} from "@/lib/records/records-graph-layout";

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `m3.accent.stageFloor` — 기록 그래프는 무대 바닥 위다.
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const rgAlpha = (c: string, a: number): string => flattenAlpha(c, a, m3.accent.stageFloor);

const POLARIS_COLOR = m3.accent.polaris;
const EDGE_CELL = 8;
const MAX_SOLID_CELLS = 32;
const MAX_DASHED_CELLS = 16;
const AUTO_RECORD_LABEL_LIMIT = 7;

interface RenderEdgeCell {
  key: string;
  x: number;
  y: number;
  size: number;
  fill: string;
}

function colorForDomain(domain: string | undefined): string {
  return (domain && DOMAIN_COLOR[domain as keyof typeof DOMAIN_COLOR]) || m3.accent.starDim;
}

function sampledEdgeCells(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  dashed: boolean,
) {
  const cells = stepLine(ax, ay, bx, by, EDGE_CELL);
  const limit = dashed ? MAX_DASHED_CELLS : MAX_SOLID_CELLS;
  const stride = Math.max(dashed ? 2 : 1, Math.ceil(cells.length / limit));
  return cells.filter((_, index) => index % stride === 0);
}

export function RecordsGraph({
  graph,
  onOpenRecord,
  onOpenPersona,
}: {
  graph: RecordsGraphData;
  onOpenRecord: (id: string) => void;
  onOpenPersona?: () => void;
}) {
  const { t } = useTranslation("deepspace");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [camera, setCamera] = useState<RecordsGraphCamera>({ zoom: 1, x: 0, y: 0 });
  const cameraRef = useRef(camera);
  const [canvasSize, setCanvasSize] = useState({ width: 390, height: 390 });
  const [controlsHeight, setControlsHeight] = useState(118);
  // Adaptive default follows the link density of this bounded visual subset.
  // Initial only — a manual toggle wins.
  const linkCount = useMemo(() => linkEdgeCount(graph), [graph]);
  const [tagLinksOverride, setTagLinksOverride] = useState<boolean | null>(null);
  const showTagLinks = tagLinksOverride ?? initialTagLinksVisible(linkCount);

  const pos = useMemo(() => layoutRecordsGraph(graph), [graph]);
  const viewport = useMemo(
    () => recordsGraphViewport(canvasSize.width, canvasSize.height),
    [canvasSize.width, canvasSize.height],
  );
  const projected = useMemo(
    () => Object.fromEntries(Object.entries(pos).map(([id, point]) => [id, viewport.project(point)])) as Record<string, Pt>,
    [pos, viewport],
  );
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const zoom = camera.zoom;
  const spanX = viewport.width / zoom;
  const spanY = viewport.height / zoom;
  const vbX = camera.x;
  const vbY = camera.y;
  // Matching viewBox and canvas aspect ratios keep stars round on portrait
  // screens while preserving the Android 44dp interaction floor.
  const hitTargetSize = (44 * spanX) / canvasSize.width;

  const commitCamera = useCallback((next: RecordsGraphCamera) => {
    cameraRef.current = next;
    setCamera(next);
  }, []);

  const selectNode = (id: string, openable: boolean) => {
    if (selectedId === id && openable) {
      if (id.startsWith("persona:")) onOpenPersona?.();
      else onOpenRecord(id);
    }
    else setSelectedId(id);
  };

  const selected = selectedId ? nodeById.get(selectedId) : undefined;
  const recordNodeCount = graph.nodes.filter((node) => node.kind === "record").length;
  const labelEveryRecord = recordNodeCount <= AUTO_RECORD_LABEL_LIMIT;
  const edgeCells = useMemo(() => {
    const nonLinks: GraphEdgeCellBatch<RenderEdgeCell>[] = [];
    const tagLinks: GraphEdgeCellBatch<RenderEdgeCell>[] = [];

    graph.edges.forEach((edge, edgeIndex) => {
      const a = projected[edge.a];
      const b = projected[edge.b];
      if (!a || !b) return;
      const link = edge.kind === "link";
      if (link && !showTagLinks) return;
      const domain = link
        ? undefined
        : nodeById.get(edge.b)?.domain ?? nodeById.get(edge.a)?.domain;
      const fill = link
        ? rgAlpha(m3.accent.star, 0.42)
        : edge.kind === "branch"
          ? rgAlpha(colorForDomain(domain), 0.28)
          : rgAlpha(m3.accent.starDim, 0.22);
      const size = Math.max(2, Math.round((link ? 5 : 6) / zoom));
      const cells = sampledEdgeCells(
        a.x,
        a.y,
        b.x,
        b.y,
        link,
      ).map((cell, cellIndex) => ({
        key: `${edgeIndex}:${cellIndex}`,
        x: cell.x,
        y: cell.y,
        size,
        fill,
      }));
      (link ? tagLinks : nonLinks).push({ cells });
    });

    return budgetRecordsGraphEdgeCells(nonLinks, tagLinks);
  }, [graph.edges, nodeById, projected, showTagLinks, zoom]);

  return (
    <View style={styles.root}>
      <View
        style={styles.canvasWrap}
        onLayout={({ nativeEvent: { layout } }) => {
          const width = Math.max(1, layout.width);
          const height = Math.max(1, layout.height);
          setCanvasSize((current) =>
            current.width === width && current.height === height ? current : { width, height },
          );
        }}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`${vbX} ${vbY} ${spanX} ${spanY}`}
          accessibilityLabel={t("deepspace:recordsGraph.a11yGraph")}
        >
          {/* Non-link cells win the one global primitive budget; tag links use
              only the remainder. Flat Rects avoid one native G per edge. */}
          {edgeCells.map((cell) => (
            <Rect
              key={cell.key}
              x={cell.x}
              y={cell.y}
              width={cell.size}
              height={cell.size}
              fill={cell.fill}
            />
          ))}

          {graph.nodes.map((node) => {
            const p = projected[node.id];
            if (!p) return null;
            const isPolaris = node.kind === "polaris";
            const isDomain = node.kind === "domain";
            const isPersona = node.kind === "persona";
            const isBranchStar = isDomain || isPersona;
            const isSelected = node.id === selectedId;
            // 별(북극성·도메인)은 4방향 글린트라 같은 반경의 원반보다 채워진
            // 면적이 훨씬 작다. 반경을 그대로 두면 기록 사각형보다 작아 보여서
            // 서열이 뒤집힌다 — 별자리 홈과 같은 1.35배를 여기에도 준다.
            const r = (isPolaris ? 13 * 1.35 : isBranchStar ? 9 * 1.35 : 5.5) / Math.sqrt(zoom);
            const fill = isPolaris ? POLARIS_COLOR : isPersona ? m3.accent.polaris : colorForDomain(node.domain);
            const alpha = isPolaris ? 1 : isBranchStar ? 0.95 : 0.8;
            const showLabel = isPolaris || isBranchStar || isSelected || (labelEveryRecord && node.kind === "record");
            const nodeHitTargetSize = Math.max(hitTargetSize, (r + 6) * 2);
            return (
              <G key={node.id}>
                {isSelected ? (
                  <PixelNodeSvg cx={p.x} cy={p.y} r={r + 6} stroke={rgAlpha(m3.accent.star, 0.7)} strokeWidth={2} />
                ) : null}
                {/* 북극성과 도메인은 **별**로, 개별 기록은 **사각형**으로 그린다
                    (PIXEL-CLAY 규칙 1). 기록 노드까지 광선을 달면 별자리
                    은유가 묽어진다 -- 빛나는 것은 북극성과 7 도메인뿐이다. */}
                {isPolaris || isBranchStar ? (
                  <PixelStarSvg
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={rgAlpha(fill, alpha)}
                  />
                ) : (
                  <PixelNodeSvg
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={rgAlpha(fill, alpha)}
                  />
                )}
                {showLabel ? (
                  <SvgText
                    x={p.x}
                    y={p.y - r - 5}
                    fill={rgAlpha(m3.accent.skyTextHi, isBranchStar || isPolaris ? 0.9 : 0.8)}
                    fontSize={(isPolaris || isBranchStar ? 15 : 12) / Math.sqrt(zoom) + 4}
                    fontWeight={isBranchStar || isPolaris ? "700" : "400"}
                    fontFamily={m3.font.mono}
                    textAnchor="middle"
                  >
                    {node.label.length > 14 ? `${node.label.slice(0, 13)}…` : node.label}
                  </SvgText>
                ) : null}
                <Rect
                  x={p.x - nodeHitTargetSize / 2}
                  y={p.y - nodeHitTargetSize / 2}
                  width={nodeHitTargetSize}
                  height={nodeHitTargetSize}
                  fill="transparent"
                  {...(Platform.OS === "web"
                    ? {
                        // react-native-svg/web overwrites onClick with
                        // onPress=undefined unless onPress is explicitly null.
                        onPress: null as never,
                        onClick: () => selectNode(node.id, node.kind === "record" || isPersona),
                        onKeyDown: (event: { key: string; preventDefault: () => void }) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectNode(node.id, node.kind === "record" || isPersona);
                          }
                        },
                        // RN Web replaces an SVG rect with an HTML <button>
                        // when role is passed during render. Keep the rect as
                        // the real hit target, then set its ARIA role on mount.
                        forwardedRef: (element: SVGElement | null) => {
                          element?.setAttribute("role", "button");
                        },
                        tabIndex: 0,
                        "aria-label": node.label,
                      }
                    : {
                        onPress: () => selectNode(node.id, node.kind === "record" || isPersona),
                        accessible: true,
                        accessibilityLabel: node.label,
                      })}
                />
              </G>
            );
          })}
        </Svg>
      </View>

      <View style={styles.controls} onLayout={({ nativeEvent: { layout } }) => setControlsHeight(layout.height)}>
        <TelescopeControls
          zoom={zoom}
          minZoom={1}
          maxZoom={RECORDS_GRAPH_MAX_ZOOM}
          onMove={(dx, dy) => commitCamera(moveTelescopeCamera(cameraRef.current, dx, dy, viewport))}
          onZoom={(zoom) => commitCamera(zoomRecordsGraphCamera(cameraRef.current, zoom, 0.5, 0.5, viewport))}
          onReset={() => commitCamera({ zoom: 1, x: 0, y: 0 })}
        />
        <PixelPressable
          onPress={() => setTagLinksOverride(!showTagLinks)}
          accessibilityLabel={t("deepspace:recordsGraph.tagLinks")}
          accessibilityRole="switch"
          accessibilityState={{ checked: showTagLinks }}
          variant={showTagLinks ? "inset" : "bevel"}
          contentStyle={styles.iconButtonContent}
        >
          <PixelGlyph name="link" color={showTagLinks ? deepSpace.textHi : deepSpace.textMuted} size={18} />
        </PixelPressable>
      </View>

      {selected && selected.kind === "record" ? (
        <PixelSurface variant="frame" style={[styles.selection, { bottom: controlsHeight + 8 }]} contentStyle={styles.selectionContent}>
          <Text variant="caption" color="textSubtle" numberOfLines={1}>
            {t("deepspace:recordsGraph.hintSelected", { label: selected.label })}
          </Text>
        </PixelSurface>
      ) : null}
      {selected && selected.kind === "persona" ? (
        <PixelSurface variant="frame" style={[styles.selection, { bottom: controlsHeight + 8 }]} contentStyle={styles.selectionContent}>
          <Text variant="caption" color="textSubtle" numberOfLines={2}>
            {selected.summary}
          </Text>
        </PixelSurface>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  canvasWrap: {
    flex: 1,
    width: "100%",
    borderRadius: 0,
    overflow: "hidden",
  },
  controls: { paddingHorizontal: 12, paddingVertical: 8, alignItems: "flex-end", justifyContent: "space-between", flexDirection: "row", gap: 8 },
  iconButtonContent: { width: 44, minHeight: 44, paddingHorizontal: 0, paddingVertical: 0, alignItems: "center", justifyContent: "center" },
  selection: { position: "absolute", left: 16, right: 16, zIndex: 6 },
  selectionContent: { minHeight: 44, justifyContent: "center" },
});
