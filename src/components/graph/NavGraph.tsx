// NavGraph — main-screen navigation as an Obsidian-style force network.
//
// Per user directive (2026-05-27): the main screen becomes a navigator
// of pulsing dots. The biggest, brightest dot in the centre is the
// user's profile (2nd Brain). Around it sit the feature dots — every
// secondary screen. Around those drift the user's wiki/RAG data points
// as small faint dots. Tap any feature dot to surface a speech bubble
// that asks "go here?" with yes/no, the bubble follows the dot as it
// drifts.
//
// Implementation choices:
//   - Lines (relations) live in <Svg>, static. Nodes live as absolute
//     <Animated.View> circles on top so individual drift + pulse can
//     run on the native animation driver where available.
//   - Drift = per-node sin/cos with unique phase + tiny amplitude
//     (≤ 10px) so the line endpoints don't visibly disconnect.
//   - Pulse = an interval randomly picks a non-data node every ~4s and
//     plays a brief scale 1 → 1.15 → 1.
//   - Tap target is a Pressable wrapping each dot; the bubble is an
//     absolute View positioned over (or under) the active dot's
//     current drifting position.
//   - Cluster heuristic (no full force simulation): related dots share
//     an angular sector, so DAILY/SELF/META groups read as clusters.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Line } from "react-native-svg";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { darkSky } from "@/lib/theme/tokens";

export type Cluster = "self" | "daily" | "knowledge" | "meta";

export interface NavNode {
  id: string;
  /** Route to push when the user accepts the bubble. */
  href:
    | "/persona"
    | "/journal"
    | "/capture"
    | "/inbox"
    | "/wiki"
    | "/jarvis"
    | "/audit"
    | "/interview"
    | "/trinity"
    | "/insights"
    | "/research"
    | "/settings"
    | "/manual";
  label: { en: string; ko: string };
  description: { en: string; ko: string };
  cluster: Cluster;
}

export interface DataNode {
  id: string;
  title: string;
}

// 11 feature dots arranged into 3 clusters. Order matters for angular
// placement — clusters get adjacent slots so the network reads as
// grouped, with the center pulling everyone inward.
export const MENU_NODES: readonly NavNode[] = [
  // DAILY cluster (5 dots, sector 1)
  { id: "journal", href: "/journal", cluster: "daily",
    label: { en: "Journal", ko: "일기" },
    description: { en: "Daily entries and conclusions.", ko: "오늘의 기록과 결론." } },
  { id: "capture", href: "/capture", cluster: "daily",
    label: { en: "Capture", ko: "캡처" },
    description: { en: "Drop a link, paste a clip.", ko: "링크·클립·메모를 던져두세요." } },
  { id: "inbox", href: "/inbox", cluster: "daily",
    label: { en: "Inbox", ko: "받은편지함" },
    description: { en: "Sort captures into the wiki.", ko: "캡처를 위키로 분류해요." } },
  { id: "wiki", href: "/wiki", cluster: "knowledge",
    label: { en: "Wiki", ko: "위키" },
    description: { en: "Your personal knowledge web.", ko: "당신의 개인 지식 그물." } },
  { id: "jarvis", href: "/jarvis", cluster: "knowledge",
    label: { en: "Jarvis", ko: "자비스" },
    description: { en: "Talk to your second brain.", ko: "두 번째 뇌와 대화해요." } },
  // SELF cluster (4 dots, sector 2)
  { id: "audit", href: "/audit", cluster: "self",
    label: { en: "Life audit", ko: "라이프 오딧" },
    description: { en: "25-question life audit.", ko: "25문항 라이프 오딧." } },
  { id: "interview", href: "/interview", cluster: "self",
    label: { en: "Drill interview", ko: "드릴 인터뷰" },
    description: { en: "5-layer narrative drill.", ko: "5층 깊이의 드릴 인터뷰." } },
  { id: "trinity", href: "/trinity", cluster: "self",
    label: { en: "Brain Trinity", ko: "Brain Trinity" },
    description: { en: "Health · App · Brain · Finance.", ko: "건강 · 앱 · 뇌 · 재정." } },
  { id: "insights", href: "/insights", cluster: "self",
    label: { en: "Insights", ko: "인사이트" },
    description: { en: "Patterns surfaced from your records.", ko: "기록에서 떠오른 패턴." } },
  // META cluster (2 dots, sector 3)
  { id: "research", href: "/research", cluster: "meta",
    label: { en: "Research", ko: "리서치" },
    description: { en: "Deep-dive references.", ko: "심층 참고 자료." } },
  { id: "settings", href: "/settings", cluster: "meta",
    label: { en: "Settings", ko: "설정" },
    description: { en: "Account, language, data.", ko: "계정 · 언어 · 데이터." } },
] as const;

