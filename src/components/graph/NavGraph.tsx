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
import ReAnimated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { Text } from "@/components/ui/Text";
import { darkSky } from "@/lib/theme/tokens";
import { pitchForTier, playPop } from "@/lib/audio/pop";
import { clampPan, clampScale, panForFocalZoom } from "./zoom-math";

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
  href: "/persona",
  // bubbleAction removed (2026-05-28 user directive): the chat (세컨비)
  // entry moved out of the bubble to a floating button at the bottom-
  // right of the main screen. The bubble now only describes Core Brain.
  label: { en: "Core Brain", ko: "코어 브레인" },
  // Core Brain speaks as the team's voice — calm, plural ("우리 / we"),
  // owns the cells. Surface this everywhere the user lands first.
  description: {
    en: "I'm Core Brain. The cells and I keep track of who you are.",
    ko: "코어 브레인이에요. 세포들과 함께 당신을 정리해 두고 있어요.",
  },
};

function tierTone(t: Tier): string {
  // Per user (2026-05-27): subtle hue separation so tiers feel
  // distinct without breaking the dark-sky monotone. Kept all four
  // inside the cyan→indigo arc so DESIGN.md's 3-color rule holds.
  if (t === 1) return darkSky.brand;        // electric cyan-blue, brightest core
  if (t === 2) return "#7BCBFF";            // sky blue
  if (t === 3) return "#A8A4E0";            // soft indigo
  return "rgba(180,170,235,0.6)";           // faint lilac for tier 4 specks
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
    <GestureDetector gesture={composedGesture}>
      <ReAnimated.View style={[styles.root, zoomAnimatedStyle]} pointerEvents="box-none">
      {/* Animated edges — endpoints track each node's drift. */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {edges.map((e) => {
          const fromBase = e.fromId === CENTER_NODE.id
            ? { x: cx, y: cy }
            : positions.get(e.fromId) ?? dataPositions.get(e.fromId);
          const toBase = e.toId === CENTER_NODE.id
            ? { x: cx, y: cy }
            : positions.get(e.toId) ?? dataPositions.get(e.toId);
          if (!fromBase || !toBase) return null;
          const ev = edgeValues.current.get(e.key);
          const animOpacity = ev
            ? (ev.interpolate({ inputRange: [0, 1], outputRange: [0, e.opacity] }) as unknown as number)
            : 0;
          return (
            <AnimatedLine
              key={e.key}
              x1={animX(e.fromId, fromBase.x) as unknown as number}
              y1={animY(e.fromId, fromBase.y) as unknown as number}
              x2={animX(e.toId, toBase.x) as unknown as number}
              y2={animY(e.toId, toBase.y) as unknown as number}
              stroke={darkSky.accent}
              strokeOpacity={animOpacity}
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
            {
              left: p.x - 2.5,
              top: p.y - 2.5,
              opacity: spawnOpacity(id) as never,
              transform: swayTransform(id) as never,
            },
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
                opacity: spawnOpacity(n.id) as never,
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
            opacity: spawnOpacity(CENTER_NODE.id) as never,
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
        <Animated.View
          style={[
            styles.bubble,
            {
              left: Math.max(16, Math.min(width - 16 - 260, activeBase.x - 130)),
              top: activeBase.y > cy ? activeBase.y - 150 : activeBase.y + 30,
              opacity: bubbleAnim.interpolate({ inputRange: [0, 0.5, 1.2], outputRange: [0, 1, 1] }) as never,
              transform: [{ scale: bubbleAnim }] as never,
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
        </Animated.View>
      ) : null}
      </ReAnimated.View>
    </GestureDetector>
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
