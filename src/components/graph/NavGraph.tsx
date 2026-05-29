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

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import ReAnimated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { Text } from "@/components/ui/Text";
import { cosmic } from "@/lib/theme/tokens";
import { pitchForTier, playPop } from "@/lib/audio/pop";
import { useConnectionGlow } from "@/components/motion/useSignatureMotion";
import { NodeArt, CharacterArt } from "@/components/art/CosmicPixel";
import { clampPan, clampScale, panForFocalZoom } from "./zoom-math";
import { tierVisibility } from "./tier-visibility";

const AnimatedLine = Animated.createAnimatedComponent(Line);

// User directive (2026-05-27): tier-ordered "뽁!" spawn sequence after
// the logo fade completes. Per tier, node order is randomized so two
// visits feel different. Each pop = scale 0 → 1.25 → 1.0 (overshoot)
// + brief "뽁" Web Audio synth tone. When a newly-spawned node has a
// graph relation to a node that's already on stage, its incoming edge
// fades in alongside the pop so the connection appears to "draw itself".
//
// DESIGN.md note: the global rule forbids bounce/elastic easing, but
// the user explicitly asked for the pulse / overshoot feel here. The
// overshoot is small (1.25x → 1.0x, ~400ms total) so it stays inside
// the tight, controlled feel of the rest of the design.
const SPAWN_LOGO_DELAY_MS = 620;     // logo fade is ~750ms; start when it's mostly faded
const SPAWN_SESSION_KEY = "navGraphSpawned_v1";
// Ambient pulse interval — was 4000ms before, user asked for ~30% faster
// so the dots feel a touch more "breathing" without becoming jittery.
const PULSE_INTERVAL_MS = 2800;
// Bubble pop-in (말풍선 뽁) per user (2026-05-27): same overshoot feel as
// the node spawn so the bubble feels emitted from the node.
const BUBBLE_POP_OVERSHOOT_MS = 160;
const BUBBLE_POP_SETTLE_MS = 200;
const SPAWN_STAGGER_HIGH_TIER_MS = 130;
const SPAWN_STAGGER_TIER4_MS = 35;
const SPAWN_TIER_GAP_MS = 110;
const SPAWN_POP_OVERSHOOT_MS = 180;
const SPAWN_POP_SETTLE_MS = 220;
const EDGE_REVEAL_MS = 260;

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
    description: { en: "Today's you — health, app, brain, finance.", ko: "오늘의 당신 — 건강·앱·뇌·재정." } },
  { id: "past", tier: 2, parentId: "core", href: "/interview",
    label: { en: "Past me", ko: "과거의 나" },
    description: { en: "Walk back through your chapters together.", ko: "지난 챕터들을 함께 되짚어요." } },
  { id: "wiki", tier: 2, parentId: "core", href: "/wiki", bubbleAction: "upload",
    label: { en: "Wiki", ko: "Wiki" },
    description: { en: "Your knowledge — drop anything in.", ko: "당신의 지식 — 뭐든 던지면 우리가 정리해 둘게요." } },
  // 공상 동네 — Vela's atelier. Phase 1 lands the scaffold + nav entry;
  // generation pipeline arrives in Phase 3.
  { id: "imagine", tier: 2, parentId: "core", href: "/imagine",
    label: { en: "Imagine", ko: "공상" },
    description: {
      en: "Lay a vague thought out as scenes. Vela's workshop.",
      ko: "막연한 생각을 장면으로 펼쳐보는 곳. 벨라의 작업실이에요.",
    },
  },

  // Tier 3 — children of present/past/wiki
  { id: "wiki-daily", tier: 3, parentId: "wiki", href: "/wiki",
    label: { en: "Daily Wiki", ko: "일상 Wiki" },
    description: { en: "Everyday notes and captures.", ko: "일상의 메모와 자료." } },
  { id: "wiki-pro", tier: 3, parentId: "wiki", href: "/wiki",
    label: { en: "Pro Wiki", ko: "Pro Wiki" },
    description: { en: "Career-side references.", ko: "일·전문 쪽 자료." } },
  { id: "past-childhood", tier: 3, parentId: "past", href: "/interview",
    label: { en: "Childhood", ko: "유년기" },
    description: { en: "Before 12.", ko: "12세 이전." } },
  { id: "past-teens", tier: 3, parentId: "past", href: "/interview",
    label: { en: "Teens", ko: "10대" },
    description: { en: "12–19.", ko: "12–19세." } },
  { id: "past-twenties", tier: 3, parentId: "past", href: "/interview",
    label: { en: "Twenties", ko: "20대" },
    description: { en: "20–29.", ko: "20–29세." } },
  { id: "past-thirties", tier: 3, parentId: "past", href: "/interview",
    label: { en: "Thirties", ko: "30대" },
    description: { en: "30–39.", ko: "30–39세." } },
  { id: "insights", tier: 3, parentId: "now", href: "/insights",
    label: { en: "Insights", ko: "인사이트" },
    description: { en: "Patterns we noticed.", ko: "우리가 알아챈 패턴." } },
] as const;

