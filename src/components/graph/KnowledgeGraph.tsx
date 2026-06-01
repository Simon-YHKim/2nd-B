// Obsidian-style knowledge graph visualization.
//
// Renders the user's wiki_pages + wiki_links as a force-radial network
// centered on a "core" node (the user's identity anchor). Empty state
// (no pages) shows just the core + a top message inviting the first
// tap. Per user directive — '점 하나만 띄우고 ... 두번째 뇌의 구성을
// 시작하세요'.
//
// The core node is always tappable: it routes new users to sign-up,
// existing users to /journal to start their first entry, and existing-
// with-data users to /journal to add another. The graph itself is
// decorative for now; future PRs can add per-node tap → wiki page.
//
// Implementation choice: react-native-svg keeps the lines + circles
// crisp at any scale, works on Web (via react-native-svg-web), and
// keeps the bundle small (~30KB gzipped).

import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line, G } from "react-native-svg";

export type GraphKind = "source" | "entity" | "concept";

export interface GraphNode {
  id: string;
  kind: GraphKind;
  title: string;
}

export interface GraphEdge {
  from_page: string;
  to_page: string;
}

const NODE_COLORS: Record<GraphKind, string> = {
  source: "#2F97FC",   // electric blue — captured raw sources
  entity: "#8FB7FB",   // softer blue — extracted entities
  concept: "#A569E5",  // violet — abstract concepts
};

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Tap handler for the central core (always-present anchor). */
  onTapCore: () => void;
  /** Optional message above the graph — used for the empty state. */
  topMessage?: string;
}

export function KnowledgeGraph({ nodes, edges, onTapCore, topMessage }: Props) {
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height / 2;

  // Radial layout: distribute nodes on rings outward from center, with
  // ring radius scaling so we never run off-screen. 1-8 nodes use one
  // ring, 9-24 use two, 25+ use three.
  const positions = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    if (nodes.length === 0) return out;

    const maxRadius = Math.min(width, height) * 0.36;
    const minRadius = Math.min(width, height) * 0.16;

    const ringsNeeded = nodes.length <= 8 ? 1 : nodes.length <= 24 ? 2 : 3;
    const perRing = Math.ceil(nodes.length / ringsNeeded);
    nodes.forEach((n, i) => {
      const ring = Math.floor(i / perRing);
      const angleOffset = (ring * Math.PI) / perRing; // stagger rings
      const idxInRing = i % perRing;
      const angle = angleOffset + (idxInRing / perRing) * Math.PI * 2;
      const r = minRadius + (maxRadius - minRadius) * (ring / Math.max(1, ringsNeeded - 1) || 1);
      out.set(n.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    });
    return out;
  }, [nodes, width, height, cx, cy]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {topMessage ? (
        <View style={styles.topBanner} pointerEvents="none">
          <Text style={styles.topText}>{topMessage}</Text>
        </View>
      ) : null}

      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Edges — drawn first so nodes paint on top. */}
        <G>
          {edges.map((e, i) => {
            const from = positions.get(e.from_page);
            const to = positions.get(e.to_page);
            if (!from || !to) return null;
            return (
              <Line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#2F97FC"
                strokeOpacity={0.25}
                strokeWidth={1}
              />
            );
          })}
        </G>
        {/* Center core halo — always rendered, identifies "you". */}
        <Circle cx={cx} cy={cy} r={26} fill="none" stroke="#7FB3F4" strokeOpacity={0.4} strokeWidth={1} />
        <Circle cx={cx} cy={cy} r={42} fill="none" stroke="#7FB3F4" strokeOpacity={0.18} strokeWidth={1} />
        {/* Nodes */}
        <G>
          {nodes.map((n) => {
            const pos = positions.get(n.id);
            if (!pos) return null;
            return (
              <Circle
                key={n.id}
                cx={pos.x}
                cy={pos.y}
                r={7}
                fill={NODE_COLORS[n.kind]}
                fillOpacity={0.95}
              />
            );
          })}
        </G>
        {/* Center core — the "you" anchor, always present even when empty. */}
        <Circle cx={cx} cy={cy} r={12} fill="#7FB3F4" />
      </Svg>

      {/* Invisible tap target over the central core. The Svg is
          pointer-events:none above, so the Pressable receives the tap. */}
      <Pressable
        onPress={onTapCore}
        style={[styles.coreTapTarget, { left: cx - 32, top: cy - 32 }]}
        accessibilityRole="button"
        accessibilityLabel="중심 노드: 두번째 뇌 구성 시작"
        hitSlop={12}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill as object },
  topBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  topText: {
    color: "#C7D4EA",
    fontSize: 14,
    letterSpacing: 0.5,
    textAlign: "center",
    maxWidth: 420,
    lineHeight: 22,
  },
  coreTapTarget: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
  },
});
