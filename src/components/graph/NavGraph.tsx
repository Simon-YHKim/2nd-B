// NavGraph v2 — tier-based constellation with live-aligned edges.
//
// 2026-05-27 — major redesign per user directive:
//
//   Tier 1 (centre, 1 node)     2nd Brain — user profile. Bubble has
//                               a Jarvis quick-launch icon.
//   Tier 2 (3 nodes, mid ring)  현재의 나 / 과거의 나 / Wiki.
//                               Wiki bubble has an upload icon.
//   Tier 3 (~7 nodes, outer)    Wiki splits into 일상/Pro; 과거의 나
//                               splits into 유년/10대/20대/30대; plus
//                               insights.
//   Tier 4 (N data dots)        Real wiki/RAG entries the user owns,
//                               each parented to its tier-3 wiki.
//
// All edges connect a parent to its children. Edges are drawn with
// Animated SVG <Line> that subscribes to the same drift Animated.Values
// the nodes use — so when a node sways, the line endpoint sways with
// it (no visible disconnect). Trade-off: useNativeDriver=false (SVG
// props can't run on the native driver), but ~25 nodes is well within
// JS-thread budget.
//
// Bubble routes:
//   - Plain node with href: tap "Yes" → router.push(href).
//   - Wiki tier-2 node (bubbleAction: 'upload'): bubble shows a +
//     icon that opens /capture. Bubble's primary action is "view 일상
//     Wiki" but the icon offers the upload shortcut.
//   - Core tier-1 node (bubbleAction: 'jarvis'): bubble shows a 💬
//     icon that opens /jarvis. Primary action: open /persona.

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
import { router, type Href } from "expo-router";

import { Text } from "@/components/ui/Text";
import { darkSky } from "@/lib/theme/tokens";

const AnimatedLine = Animated.createAnimatedComponent(Line);

export type Tier = 1 | 2 | 3 | 4;

export interface NavNode {
  id: string;
  tier: Tier;
  parentId?: string;
  href?: Href;
  label: { en: string; ko: string };
  description: { en: string; ko: string };
  bubbleAction?: "jarvis" | "upload";
}

export interface DataNode {
  id: string;
  title: string;
  /** Which tier-3 wiki node this entry belongs to. Defaults to wiki-daily. */
  parentId?: "wiki-daily" | "wiki-pro";
}

// Authoritative menu graph. Tier ↑ size ↑ brightness ↑.
export const MENU_NODES: readonly NavNode[] = [
  // Tier 2 — three pillars of the profile
  { id: "now", tier: 2, parentId: "core", href: "/trinity",
    label: { en: "Present me", ko: "현재의 나" },
    description: { en: "Brain Trinity: Health · App · Brain · Finance.", ko: "Brain Trinity: 건강 · 앱 · 뇌 · 재정." } },
  { id: "past", tier: 2, parentId: "core", href: "/interview",
    label: { en: "Past me", ko: "과거의 나" },
    description: { en: "Drill chat that goes deeper each turn.", ko: "꼬리에 꼬리를 무는 드릴 챗." } },
  { id: "wiki", tier: 2, parentId: "core", href: "/wiki", bubbleAction: "upload",
    label: { en: "Wiki", ko: "Wiki" },
    description: { en: "Your personal knowledge web.", ko: "당신의 지식 그물 — 자료/메모/링크를 올리면 정리돼요." } },

  // Tier 3 — children of present/past/wiki
  { id: "wiki-daily", tier: 3, parentId: "wiki", href: "/wiki",
    label: { en: "Daily Wiki", ko: "일상 Wiki" },
    description: { en: "Everyday notes, captures, scraps.", ko: "일상 기록 · 이메일 · 스크랩 · 캡쳐 OCR · 기타 문서." } },
  { id: "wiki-pro", tier: 3, parentId: "wiki", href: "/wiki",
    label: { en: "Pro Wiki", ko: "Pro Wiki" },
    description: { en: "Career-related references.", ko: "전문 기록 · 전문 이메일 · 전문 스크랩 · 전문 OCR · 별도 문서." } },
  { id: "past-childhood", tier: 3, parentId: "past", href: "/interview",
    label: { en: "Childhood", ko: "유년기" },
    description: { en: "Under-12 chapter.", ko: "12세 이전 챕터의 드릴 인터뷰." } },
  { id: "past-teens", tier: 3, parentId: "past", href: "/interview",
    label: { en: "Teens", ko: "10대" },
    description: { en: "12–19 chapter.", ko: "12–19세 챕터의 드릴 인터뷰." } },
  { id: "past-twenties", tier: 3, parentId: "past", href: "/interview",
    label: { en: "Twenties", ko: "20대" },
    description: { en: "20–29 chapter.", ko: "20–29세 챕터의 드릴 인터뷰." } },
  { id: "past-thirties", tier: 3, parentId: "past", href: "/interview",
    label: { en: "Thirties", ko: "30대" },
    description: { en: "30–39 chapter.", ko: "30–39세 챕터의 드릴 인터뷰." } },
  { id: "insights", tier: 3, parentId: "now", href: "/insights",
    label: { en: "Insights", ko: "인사이트" },
    description: { en: "Patterns surfaced from your records.", ko: "기록에서 떠오른 패턴." } },
] as const;