export const CENTER_NODE: NavNode = {
  id: "core",
  tier: 1,
  href: "/core-brain",
  // bubbleAction removed (2026-05-28 user directive): the chat (세컨비)
  // entry moved out of the bubble to a floating button at the bottom-
  // right of the main screen. The bubble now only describes Core Brain.
  // Dev name stays "Core Brain"; user-facing label uses the village
   // wording "나의 중심" / "Center of me" (handoff §7-2).
  label: { en: "Center of me", ko: "나의 중심" },
  // Core Brain speaks as the team's voice — calm, plural ("우리 / we"),
  // owns the cells. Surface this everywhere the user lands first.
  description: {
    en: "Center of you. The small ones and I keep your pieces in order.",
    ko: "여기가 너의 중심이야. 작은 친구들이랑 함께 조각들을 정리해두고 있어.",
  },
};

function tierSize(t: Tier): number {
  // UI/UX overhaul §5 node sizes (touch target met via hitSlop).
  if (t === 1) return 88;
  if (t === 2) return 64;
  if (t === 3) return 48;
  return 12;
}

// Center (tier 1) size — kept as a named constant since the center node
// is positioned with explicit offsets in JSX.
const CENTER_SIZE = tierSize(1);

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

  // Zoom + pan — pinch to scale, 2-finger pan to translate. The root
  // ReAnimated.View applies the transform; individual node positions /
  // drift / pulse animations are unchanged (they live in graph space).
  // Single-tap on a node is preserved because pan requires 2 pointers
  // (minPointers(2)).
  //
  // Web wheel-to-zoom + mouse drag pan are intentionally out of scope
  // for this PR — gesture-handler covers native + web touch already.
  // Wheel handling is a follow-up.
  const zoomScale = useSharedValue(1);
  const zoomPanX = useSharedValue(0);
  const zoomPanY = useSharedValue(0);
  const zoomSavedScale = useSharedValue(1);
  const zoomSavedPanX = useSharedValue(0);
  const zoomSavedPanY = useSharedValue(0);
  const zoomViewportW = useSharedValue(width);
  const zoomViewportH = useSharedValue(height);
  useEffect(() => {
    zoomViewportW.value = width;
    zoomViewportH.value = height;
  }, [width, height, zoomViewportW, zoomViewportH]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      "worklet";
      const next = clampScale(zoomSavedScale.value * e.scale);
      const focal = { x: e.focalX, y: e.focalY };
      const prevPan = { x: zoomSavedPanX.value, y: zoomSavedPanY.value };
      const newPan = panForFocalZoom(zoomSavedScale.value, next, focal, prevPan);
      const clamped = clampPan(newPan, next, {
        width: zoomViewportW.value,
        height: zoomViewportH.value,
      });
      zoomScale.value = next;
      zoomPanX.value = clamped.x;
      zoomPanY.value = clamped.y;
    })
    .onEnd(() => {
      "worklet";
      zoomSavedScale.value = zoomScale.value;
      zoomSavedPanX.value = zoomPanX.value;
      zoomSavedPanY.value = zoomPanY.value;
    });

  // 2-finger pan only — leaves 1-finger taps to the node Pressables.
  const panGesture = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => {
      "worklet";
      const proposed = {
        x: zoomSavedPanX.value + e.translationX,
        y: zoomSavedPanY.value + e.translationY,
      };
      const clamped = clampPan(proposed, zoomScale.value, {
        width: zoomViewportW.value,
        height: zoomViewportH.value,
      });
      zoomPanX.value = clamped.x;
      zoomPanY.value = clamped.y;
    })
    .onEnd(() => {
      "worklet";
      zoomSavedPanX.value = zoomPanX.value;
      zoomSavedPanY.value = zoomPanY.value;
    });

  // Double-tap to reset zoom + pan to the home view.
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      "worklet";
      zoomScale.value = 1;
      zoomPanX.value = 0;
      zoomPanY.value = 0;
      zoomSavedScale.value = 1;
      zoomSavedPanX.value = 0;
      zoomSavedPanY.value = 0;
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    doubleTapGesture,
  );

  const zoomAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: zoomPanX.value },
      { translateY: zoomPanY.value },
      { scale: zoomScale.value },
    ],
  }));

  // Tier layout — concentric rings, children kept near their parent's
  // angle so the parent→child line web reads as branching out.
  const positions = useMemo(() => {
    const minDim = Math.min(width, height);
    // Rings widened from 0.22 / 0.36 to make room for the larger §5 node
    // sizes so districts don't overlap the bigger center lamp.
    const ring2 = minDim * 0.30;
    const ring3 = minDim * 0.46;

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
    const ring4 = minDim * 0.6;
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
  // Spawn anim per node — 0 (hidden) → 1.25 (overshoot) → 1.0 (settled).
  // Drives both transform scale and opacity for the pop-in effect.
  const spawnValues = useRef<Map<string, Animated.Value>>(new Map());
  // Edge fade-in anim per edge key — 0..1, multiplied into edge opacity.
  // Triggered when both endpoints are in `spawnedIds`.
  const edgeValues = useRef<Map<string, Animated.Value>>(new Map());
  const [spawnedIds, setSpawnedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ids = [CENTER_NODE.id, ...MENU_NODES.map((n) => n.id), ...Array.from(dataPositions.keys())];
    for (const id of ids) {
      if (!driftValues.current.has(id)) {
        // Seamless drift loop. Previously the value swung 0↔1↔0 via a
        // 2-step sequence, but the seeded starting value (0..1) meant
        // the first cycle began mid-curve and the loop re-entry from
        // 0 back to 0 of the next cycle could jerk visibly. The fix:
        //   - single linear 0→1 loop (no sequence, no rebound)
        //   - cosine/sine output ranges where input 0 and input 1 map
        //     to the SAME output value, so loop wrap is continuous
        //   - X uses cosine, Y uses sine with phase offset → soft
        //     lissajous figure instead of a back-and-forth line
        const v = new Animated.Value(0);
        driftValues.current.set(id, v);
        const duration = 14000 + seeded(id, 6) * 6000; // 14–20s per cycle, gentler than before
        Animated.loop(
          Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: false }),
        ).start();
        // 9-point cosine/sine table — input 0 and input 1 are exactly
        // equal so the loop's wrap-around is invisible.
        const amp = 5 + seeded(id, 7) * 2; // 5..7 px sway
        const phase = seeded(id, 8) * Math.PI * 2;
        const cosTable = (offset: number) => {
          const pts = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
            (i) => Math.cos((i / 8) * Math.PI * 2 + offset) * amp,
          );
          return {
            inputRange: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
            outputRange: pts,
          };
        };
        const sinTable = (offset: number) => {
          const pts = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
            (i) => Math.sin((i / 8) * Math.PI * 2 + offset) * (amp * 0.7),
          );
          return {
            inputRange: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
            outputRange: pts,
          };
        };
        swayRef.current.set(id, {
          sx: v.interpolate(cosTable(phase)),
          sy: v.interpolate(sinTable(phase + Math.PI / 3)),
        });
      }
      if (!pulseValues.current.has(id)) {
        pulseValues.current.set(id, new Animated.Value(1));
      }
    }
  }, [dataPositions]);

  // Spawn sequence — tier 1 → 2 → 3 → 4, randomized within each tier.
  // Each node: play "뽁!" pop sound + scale 0 → 1.25 → 1.0 + opacity 0 → 1.
  //
  // Session guard (2026-05-27 bug fix): playing the full pop sequence
  // every time the user re-navigates back to "/" — e.g. coming back
  // from /jarvis or /capture — meant the cells popped & beeped on
  // every return. Now we mark the sequence as played in sessionStorage
  // for the rest of the tab session; subsequent mounts snap straight
  // to the settled state with no audio.
  useEffect(() => {
    const allIds = [CENTER_NODE.id, ...MENU_NODES.map((n) => n.id), ...Array.from(dataPositions.keys())];
    let alreadyPlayed = false;
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SPAWN_SESSION_KEY) === "1") {
        alreadyPlayed = true;
      }
    } catch { /* ignore — Private mode, native, etc. */ }

    for (const id of allIds) {
      if (!spawnValues.current.has(id)) {
        spawnValues.current.set(id, new Animated.Value(alreadyPlayed ? 1 : 0));
      } else if (alreadyPlayed) {
        spawnValues.current.get(id)!.setValue(1);
      }
    }

    if (alreadyPlayed) {
      // Snap visible: mark every id as spawned (drives edges) and skip
      // the queue/audio entirely.
      setSpawnedIds(new Set(allIds));
      return;
    }

    let cancelled = false;
    const run = async () => {
      await delay(SPAWN_LOGO_DELAY_MS);
      // Group ids by tier so each tier reveals together.
      const byTier: Record<1 | 2 | 3 | 4, string[]> = { 1: [], 2: [], 3: [], 4: [] };
      byTier[1].push(CENTER_NODE.id);
      for (const n of MENU_NODES) byTier[n.tier].push(n.id);
      for (const id of dataPositions.keys()) byTier[4].push(id);

      for (const tier of [1, 2, 3, 4] as const) {
        if (cancelled) return;
        const ids = shuffleInPlace([...byTier[tier]]);
        const stagger = tier === 4 ? SPAWN_STAGGER_TIER4_MS : SPAWN_STAGGER_HIGH_TIER_MS;
        const volume = tier === 4 ? 0.05 : tier === 1 ? 0.22 : 0.16;
        for (const id of ids) {
          if (cancelled) return;
          playPop(pitchForTier(tier), volume);
          setSpawnedIds((prev) => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
          });
          const v = spawnValues.current.get(id);
          if (v) {
            Animated.sequence([
              Animated.timing(v, { toValue: 1.25, duration: SPAWN_POP_OVERSHOOT_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }),
              Animated.timing(v, { toValue: 1.0, duration: SPAWN_POP_SETTLE_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
            ]).start();
          }
          await delay(stagger);
        }
        await delay(SPAWN_TIER_GAP_MS);
      }
      if (!cancelled) {
        try { sessionStorage.setItem(SPAWN_SESSION_KEY, "1"); } catch { /* ignore */ }
      }
    };
    void run();
    return () => { cancelled = true; };
    // Re-run only when the set of data nodes changes (e.g. after the
    // wiki fetch lands). The set comparison via dataPositions identity
    // is cheap and a fresh stream resets the show.
  }, [dataPositions]);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Zoom-driven tier visibility (overhaul §5). Mirror the live pinch scale
  // into a coarse 0/1/2 bucket on the JS thread; the worklet only pushes a
  // state update when the bucket actually changes, so renders stay rare.
  const [bucket, setBucket] = useState<0 | 1 | 2>(1);
  const lastBucketRef = useRef<0 | 1 | 2>(1);
  const pushBucket = (b: 0 | 1 | 2) => {
    if (lastBucketRef.current !== b) {
      lastBucketRef.current = b;
      setBucket(b);
    }
  };
  useDerivedValue(() => {
    // Inline thresholds (must stay worklet-safe — mirrors scaleBucket()).
    const s = zoomScale.value;
    const b: 0 | 1 | 2 = s < 0.65 ? 0 : s < 1.1 ? 1 : 2;
    runOnJS(pushBucket)(b);
    return b;
  });
  const vis = tierVisibility(bucket < 1 ? 0.5 : bucket < 2 ? 1.0 : 1.5);
  const nodeVisible = (tier: Tier): boolean =>
    tier === 1 ? vis.tier1 : tier === 2 ? vis.tier2 : tier === 3 ? vis.tier3 : vis.tier4;
  const tierOf = (id: string): Tier =>
    id === CENTER_NODE.id ? 1 : MENU_NODES.find((n) => n.id === id)?.tier ?? 4;
  const idVisible = (id: string): boolean => nodeVisible(tierOf(id));

  // 연결 발견 / "아치 라인 켜짐" — when a node is focused, its incident
  // edges light up in signal-mint (overhaul §7 "연결된 edge만 signal-mint로
  // 하이라이트") and unrelated nodes/edges dim. The glow fades dim → bright
  // over ~500ms.
  const { opacity: connGlow, light: lightConnections } = useConnectionGlow();
  useEffect(() => {
    if (activeId != null) lightConnections();
  }, [activeId, lightConnections]);

  // Bubble pop-in anim — 0 (hidden) → 1.2 (overshoot) → 1.0 (settled).
  // Re-triggered whenever activeId switches to a non-null value, so
  // tapping a different node makes the new bubble pop in.
  const bubbleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (activeId == null) {
      bubbleAnim.setValue(0);
      return;
    }
    bubbleAnim.setValue(0);
    playPop(pitchForTier(2), 0.14);
    Animated.sequence([
      Animated.timing(bubbleAnim, { toValue: 1.2, duration: BUBBLE_POP_OVERSHOOT_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(bubbleAnim, { toValue: 1.0, duration: BUBBLE_POP_SETTLE_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]).start();
  }, [activeId, bubbleAnim]);

  useEffect(() => {
    const id = setInterval(() => {
      // Pulse a random tier-2 or tier-3 node, skipping the active one.
      // Interval shortened ~30% per user (2026-05-27).
      const candidates = MENU_NODES.filter((n) => n.id !== activeId);
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (!pick) return;
      const v = pulseValues.current.get(pick.id);
      if (!v) return;
      Animated.sequence([
        Animated.timing(v, { toValue: 1.18, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(v, { toValue: 1.0, duration: 360, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]).start();
    }, PULSE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeId]);

  function swayTransform(id: string): unknown {
    // RN's transform union is fiddly to satisfy at compile time, but
    // the runtime contract is "array of single-key transform objects".
    // Each entry below is exactly one such object. Multiple `scale`
    // entries compose multiplicatively, which is exactly what we want:
    // spawn pop scale × ambient pulse scale.
    const s = swayRef.current.get(id);
    const out: Array<Record<string, Animated.AnimatedInterpolation<number> | Animated.Value>> = [];
    if (s) {
      out.push({ translateX: s.sx });
      out.push({ translateY: s.sy });
    }
    const sp = spawnValues.current.get(id);
    if (sp) out.push({ scale: sp });
    const p = pulseValues.current.get(id);
    if (p) out.push({ scale: p });
    return out;
  }

  /** Spawn opacity (0..1) — used to keep nodes invisible until their pop fires. */
  function spawnOpacity(id: string): Animated.Value | number {
    const v = spawnValues.current.get(id);
    if (!v) return 0;
    return v.interpolate({
      inputRange: [0, 0.4, 1],
      outputRange: [0, 1, 1],
    }) as unknown as Animated.Value;
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
  interface EdgeDef { fromId: string; toId: string; opacity: number; key: string }
  const edges = useMemo<EdgeDef[]>(() => {
    const list: EdgeDef[] = [];
    for (const n of MENU_NODES) {
      if (n.parentId) {
        list.push({ fromId: n.parentId, toId: n.id, opacity: n.tier === 2 ? 0.45 : 0.3, key: `${n.parentId}->${n.id}` });
      }
    }
    for (const [id, p] of dataPositions) {
      list.push({ fromId: p.parentId, toId: id, opacity: 0.12, key: `${p.parentId}->${id}` });
    }
    return list;
  }, [dataPositions]);

  // Edge fade-in: when both endpoints have spawned, ramp the edge's
  // 0..1 multiplier to 1 over EDGE_REVEAL_MS. This is what makes the
  // line "draw itself" as a new node pops in next to a node that's
  // already on stage.
  useEffect(() => {
    for (const e of edges) {
      if (!edgeValues.current.has(e.key)) {
        edgeValues.current.set(e.key, new Animated.Value(0));
      }
      const v = edgeValues.current.get(e.key)!;
      const bothShown = spawnedIds.has(e.fromId) && spawnedIds.has(e.toId);
      // Animated.Value's last value isn't observable; instead we track
      // it on the value itself via a private field. Cheap and avoids a
      // parallel Map of last-values.
      const tagged = v as Animated.Value & { __target?: number };
      if (bothShown && tagged.__target !== 1) {
        tagged.__target = 1;
        Animated.timing(v, { toValue: 1, duration: EDGE_REVEAL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
      }
    }
  }, [spawnedIds, edges]);

  const activeNode = activeId === CENTER_NODE.id
    ? CENTER_NODE
    : MENU_NODES.find((n) => n.id === activeId) ?? null;

  // Neighbours of the focused node — drives edge highlight + node dimming
  // (overhaul §7). Also the "연결된 조각 수" the sheet reports.
  const activeNeighbors = useMemo(() => {
    const s = new Set<string>();
    if (activeId == null) return s;
    for (const e of edges) {
      if (e.fromId === activeId) s.add(e.toId);
      else if (e.toId === activeId) s.add(e.fromId);
    }
    return s;
  }, [activeId, edges]);
  const connectedCount = activeNeighbors.size;
  const isRelated = (id: string): boolean =>
    activeId == null || id === activeId || activeNeighbors.has(id);

  // Village type label per tier (overhaul §6/§7 sheet "노드 타입").
  const typeLabel = (tier: Tier): string => {
    if (tier === 1) return locale === "ko" ? "나의 중심" : "Center";
    if (tier === 2) return locale === "ko" ? "동네" : "District";
    if (tier === 3) return locale === "ko" ? "나의 모습" : "A side of me";
    return locale === "ko" ? "생각 조각" : "Fragment";
  };

  function handleLook() {
    if (!activeNode?.href) return;
    const href = activeNode.href;
    setActiveId(null);
    router.push(href);
  }

  function handleAskSecondB() {
    // Graph node → chat handoff: pass the node label so the chat opens in
    // its nodeContext state with a context pill (chat pack §7).
    const label = activeNode?.label[locale];
    setActiveId(null);
    router.push(label ? { pathname: "/jarvis", params: { fromNode: label } } : "/jarvis");
  }

  function handleImagine() {
    // Graph node → imagine handoff (imagine pack §7): seed the workshop.
    const label = activeNode?.label[locale];
    setActiveId(null);
    router.push(label ? { pathname: "/imagine", params: { fromNode: label } } : "/imagine");
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <GestureDetector gesture={composedGesture}>
      <ReAnimated.View style={[styles.root, zoomAnimatedStyle]} pointerEvents="box-none">
      {/* Animated edges — endpoints track each node's drift. */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {edges.map((e) => {
          // Tier-gating (§5): hide edges whose endpoints aren't shown.
          if (!idVisible(e.fromId) || !idVisible(e.toId)) return null;
          const fromBase = e.fromId === CENTER_NODE.id
            ? { x: cx, y: cy }
            : positions.get(e.fromId) ?? dataPositions.get(e.fromId);
          const toBase = e.toId === CENTER_NODE.id
            ? { x: cx, y: cy }
            : positions.get(e.toId) ?? dataPositions.get(e.toId);
          if (!fromBase || !toBase) return null;
          const incident = activeId != null && (e.fromId === activeId || e.toId === activeId);
          // §7: when a node is focused, dim the unrelated edges.
          const dimFactor = activeId != null && !incident ? 0.22 : 1;
          const ev = edgeValues.current.get(e.key);
          const animOpacity = ev
            ? (ev.interpolate({ inputRange: [0, 1], outputRange: [0, e.opacity * dimFactor] }) as unknown as number)
            : 0;
          const x1 = animX(e.fromId, fromBase.x) as unknown as number;
          const y1 = animY(e.fromId, fromBase.y) as unknown as number;
          const x2 = animX(e.toId, toBase.x) as unknown as number;
          const y2 = animY(e.toId, toBase.y) as unknown as number;
          return (
            <Fragment key={e.key}>
              <AnimatedLine
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={cosmic.signalMint}
                strokeOpacity={animOpacity}
                strokeWidth={1}
              />
              {/* 연결된 edge만 signal-mint 하이라이트 (§7). */}
              {incident ? (
                <AnimatedLine
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={cosmic.signalMint}
                  strokeOpacity={
                    connGlow.interpolate({ inputRange: [0.25, 1], outputRange: [0.4, 0.95] }) as unknown as number
                  }
                  strokeWidth={2}
                />
              ) : null}
            </Fragment>
          );
        })}
      </Svg>

      {/* Tier 4 data shards — only when zoomed in (§5). */}
      {vis.tier4
        ? Array.from(dataPositions.entries()).map(([id, p]) => (
            <Animated.View
              key={id}
              pointerEvents="none"
              style={[
                styles.shardWrap,
                {
                  left: p.x - 7,
                  top: p.y - 7,
                  opacity: spawnOpacity(id) as never,
                  transform: swayTransform(id) as never,
                },
                activeId != null && !isRelated(id) ? styles.dimmed : null,
              ]}
            >
              <NodeArt tier={4} size={14} />
            </Animated.View>
          ))
        : null}

      {/* Tier 2 + 3 nodes — pixel-object art; tier 3 gated by zoom (§5) */}
      {MENU_NODES.map((n) => {
        if (!nodeVisible(n.tier)) return null;
        const base = positions.get(n.id);
        if (!base) return null;
        const size = tierSize(n.tier);
        const dim = activeId != null && !isRelated(n.id);
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
                opacity: spawnOpacity(n.id) as never,
                transform: swayTransform(n.id) as never,
              },
            ]}
          >
            <View
              style={[
                styles.nodeArtWrap,
                n.id === activeId ? styles.nodeFocused : null,
                dim ? styles.dimmed : null,
              ]}
            >
              <NodeArt tier={n.tier} size={size} />
              <Pressable
                onPress={() => setActiveId(n.id === activeId ? null : n.id)}
                hitSlop={14}
                accessibilityLabel={n.label[locale]}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </Animated.View>
        );
      })}

      {/* Center (tier 1) */}
      <Animated.View
        style={[
          styles.menuDotWrap,
          {
            left: cx - CENTER_SIZE / 2,
            top: cy - CENTER_SIZE / 2,
            width: CENTER_SIZE,
            height: CENTER_SIZE,
            opacity: spawnOpacity(CENTER_NODE.id) as never,
            transform: swayTransform(CENTER_NODE.id) as never,
          },
        ]}
      >
        <View
          style={[
            styles.centerArtWrap,
            CENTER_NODE.id === activeId ? styles.nodeFocused : null,
            activeId != null && !isRelated(CENTER_NODE.id) ? styles.dimmed : null,
          ]}
        >
          <NodeArt tier={1} size={CENTER_SIZE} />
          <Pressable
            onPress={() => setActiveId(CENTER_NODE.id === activeId ? null : CENTER_NODE.id)}
            hitSlop={20}
            accessibilityLabel={CENTER_NODE.label[locale]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </Animated.View>

      </ReAnimated.View>
    </GestureDetector>

      {/* Node bottom sheet (§7) — screen-fixed, outside the zoom transform. */}
      {activeNode ? (
        <NodeSheet
          locale={locale}
          name={activeNode.label[locale]}
          type={typeLabel(activeNode.tier)}
          connectedCount={connectedCount}
          description={activeNode.description[locale]}
          onLook={handleLook}
          onAsk={handleAskSecondB}
          onImagine={handleImagine}
          onClose={() => setActiveId(null)}
        />
      ) : null}
    </View>
  );
}

// Bottom sheet shown when a node is focused. Slides up from the bottom and
// stays screen-fixed (it is rendered outside the zoom/pan transform).
function NodeSheet({
  locale,
  name,
  type,
  connectedCount,
  description,
  onLook,
  onAsk,
  onImagine,
  onClose,
}: {
  locale: "en" | "ko";
  name: string;
  type: string;
  connectedCount: number;
  description: string;
  onLook: () => void;
  onAsk: () => void;
  onImagine: () => void;
  onClose: () => void;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide, name]);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Animated.View style={[styles.sheet, { opacity: slide as never, transform: [{ translateY }] }]}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetHead}>
        <View style={styles.sheetTitleRow}>
          {/* 아치 — connection guide, appears on the highlight moment (§9) */}
          <CharacterArt id="archi" size={28} />
          <Text variant="heading" style={styles.sheetName}>{name}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={locale === "ko" ? "닫기" : "Close"}>
          <Text style={styles.sheetClose}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.sheetMetaRow}>
        <Text variant="caption" color="brand" style={styles.sheetType}>{type}</Text>
        {connectedCount > 0 ? (
          <Text variant="subtle" color="textMuted">
            {locale === "ko" ? `연결된 조각 ${connectedCount}개` : `${connectedCount} connected`}
          </Text>
        ) : null}
      </View>
      <Text variant="body" color="textMuted" style={styles.sheetDesc}>{description}</Text>
      <View style={styles.sheetActions}>
        <Pressable onPress={onLook} style={[styles.sheetBtn, styles.sheetBtnPrimary]}>
          <Text style={styles.sheetBtnPrimaryText}>{locale === "ko" ? "살펴보기" : "Look around"}</Text>
        </Pressable>
        <Pressable onPress={onAsk} style={[styles.sheetBtn, styles.sheetBtnSecondary]}>
          <Text style={styles.sheetBtnSecondaryText}>{locale === "ko" ? "세컨비에게 묻기" : "Ask SecondB"}</Text>
        </Pressable>
      </View>
      {/* Optional: unfold this node in the imagine workshop (imagine pack §7) */}
      <Pressable onPress={onImagine} hitSlop={6} style={styles.sheetImagine}>
        <Text variant="caption" color="brand">{locale === "ko" ? "공상으로 펼치기" : "Open in imagine"}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill as object },
  menuDotWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  nodeArtWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  centerArtWrap: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    alignItems: "center",
    justifyContent: "center",
    // Core Brain = 나의 중심 = village central lamp glow (§7-2).
    shadowColor: cosmic.coreGlow,
    shadowOpacity: 0.8,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  shardWrap: { position: "absolute", width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  // Selection states (§7).
  nodeFocused: {
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.95,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  dimmed: { opacity: 0.28 },
  // Node bottom sheet (§7) — screen-fixed, slides up from the bottom.
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 24,
    zIndex: 25,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(141,152,184,0.28)",
    backgroundColor: "rgba(13,21,48,0.96)",
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: cosmic.lineDim,
    marginBottom: 12,
  },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  sheetName: { flexShrink: 1 },
  sheetClose: { color: cosmic.mistGray, fontSize: 16, paddingHorizontal: 4 },
  sheetMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  sheetType: { letterSpacing: 1 },
  sheetDesc: { marginTop: 10, lineHeight: 20 },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  sheetImagine: { alignSelf: "center", paddingVertical: 10 },
  sheetBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", borderWidth: 1 },
  sheetBtnPrimary: { backgroundColor: cosmic.signalMint, borderColor: cosmic.signalMint },
  sheetBtnPrimaryText: { color: cosmic.space950, fontWeight: "700", fontSize: 14 },
  sheetBtnSecondary: { backgroundColor: "transparent", borderColor: cosmic.lineDim },
  sheetBtnSecondaryText: { color: cosmic.moonWhite, fontSize: 14 },
});