// Center node is special — it's the user's profile, the "2nd Brain".
export const CENTER_NODE: NavNode = {
  id: "core",
  href: "/persona",
  cluster: "self",
  label: { en: "2nd Brain", ko: "두 번째 뇌" },
  description: {
    en: "Your accumulated profile — everything observed about you so far.",
    ko: "지금까지 관찰된 당신의 프로필 — 두 번째 뇌의 중심.",
  },
};

function clusterTone(cluster: Cluster): string {
  if (cluster === "self") return "#2F97FC";       // electric blue
  if (cluster === "daily") return "#7FB3F4";      // softer sky
  if (cluster === "knowledge") return "#A569E5";  // violet (wiki/knowledge)
  return "#5A6FB4";                                // indigo (meta)
}

/** Stable pseudo-random in [0,1) keyed by string. djb2-ish, fine for
 *  layout jitter — no need for crypto entropy. */
function seeded(id: string, salt: number): number {
  let h = 5381 + salt * 31;
  for (let i = 0; i < id.length; i++) h = (h * 33) ^ id.charCodeAt(i);
  const v = ((h >>> 0) % 10000) / 10000;
  return v;
}

interface Props {
  locale: "en" | "ko";
  dataNodes: readonly DataNode[];
}

export function NavGraph({ locale, dataNodes }: Props) {
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height / 2;

  // Menu node positions — clusters get adjacent angular sectors so they
  // read as visually grouped without doing a full force simulation.
  const menuPositions = useMemo(() => {
    const radius = Math.min(width, height) * 0.28;
    // Group by cluster, then within each group spread angularly.
    const groups: Record<Cluster, readonly NavNode[]> = {
      daily: MENU_NODES.filter((n) => n.cluster === "daily"),
      knowledge: MENU_NODES.filter((n) => n.cluster === "knowledge"),
      self: MENU_NODES.filter((n) => n.cluster === "self"),
      meta: MENU_NODES.filter((n) => n.cluster === "meta"),
    };
    const out = new Map<string, { x: number; y: number }>();
    // Sector starting angle per cluster (radians; 0 = right, going CW).
    const sectorStart: Record<Cluster, number> = {
      daily: -Math.PI / 2,               // top
      knowledge: Math.PI / 6,            // lower-right
      self: (5 * Math.PI) / 6,           // lower-left
      meta: -Math.PI + Math.PI / 12,     // upper-left (small sector)
    };
    const sectorSpan: Record<Cluster, number> = {
      daily: Math.PI * 0.55,
      knowledge: Math.PI * 0.45,
      self: Math.PI * 0.55,
      meta: Math.PI * 0.30,
    };
    for (const c of ["daily", "knowledge", "self", "meta"] as Cluster[]) {
      const group = groups[c];
      const start = sectorStart[c];
      const span = sectorSpan[c];
      group.forEach((n, i) => {
        const t = group.length === 1 ? 0.5 : i / (group.length - 1);
        const angle = start + span * t;
        const rJitter = 0.82 + seeded(n.id, 1) * 0.36;     // 0.82-1.18
        const aJitter = (seeded(n.id, 2) - 0.5) * 0.2;     // ±0.1 rad
        const r = radius * rJitter;
        out.set(n.id, {
          x: cx + Math.cos(angle + aJitter) * r,
          y: cy + Math.sin(angle + aJitter) * r,
        });
      });
    }
    return out;
  }, [width, height, cx, cy]);

  // Data node positions — outer ring, scattered. Subset cap at 40 to keep
  // the scene calm; very large wikis don't render every page as a dot.
  const dataPositions = useMemo(() => {
    const cap = Math.min(dataNodes.length, 40);
    const subset = dataNodes.slice(0, cap);
    const out = new Map<string, { x: number; y: number }>();
    const outer = Math.min(width, height) * 0.42;
    subset.forEach((d) => {
      const a = seeded(d.id, 3) * Math.PI * 2;
      const r = outer * (0.85 + seeded(d.id, 4) * 0.15);
      out.set(d.id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    });
    return out;
  }, [dataNodes, width, height, cx, cy]);

  // Per-node drift animation. One Animated.Value cycles 0 → 1 → 0 over
  // 8-12s with a per-node phase offset; translateX/Y are sin/cos of it.
  const driftValues = useRef<Map<string, Animated.Value>>(new Map());
  const pulseValues = useRef<Map<string, Animated.Value>>(new Map());

  useEffect(() => {
    const allIds = [CENTER_NODE.id, ...MENU_NODES.map((n) => n.id)];
    for (const id of allIds) {
      if (!driftValues.current.has(id)) {
        const v = new Animated.Value(seeded(id, 5));
        driftValues.current.set(id, v);
        const duration = 9000 + seeded(id, 6) * 4000;
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ).start();
      }
      if (!pulseValues.current.has(id)) {
        pulseValues.current.set(id, new Animated.Value(1));
      }
    }
  }, []);

  // Pulse loop — every 4s, pick a random non-center node and play a brief
  // scale animation. Active (tapped) node is excluded so the bubble stays
  // anchored visually.
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const candidates = MENU_NODES.filter((n) => n.id !== activeId);
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (!pick) return;
      const v = pulseValues.current.get(pick.id);
      if (!v) return;
      Animated.sequence([
        Animated.timing(v, { toValue: 1.18, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1.0, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start();
    }, 4000);
    return () => clearInterval(id);
  }, [activeId]);

  function driftTransform(id: string) {
    const v = driftValues.current.get(id);
    if (!v) return [];
    // Two interpolations from the same 0→1 value give us a Lissajous-ish
    // sway without needing a second animation timer per node.
    const tx = v.interpolate({
      inputRange: [0, 0.25, 0.5, 0.75, 1],
      outputRange: [0, 6, 0, -6, 0],
    });
    const ty = v.interpolate({
      inputRange: [0, 0.25, 0.5, 0.75, 1],
      outputRange: [0, -4, -7, -4, 0],
    });
    return [{ translateX: tx }, { translateY: ty }];
  }

  function pulseTransform(id: string) {
    const v = pulseValues.current.get(id);
    if (!v) return [];
    return [{ scale: v }];
  }

  // Edge set — center ↔ every menu node (always), plus same-cluster
  // pairs. Keeps the line web meaningful without overwhelming the scene.
  const edges = useMemo(() => {
    const list: { from: { x: number; y: number }; to: { x: number; y: number }; opacity: number }[] = [];
    // Center → menu
    for (const n of MENU_NODES) {
      const p = menuPositions.get(n.id);
      if (!p) continue;
      list.push({ from: { x: cx, y: cy }, to: p, opacity: 0.35 });
    }
    // Same-cluster pairs
    for (const c of ["daily", "knowledge", "self", "meta"] as Cluster[]) {
      const inCluster = MENU_NODES.filter((n) => n.cluster === c);
      for (let i = 0; i < inCluster.length; i++) {
        for (let j = i + 1; j < inCluster.length; j++) {
          const a = menuPositions.get(inCluster[i].id);
          const b = menuPositions.get(inCluster[j].id);
          if (!a || !b) continue;
          list.push({ from: a, to: b, opacity: 0.18 });
        }
      }
    }
    return list;
  }, [menuPositions, cx, cy]);

  const activeNode = activeId === CENTER_NODE.id
    ? CENTER_NODE
    : MENU_NODES.find((n) => n.id === activeId) ?? null;
  const activePos = activeNode
    ? (activeNode.id === CENTER_NODE.id ? { x: cx, y: cy } : menuPositions.get(activeNode.id))
    : null;

  function handleConfirm() {
    if (!activeNode) return;
    const href = activeNode.href;
    setActiveId(null);
    router.push(href);
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Static line web — drifts are small enough that endpoints stay
          visually close to the node centers. */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {edges.map((e, i) => (
          <Line
            key={i}
            x1={e.from.x}
            y1={e.from.y}
            x2={e.to.x}
            y2={e.to.y}
            stroke={darkSky.accent}
            strokeOpacity={e.opacity}
            strokeWidth={1}
          />
        ))}
      </Svg>

      {/* Data dots — small, faint, decorative wiki/RAG presence. */}
      {Array.from(dataPositions.entries()).map(([id, pos]) => (
        <View
          key={id}
          style={[
            styles.dataDot,
            {
              left: pos.x - 2,
              top: pos.y - 2,
              backgroundColor: darkSky.accent,
              opacity: 0.35,
            },
          ]}
          pointerEvents="none"
        />
      ))}

      {/* Menu dots — animated, tappable. */}
      {MENU_NODES.map((n) => {
        const pos = menuPositions.get(n.id);
        if (!pos) return null;
        const color = clusterTone(n.cluster);
        const size = 18;
        return (
          <Animated.View
            key={n.id}
            style={[
              styles.menuDotWrap,
              {
                left: pos.x - size / 2,
                top: pos.y - size / 2,
                width: size,
                height: size,
                transform: [...driftTransform(n.id), ...pulseTransform(n.id)],
              },
            ]}
          >
            <Pressable
              onPress={() => setActiveId(n.id === activeId ? null : n.id)}
              hitSlop={14}
              accessibilityLabel={n.label[locale]}
              style={[styles.menuDot, { backgroundColor: color, borderColor: color }]}
            />
          </Animated.View>
        );
      })}

      {/* Center dot — biggest + brightest. Always above. */}
      <Animated.View
        style={[
          styles.centerWrap,
          {
            left: cx - 26,
            top: cy - 26,
            transform: [...driftTransform(CENTER_NODE.id), ...pulseTransform(CENTER_NODE.id)],
          },
        ]}
      >
        <Pressable
          onPress={() => setActiveId(CENTER_NODE.id === activeId ? null : CENTER_NODE.id)}
          hitSlop={20}
          accessibilityLabel={CENTER_NODE.label[locale]}
          style={styles.centerDot}
        />
      </Animated.View>

      {/* Bubble — anchored to the active node's drifting position. */}
      {activeNode && activePos ? (
        <Animated.View
          style={[
            styles.bubble,
            {
              left: Math.max(16, Math.min(width - 16 - 240, activePos.x - 120)),
              top: activePos.y > cy ? activePos.y - 130 : activePos.y + 30,
              transform:
                activeNode.id === CENTER_NODE.id
                  ? [...driftTransform(CENTER_NODE.id)]
                  : [...driftTransform(activeNode.id)],
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.bubbleBody}>
            <Text variant="caption" color="brand" style={styles.bubbleLabel}>
              {activeNode.label[locale]}
            </Text>
            <Text variant="body" style={styles.bubbleDesc}>
              {activeNode.description[locale]}
            </Text>
            <Text variant="subtle" color="textSubtle" style={styles.bubbleAsk}>
              {locale === "ko" ? "들어갈까요?" : "Go here?"}
            </Text>
            <View style={styles.bubbleActions}>
              <Pressable onPress={handleConfirm} style={[styles.bubbleBtn, styles.bubbleBtnYes]}>
                <Text style={styles.bubbleBtnYesText}>
                  {locale === "ko" ? "네" : "Yes"}
                </Text>
              </Pressable>
              <Pressable onPress={() => setActiveId(null)} style={[styles.bubbleBtn, styles.bubbleBtnNo]}>
                <Text style={styles.bubbleBtnNoText}>
                  {locale === "ko" ? "아니오" : "No"}
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill as object },
  menuDotWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  menuDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    shadowColor: "#7FB3F4",
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  dataDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  centerWrap: { position: "absolute", width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  centerDot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: darkSky.brand,
    shadowColor: darkSky.brand,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    borderWidth: 2,
    borderColor: darkSky.accent,
  },
  bubble: { position: "absolute", width: 240 },
  bubbleBody: {
    backgroundColor: darkSky.bg,
    borderColor: darkSky.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bubbleLabel: { letterSpacing: 1 },
  bubbleDesc: { marginTop: 4, color: darkSky.text, fontSize: 13, lineHeight: 18 },
  bubbleAsk: { marginTop: 6, fontSize: 11, letterSpacing: 0.5 },
  bubbleActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  bubbleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
    borderWidth: 1,
  },
  bubbleBtnYes: { backgroundColor: darkSky.brand, borderColor: darkSky.brand },
  bubbleBtnYesText: { color: darkSky.bg, fontWeight: "700", fontSize: 13, letterSpacing: 0.5 },
  bubbleBtnNo: { backgroundColor: "transparent", borderColor: darkSky.border },
  bubbleBtnNoText: { color: darkSky.textMuted, fontSize: 13, letterSpacing: 0.5 },
});