export const CENTER_NODE: NavNode = {
  id: "core",
  tier: 1,
  href: "/persona",
  bubbleAction: "jarvis",
  label: { en: "2nd Brain", ko: "두 번째 뇌" },
  description: {
    en: "The accumulated profile — how the AI understands you so far.",
    ko: "지금까지 AI가 이해한 당신의 종합 프로필.",
  },
};

function tierTone(t: Tier): string {
  if (t === 1) return darkSky.brand;      // electric blue, brightest
  if (t === 2) return darkSky.accent;     // softer sky
  if (t === 3) return "#9BA8D4";          // indigo-tinted blue
  return "rgba(127,179,244,0.65)";        // tier 4 is faint
}

function tierSize(t: Tier): number {
  if (t === 1) return 52;
  if (t === 2) return 26;
  if (t === 3) return 16;
  return 5;
}

function seeded(id: string, salt: number): number {
  let h = 5381 + salt * 31;
  for (let i = 0; i < id.length; i++) h = (h * 33) ^ id.charCodeAt(i);
  return ((h >>> 0) % 10000) / 10000;
}

interface Props {
  locale: "en" | "ko";
  dataNodes: readonly DataNode[];
}

interface Positioned {
  node: NavNode;
  base: { x: number; y: number };
}

interface DataPositioned {
  node: DataNode;
  base: { x: number; y: number };
}

export function NavGraph({ locale, dataNodes }: Props) {
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height / 2;

  // Tier layout — concentric rings, children kept near their parent's
  // angle so the parent→child line web reads as branching out.
  const positions = useMemo(() => {
    const minDim = Math.min(width, height);
    const ring2 = minDim * 0.22;
    const ring3 = minDim * 0.36;

    const map = new Map<string, { x: number; y: number; angle: number }>();
    map.set(CENTER_NODE.id, { x: cx, y: cy, angle: 0 });

    // Tier 2 — 3 nodes, evenly spaced starting at top.
    const t2 = MENU_NODES.filter((n) => n.tier === 2);
    t2.forEach((n, i) => {
      const angle = -Math.PI / 2 + (i / t2.length) * Math.PI * 2;
      map.set(n.id, {
        x: cx + Math.cos(angle) * ring2,
        y: cy + Math.sin(angle) * ring2,
        angle,
      });
    });

    // Tier 3 — clustered near their parent's angle.
    const childrenOf: Record<string, NavNode[]> = {};
    for (const n of MENU_NODES) {
      if (n.tier !== 3 || !n.parentId) continue;
      (childrenOf[n.parentId] ??= []).push(n);
    }
    for (const [parentId, kids] of Object.entries(childrenOf)) {
      const parent = map.get(parentId);
      if (!parent) continue;
      const sectorWidth = Math.PI * 0.55;
      kids.forEach((n, i) => {
        const t = kids.length === 1 ? 0.5 : i / (kids.length - 1);
        const angle = parent.angle - sectorWidth / 2 + sectorWidth * t;
        const jitter = (seeded(n.id, 1) - 0.5) * 0.18;
        const rJit = 0.9 + seeded(n.id, 2) * 0.2;
        map.set(n.id, {
          x: cx + Math.cos(angle + jitter) * ring3 * rJit,
          y: cy + Math.sin(angle + jitter) * ring3 * rJit,
          angle,
        });
      });
    }
    return map;
  }, [width, height, cx, cy]);

  // Tier 4 data positions — clustered around their wiki parent's angle.
  const dataPositions = useMemo(() => {
    const cap = Math.min(dataNodes.length, 40);
    const out = new Map<string, { x: number; y: number; parentId: string }>();
    const minDim = Math.min(width, height);
    const ring4 = minDim * 0.46;
    dataNodes.slice(0, cap).forEach((d) => {
      const parentId = d.parentId ?? "wiki-daily";
      const parent = positions.get(parentId);
      const parentAngle = parent?.angle ?? 0;
      const ang = parentAngle + (seeded(d.id, 3) - 0.5) * Math.PI * 0.6;
      const r = ring4 * (0.88 + seeded(d.id, 4) * 0.12);
      out.set(d.id, { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, parentId });
    });
    return out;
  }, [dataNodes, positions, width, height, cx, cy]);

  // Drift Animated.Values — one pair per node (sx, sy = sway offsets).
  // useNativeDriver=false because SVG props can't run on the native
  // driver. ~25 nodes stays well within the JS-thread budget.
  const swayRef = useRef<Map<string, { sx: Animated.AnimatedInterpolation<number>; sy: Animated.AnimatedInterpolation<number> }>>(new Map());
  const driftValues = useRef<Map<string, Animated.Value>>(new Map());
  const pulseValues = useRef<Map<string, Animated.Value>>(new Map());

  useEffect(() => {
    const ids = [CENTER_NODE.id, ...MENU_NODES.map((n) => n.id), ...Array.from(dataPositions.keys())];
    for (const id of ids) {
      if (!driftValues.current.has(id)) {
        const v = new Animated.Value(seeded(id, 5));
        driftValues.current.set(id, v);
        const duration = 9000 + seeded(id, 6) * 4000;
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
            Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          ]),
        ).start();
        swayRef.current.set(id, {
          sx: v.interpolate({
            inputRange: [0, 0.25, 0.5, 0.75, 1],
            outputRange: [0, 6, 0, -6, 0],
          }),
          sy: v.interpolate({
            inputRange: [0, 0.25, 0.5, 0.75, 1],
            outputRange: [0, -4, -7, -4, 0],
          }),
        });
      }
      if (!pulseValues.current.has(id)) {
        pulseValues.current.set(id, new Animated.Value(1));
      }
    }
  }, [dataPositions]);

  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      // Pulse a random tier-2 or tier-3 node, skipping the active one.
      const candidates = MENU_NODES.filter((n) => n.id !== activeId);
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (!pick) return;
      const v = pulseValues.current.get(pick.id);
      if (!v) return;
      Animated.sequence([
        Animated.timing(v, { toValue: 1.18, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(v, { toValue: 1.0, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]).start();
    }, 4000);
    return () => clearInterval(id);
  }, [activeId]);

  function swayTransform(id: string): unknown {
    // RN's transform union is fiddly to satisfy at compile time, but
    // the runtime contract is "array of single-key transform objects".
    // Each entry below is exactly one such object.
    const s = swayRef.current.get(id);
    const out: Array<Record<string, Animated.AnimatedInterpolation<number> | Animated.Value>> = [];
    if (s) {
      out.push({ translateX: s.sx });
      out.push({ translateY: s.sy });
    }
    const p = pulseValues.current.get(id);
    if (p) out.push({ scale: p });
    return out;
  }

  /** For SVG endpoints — animated number that equals `base + sway`. */
  function animX(id: string, baseX: number): Animated.AnimatedInterpolation<number> | number {
    const s = swayRef.current.get(id);
    if (!s) return baseX;
    return Animated.add(new Animated.Value(baseX), s.sx) as unknown as Animated.AnimatedInterpolation<number>;
  }
  function animY(id: string, baseY: number): Animated.AnimatedInterpolation<number> | number {
    const s = swayRef.current.get(id);
    if (!s) return baseY;
    return Animated.add(new Animated.Value(baseY), s.sy) as unknown as Animated.AnimatedInterpolation<number>;
  }

  // Build parent→child edges (drives the static line web).
  interface EdgeDef { fromId: string; toId: string; opacity: number }
  const edges = useMemo<EdgeDef[]>(() => {
    const list: EdgeDef[] = [];
    for (const n of MENU_NODES) {
      if (n.parentId) list.push({ fromId: n.parentId, toId: n.id, opacity: n.tier === 2 ? 0.45 : 0.3 });
    }
    for (const [id, p] of dataPositions) {
      list.push({ fromId: p.parentId, toId: id, opacity: 0.12 });
    }
    return list;
  }, [dataPositions]);

  const activeNode = activeId === CENTER_NODE.id
    ? CENTER_NODE
    : MENU_NODES.find((n) => n.id === activeId) ?? null;
  const activeBase = activeNode
    ? (activeNode.id === CENTER_NODE.id ? { x: cx, y: cy } : positions.get(activeNode.id))
    : null;

  function handleConfirm() {
    if (!activeNode?.href) return;
    const href = activeNode.href;
    setActiveId(null);
    router.push(href);
  }

  function handleBubbleAction() {
    if (!activeNode?.bubbleAction) return;
    if (activeNode.bubbleAction === "jarvis") {
      setActiveId(null);
      router.push("/jarvis");
    } else if (activeNode.bubbleAction === "upload") {
      setActiveId(null);
      router.push("/capture");
    }
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Animated edges — endpoints track each node's drift. */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {edges.map((e, i) => {
          const fromBase = e.fromId === CENTER_NODE.id
            ? { x: cx, y: cy }
            : positions.get(e.fromId) ?? dataPositions.get(e.fromId);
          const toBase = e.toId === CENTER_NODE.id
            ? { x: cx, y: cy }
            : positions.get(e.toId) ?? dataPositions.get(e.toId);
          if (!fromBase || !toBase) return null;
          return (
            <AnimatedLine
              key={i}
              x1={animX(e.fromId, fromBase.x) as unknown as number}
              y1={animY(e.fromId, fromBase.y) as unknown as number}
              x2={animX(e.toId, toBase.x) as unknown as number}
              y2={animY(e.toId, toBase.y) as unknown as number}
              stroke={darkSky.accent}
              strokeOpacity={e.opacity}
              strokeWidth={1}
            />
          );
        })}
      </Svg>

      {/* Tier 4 data dots — base position static, transform handles drift */}
      {Array.from(dataPositions.entries()).map(([id, p]) => (
        <Animated.View
          key={id}
          pointerEvents="none"
          style={[
            styles.dataDot,
            { left: p.x - 2.5, top: p.y - 2.5, transform: swayTransform(id) as never },
          ]}
        />
      ))}

      {/* Tier 2 + 3 dots */}
      {MENU_NODES.map((n) => {
        const base = positions.get(n.id);
        if (!base) return null;
        const color = tierTone(n.tier);
        const size = tierSize(n.tier);
        return (
          <Animated.View
            key={n.id}
            style={[
              styles.menuDotWrap,
              {
                left: base.x - size / 2,
                top: base.y - size / 2,
                width: size,
                height: size,
                transform: swayTransform(n.id) as never,
              },
            ]}
          >
            <Pressable
              onPress={() => setActiveId(n.id === activeId ? null : n.id)}
              hitSlop={14}
              accessibilityLabel={n.label[locale]}
              style={[styles.menuDot, { backgroundColor: color, borderColor: color, width: size, height: size, borderRadius: size / 2 }]}
            />
          </Animated.View>
        );
      })}

      {/* Center (tier 1) */}
      <Animated.View
        style={[
          styles.menuDotWrap,
          {
            left: cx - 26,
            top: cy - 26,
            width: 52,
            height: 52,
            transform: swayTransform(CENTER_NODE.id) as never,
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

      {/* Bubble */}
      {activeNode && activeBase ? (
        <View
          style={[
            styles.bubble,
            {
              left: Math.max(16, Math.min(width - 16 - 260, activeBase.x - 130)),
              top: activeBase.y > cy ? activeBase.y - 150 : activeBase.y + 30,
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.bubbleBody}>
            <View style={styles.bubbleHead}>
              <Text variant="caption" color="brand" style={styles.bubbleLabel}>
                {activeNode.label[locale]}
              </Text>
              {activeNode.bubbleAction ? (
                <Pressable onPress={handleBubbleAction} hitSlop={8} style={styles.bubbleIcon}>
                  <Text style={styles.bubbleIconText}>
                    {activeNode.bubbleAction === "jarvis" ? "💬" : "+"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
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
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill as object },
  menuDotWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  menuDot: {
    borderWidth: 1,
    shadowColor: "#7FB3F4",
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  dataDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(127,179,244,0.6)",
  },
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
  bubble: { position: "absolute", width: 260 },
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
  bubbleHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bubbleLabel: { letterSpacing: 1 },
  bubbleIcon: {
    backgroundColor: darkSky.brand,
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  bubbleIconText: { color: darkSky.bg, fontSize: 14, fontWeight: "800" },
  bubbleDesc: { marginTop: 6, color: darkSky.text, fontSize: 13, lineHeight: 18 },
  bubbleAsk: { marginTop: 6, fontSize: 11, letterSpacing: 0.5 },
  bubbleActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  bubbleBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: "center", borderWidth: 1,
  },
  bubbleBtnYes: { backgroundColor: darkSky.brand, borderColor: darkSky.brand },
  bubbleBtnYesText: { color: darkSky.bg, fontWeight: "700", fontSize: 13 },
  bubbleBtnNo: { backgroundColor: "transparent", borderColor: darkSky.border },
  bubbleBtnNoText: { color: darkSky.textMuted, fontSize: 13 },
});
