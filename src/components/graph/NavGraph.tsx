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
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageStyle,
} from "react-native";
import Svg, { Line } from "react-native-svg";
import { router, type Href } from "expo-router";
import ReAnimated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { Text } from "@/components/ui/Text";
import { cosmic } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { pitchForTier, playPop } from "@/lib/audio/pop";
import { useConnectionGlow } from "@/components/motion/useSignatureMotion";
import { prefersReducedMotion } from "@/lib/motion/signature";

import { IslandArt, type IslandId } from "@/components/art/IslandArt";
import { TierIcon, DOMAIN_TIER_ICON } from "@/components/art/TierIcon";
import { WorkerSprite, type WorkerId } from "@/components/art/WorkerSprite";
import { getPersona } from "@/lib/chat/personas";
import { relatedEdges } from "@/lib/graph/relatedness";
import { VILLAGE_UI } from "@/lib/village-ui";
import { CharacterPathLayer, type Commute } from "./CharacterPathLayer";
import { CrewLayer } from "./CrewLayer";
import { useCrewCount } from "@/lib/settings/crew-density";
import { getEnv } from "@/lib/env";
import { V3_CREW_ART, V3_DATA_PNG, V3_DATA_PNG_DEFAULT, V3_LOG_PNG_DEFAULT } from "@/lib/assets/soulcore-v3";
import { PremiumButton, StatTile } from "@/components/premium";
import { clampPan, clampPanFree, clampScale, panForFocalZoom, cameraOffHome } from "./zoom-math";
import { tierVisibility } from "./tier-visibility";
import { patternLinkStyle } from "@/lib/graph/pattern-link";
import { worldMenuPositions, worldDataPositions, worldToScreen, sectorFocus } from "./world-layout";

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
// Spawn-once guard. Was sessionStorage("navGraphSpawned_v1"), but sessionStorage
// is absent on native, so the tier-ordered "뽁" spawn replayed on every return
// to "/" — that is the BACK-from-village "나의 중심" pop this redesign removes.
// A module-level flag survives route remounts within the JS session on web AND
// native, so a return snaps straight to the settled graph.
let navGraphSpawnPlayed = false;
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
  /**
   * Which graph node this piece hangs under — a tier-2 village id
   * ("work" | "relation" | "knowledge" | "records" | "imagine" | "taste")
   * chosen from the piece's tags, or a tier-3 wiki node. Defaults to
   * wiki-daily when unknown.
   */
  parentId?: string;
  /** The piece's tags — drives both domain placement and relatedness edges. */
  tags?: readonly string[];
  /** AI summary (sources.frontmatter.summary) — shown in the piece popup on tap. */
  summary?: string;
}

// Authoritative menu graph. Tier ↑ size ↑ brightness ↑.
//
// graph-restructure (C4): tier 2 is six village districts ("동네"), each a
// floating island whose art matches its meaning. Tier 3 are the few real
// sub-places under a district, revealed only when you zoom/select. Routes are
// unchanged so every existing screen stays reachable.
export const MENU_NODES: readonly NavNode[] = [
  // Tier 2 — five Pattern Cores around the Soul Core (worldview v-final). The
  // former "imagine" core was removed: 공상 is now SecondB's Divergent mode.
  { id: "work", tier: 2, parentId: "core", href: { pathname: "/records", params: { domain: "work" } },
    label: { en: "Growth Core", ko: "일과 성장" },
    description: { en: "Where the pieces that move today's you gather: work and growth.", ko: "오늘의 나를 움직이는 일과 성장의 조각들이 모이는 곳이에요." } },
  { id: "relation", tier: 2, parentId: "core", href: { pathname: "/records", params: { domain: "relation" } },
    label: { en: "Bond Core", ko: "관계와 사랑" },
    description: { en: "Where memories, promises, and conversations with people connect.", ko: "사람들과의 기억, 약속, 대화 조각이 이어지는 곳이에요." } },
  { id: "knowledge", tier: 2, parentId: "core", href: "/wiki", bubbleAction: "upload",
    label: { en: "Wisdom Core", ko: "배움과 지식" },
    description: { en: "Where what you've learned and understood stacks up as knowledge.", ko: "배우고 이해한 것들이 지식 조각으로 쌓이는 곳이에요." } },
  { id: "records", tier: 2, parentId: "core", href: { pathname: "/records", params: { domain: "records" } },
    label: { en: "Narrative Core", ko: "기록 보관소" },
    description: { en: "Where every piece you've kept gathers so you can find it again.", ko: "남긴 모든 조각이 다시 찾아볼 수 있게 모이는 곳이에요." } },
  { id: "taste", tier: 2, parentId: "core", href: { pathname: "/records", params: { domain: "taste" } },
    label: { en: "Muse Core", ko: "취향과 영감" },
    description: { en: "Where the things you like, are drawn to, and find inspiring gather.", ko: "좋아하는 것, 끌리는 것, 영감의 조각이 모이는 곳이에요." } },

  // Tier 3 — real sub-places under a district; revealed on zoom/selection.
  { id: "wiki-daily", tier: 3, parentId: "knowledge", href: "/wiki",
    label: { en: "Daily Wiki", ko: "일상 지식" },
    description: { en: "Everyday notes and captures.", ko: "일상의 메모와 자료." } },
  { id: "wiki-pro", tier: 3, parentId: "knowledge", href: "/wiki",
    label: { en: "Pro Wiki", ko: "일·전문 지식" },
    description: { en: "Career-side references.", ko: "일·전문 쪽 자료." } },
  { id: "past-childhood", tier: 3, parentId: "relation", href: "/interview",
    label: { en: "Childhood", ko: "유년기" },
    description: { en: "Before 12.", ko: "12세 이전." } },
  { id: "past-teens", tier: 3, parentId: "relation", href: "/interview",
    label: { en: "Teens", ko: "10대" },
    description: { en: "12–19.", ko: "12–19세." } },
  { id: "past-twenties", tier: 3, parentId: "relation", href: "/interview",
    label: { en: "Twenties", ko: "20대" },
    description: { en: "20–29.", ko: "20–29세." } },
  { id: "past-thirties", tier: 3, parentId: "relation", href: "/interview",
    label: { en: "Thirties", ko: "30대" },
    description: { en: "30–39.", ko: "30–39세." } },
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
  label: { en: "Soul Core", ko: "나의 중심" },
  // Core Brain speaks as the team's voice — calm, plural ("우리 / we"),
  // owns the cells. Surface this everywhere the user lands first.
  description: {
    en: "Center of you. The small ones and I keep your pieces in order.",
    ko: "여기가 너의 중심이야. 작은 친구들이랑 함께 조각들을 정리해두고 있어.",
  },
};

// Floating pixel island art per node (premium closing pack). Decorative
// node artwork mapped onto the existing graph nodes; tier 1 + 2 get islands,
// tier 3/4 keep the lighter node/shard art so the mobile view isn't busy.
const ISLAND_FOR: Record<string, IslandId> = {
  core: "core",
  work: VILLAGE_UI.work.island,
  relation: VILLAGE_UI.relation.island,
  knowledge: VILLAGE_UI.knowledge.island,
  records: VILLAGE_UI.records.island,
  taste: VILLAGE_UI.taste.island,
};

// Domain → worker mapping (worldview v-final, authoritative). Internal worker
// ids (archi/gadi/lulu/momo/lumi/secondb) are unchanged; display names moved:
//   일과 성장 = Archon, 관계와 사랑 = Relia, 배움과 지식 = Lumen,
//   기록 보관소 = Foreman Momo, 취향과 영감 = Iris,
//   나의 중심 = SecondB. Worker glow matches the core accent.
const VILLAGE_WORKER: Record<string, WorkerId> = {
  work: VILLAGE_UI.work.worker,
  relation: VILLAGE_UI.relation.worker,
  knowledge: VILLAGE_UI.knowledge.worker,
  records: VILLAGE_UI.records.worker,
  taste: VILLAGE_UI.taste.worker,
};

type PatrolPoint = { x: number; y: number; angle: number };

function aroundVillage(p: PatrolPoint, radial: number, tangent: number): { x: number; y: number } {
  const rx = Math.cos(p.angle);
  const ry = Math.sin(p.angle);
  const tx = -Math.sin(p.angle);
  const ty = Math.cos(p.angle);
  return { x: p.x + rx * radial + tx * tangent, y: p.y + ry * radial + ty * tangent };
}

function aroundHub(center: { x: number; y: number }, angle: number, radius: number, tangent: number): { x: number; y: number } {
  const rx = Math.cos(angle);
  const ry = Math.sin(angle);
  const tx = -Math.sin(angle);
  const ty = Math.cos(angle);
  return { x: center.x + rx * radius + tx * tangent, y: center.y + ry * radius + ty * tangent };
}

function curvedMid(a: { x: number; y: number }, b: { x: number; y: number }, curve: number): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: (a.x + b.x) / 2 + (-dy / len) * curve, y: (a.y + b.y) / 2 + (dx / len) * curve };
}

function tierSize(t: Tier): number {
  // UI/UX overhaul §5 node sizes (touch target met via hitSlop).
  if (t === 1) return 88;
  if (t === 2) return 64;
  if (t === 3) return 48;
  return 12;
}

// Pattern Link depth palette (worldview v-final §8: "가까운 데이터일수록 두껍고 밝음").
// Edges nearer the center (lower child tier) read bright mint; deeper tiers shift
// cooler (blue -> violet) so the link layers read as a neural signal path. Width
// + per-edge opacity already fall off with depth; this adds the color layer.
// Flag-gated in render — the legacy mint edge is unchanged when the flag is off.
function v3EdgeColor(childTier: Tier): string {
  return childTier <= 2 ? cosmic.signalMint : childTier === 3 ? cosmic.signalBlue : cosmic.soulViolet;
}

// Center (tier 1) size — kept as a named constant since the center node
// is positioned with explicit offsets in JSX.
const CENTER_SIZE = tierSize(1);

// Premium HQ core art scale (asset-replacement pass). The new core_center
// HQ piece reads "heavier" than the old clean core, so it's drawn at ~1.0x
// (≈60% of the previous 1.7x footprint) — the center should anchor the
// village, not dominate it. The offset re-centers any overflow:
// left/top = -(scale-1)/2 * box, which is 0 at scale 1.0.
const CORE_ART_SCALE = 1.0;
const CORE_ART_OFFSET = (-CENTER_SIZE * (CORE_ART_SCALE - 1)) / 2;

// Domain / tier-3 island art overflows its node box so a village reads larger
// than its hit target. Scaled down 1.7 -> 1.5 (2026-06-01) so the six villages
// breathe on the home view; the offset re-centers the oversized art on the box
// (left/top = (1 - scale)/2 * size).
const ISLAND_ART_SCALE = 1.5;
const ISLAND_ART_OFFSET = (1 - ISLAND_ART_SCALE) / 2;
// Match graph residents to the rendered village art scale. At 22% of the
// tier-2 island art, a worker reads around twice the height of the records
// archive desk, consistent with the village detail scale.
const GRAPH_WORKER_TO_ISLAND_SCALE = 0.22;
const GRAPH_WORKER_SIZE = Math.round(tierSize(2) * ISLAND_ART_SCALE * GRAPH_WORKER_TO_ISLAND_SCALE);

function seeded(id: string, salt: number): number {
  let h = 5381 + salt * 31;
  for (let i = 0; i < id.length; i++) h = (h * 33) ^ id.charCodeAt(i);
  return ((h >>> 0) % 10000) / 10000;
}

interface Props {
  locale: "en" | "ko";
  dataNodes: readonly DataNode[];
  /** Highlight-on-return (queue B): a node/wiki-page id to focus when the
   *  user arrives from a record / wiki detail via "그래프에서 보기". */
  highlightId?: string | null;
  /** Ambient glow (graph-restructure C6): a domain id the top ribbon is
   *  talking about. Glows that island + lights its edge to the center WITHOUT
   *  opening a sheet or dimming the rest. */
  glowNodeId?: string | null;
}

export function NavGraph({ locale, dataNodes, highlightId, glowNodeId }: Props) {
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height / 2;

  // Decorative crew count (worldview v-final "모모크루"). Scales with the user's
  // on-graph Log nodes, bounded by the density preference + LOD. The crew sprite
  // render is wired when the assets land; CrewLayer draws nothing until then.
  const { count: crewCount, animated: crewAnimated } = useCrewCount(dataNodes.length);
  // v3 momo-crew sprites behind EXPO_PUBLIC_USE_V3_ART. Default off →
  // renderV3Crew is undefined → CrewLayer renders nothing (current behavior).
  const useV3Art = getEnv().EXPO_PUBLIC_USE_V3_ART;
  // Tier 3 (Pattern Data) / Tier 4 (Log) v3 node art — flag-gated; off keeps the
  // legacy TierIcon metaphor icons (book / paper / heart …) untouched. The final
  // candidate art ships as PNG, so these render via <Image> (contain + pixelated,
  // no blur/opacity) rather than an SVG component — Tier 3 per parent domain
  // (V3_DATA_PNG), Tier 4 a single Log chip (V3_LOG_PNG_DEFAULT).
  // imageRendering is web-only CSS, absent from RN's ImageStyle type.
  const navPixelated = { imageRendering: "pixelated" } as unknown as ImageStyle;
  const renderV3Crew = useV3Art
    ? (i: number, sz: number) => {
        const Crew = V3_CREW_ART[i % V3_CREW_ART.length];
        return <Crew width={sz} height={sz} />;
      }
    : undefined;

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

  // Web-only scroll-to-zoom (graph-ux #12): the mouse wheel / trackpad zooms
  // toward the cursor, reusing the SAME focal math as the pinch gesture so
  // wheel + pinch + pan stay one coherent camera model. Attached to the
  // non-transformed outer box, whose getBoundingClientRect shares the focal
  // space of the pinch's focalX/focalY. preventDefault stops the page itself
  // from scrolling while the graph zooms. Native is a no-op (touch pinch only).
  const outerRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = outerRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const focal = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = Math.exp(-e.deltaY * 0.0015); // down = out, up = in
      const next = clampScale(zoomScale.value * factor);
      if (next === zoomScale.value) return; // already pinned at a zoom bound
      const newPan = panForFocalZoom(zoomScale.value, next, focal, {
        x: zoomPanX.value,
        y: zoomPanY.value,
      });
      const clamped = clampPanFree(newPan, next, {
        width: zoomViewportW.value,
        height: zoomViewportH.value,
      });
      zoomScale.value = next;
      zoomPanX.value = clamped.x;
      zoomPanY.value = clamped.y;
      // Sync the gesture baseline so a following pinch/pan continues from the
      // wheel-adjusted camera instead of snapping back to the last saved view.
      zoomSavedScale.value = next;
      zoomSavedPanX.value = clamped.x;
      zoomSavedPanY.value = clamped.y;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [
    zoomScale,
    zoomPanX,
    zoomPanY,
    zoomSavedScale,
    zoomSavedPanX,
    zoomSavedPanY,
    zoomViewportW,
    zoomViewportH,
  ]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      "worklet";
      const next = clampScale(zoomSavedScale.value * e.scale);
      const focal = { x: e.focalX, y: e.focalY };
      const prevPan = { x: zoomSavedPanX.value, y: zoomSavedPanY.value };
      const newPan = panForFocalZoom(zoomSavedScale.value, next, focal, prevPan);
      const clamped = clampPanFree(newPan, next, {
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

  // 1-finger pan (closeout-v3 #3): drag anywhere to move freely — even out
  // into cosmic space past the village (soft bounds via clampPanFree). A small
  // activation distance lets node Pressables still receive taps.
  const panGesture = Gesture.Pan()
    .minDistance(8)
    .onUpdate((e) => {
      "worklet";
      const proposed = {
        x: zoomSavedPanX.value + e.translationX,
        y: zoomSavedPanY.value + e.translationY,
      };
      const clamped = clampPanFree(proposed, zoomScale.value, {
        width: zoomViewportW.value,
        height: zoomViewportH.value,
      });
      zoomPanX.value = clamped.x;
      zoomPanY.value = clamped.y;
    })
    .onEnd((e) => {
      "worklet";
      const projected = {
        x: zoomPanX.value + e.velocityX * 0.05,
        y: zoomPanY.value + e.velocityY * 0.05,
      };
      const clamped = clampPanFree(projected, zoomScale.value, {
        width: zoomViewportW.value,
        height: zoomViewportH.value,
      });
      zoomPanX.value = withSpring(clamped.x, { damping: 24, stiffness: 180, mass: 0.7 });
      zoomPanY.value = withSpring(clamped.y, { damping: 24, stiffness: 180, mass: 0.7 });
      zoomSavedPanX.value = clamped.x;
      zoomSavedPanY.value = clamped.y;
    });

  // Reset the camera to the home view (closeout-v3 #4): used by double-tap AND
  // the floating "원래대로" button. Spring so the village snaps home elastically.
  const resetCamera = () => {
    zoomScale.value = withSpring(1, { damping: 22, stiffness: 170, mass: 0.7 });
    zoomPanX.value = withSpring(0, { damping: 22, stiffness: 170, mass: 0.7 });
    zoomPanY.value = withSpring(0, { damping: 22, stiffness: 170, mass: 0.7 });
    zoomSavedScale.value = 1;
    zoomSavedPanX.value = 0;
    zoomSavedPanY.value = 0;
  };

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(16)
    .onEnd(() => {
      "worklet";
      runOnJS(resetCamera)();
    });

  // Track whether the camera is far from home so the reset button can fade in
  // (closeout-v3 #4). The worklet only pushes a JS update when the boolean flips.
  const [offHome, setOffHome] = useState(false);
  const lastOffRef = useRef(false);
  const pushOffHome = (v: boolean) => {
    if (lastOffRef.current !== v) {
      lastOffRef.current = v;
      setOffHome(v);
    }
  };
  useDerivedValue(() => {
    const { off } = cameraOffHome({ x: zoomPanX.value, y: zoomPanY.value }, zoomScale.value);
    runOnJS(pushOffHome)(off);
    return off;
  });

  // Programmatic camera move (graph-ux-overhaul #6/#10): spring the village so
  // a world point lands at a chosen screen Y (default viewport center). When a
  // bottom sheet will cover the lower part of the screen we aim the point into
  // the *visible* upper area instead, so the focused village fills the space
  // ABOVE the sheet rather than hiding behind it. Springs are gentle + low
  // overshoot (#9: small amplitude, no dizziness).
  const focusWorldPoint = (wx: number, wy: number, targetScale: number, screenY?: number) => {
    const vp = { width: zoomViewportW.value, height: zoomViewportH.value };
    const s = worldToScreen({ x: wx, y: wy }, vp);
    const targetY = screenY ?? cy;
    const want = clampPan(
      { x: cx - s.x * targetScale, y: targetY - s.y * targetScale },
      targetScale,
      vp,
    );
    const spring = { damping: 22, stiffness: 170, mass: 0.7 };
    zoomScale.value = withSpring(targetScale, spring);
    zoomPanX.value = withSpring(want.x, spring);
    zoomPanY.value = withSpring(want.y, spring);
    zoomSavedScale.value = targetScale;
    zoomSavedPanX.value = want.x;
    zoomSavedPanY.value = want.y;
  };

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

  // World-coordinate layout (queue A): the village lives in a fixed
  // 1200×1600 world and is fitted into the viewport, so districts keep
  // their place as you pan/zoom (mobile-graph pack §3). The world ring
  // arrangement is computed once; only the world→screen fit depends on the
  // viewport. The world center maps exactly to the viewport center, so the
  // tier-1 lamp stays at (cx, cy) and the rest of the gesture / clamp /
  // spawn / sheet machinery is unchanged.
  const worldMenu = useMemo(() => worldMenuPositions(MENU_NODES, CENTER_NODE.id), []);

  const positions = useMemo(() => {
    const vp = { width, height };
    const map = new Map<string, { x: number; y: number; angle: number }>();
    for (const [id, wp] of worldMenu) {
      const s = worldToScreen({ x: wp.x, y: wp.y }, vp);
      map.set(id, { x: s.x, y: s.y, angle: wp.angle });
    }
    return map;
  }, [worldMenu, width, height]);

  // Tier 4 data positions — clustered around their wiki parent in world
  // space, then fitted to the viewport.
  const dataPositions = useMemo(() => {
    const vp = { width, height };
    const worldData = worldDataPositions(dataNodes, worldMenu);
    const out = new Map<string, { x: number; y: number; parentId: string }>();
    for (const [id, wd] of worldData) {
      const s = worldToScreen({ x: wd.x, y: wd.y }, vp);
      out.set(id, { x: s.x, y: s.y, parentId: wd.parentId });
    }
    return out;
  }, [dataNodes, worldMenu, width, height]);

  // Worker commutes (graph-ux-overhaul #2): each companion endlessly travels
  // between villages along the real spokes (village → center → village →
  // center). Because the only tier-2 edges are center↔village, every
  // village-to-village hop routes through the center — a true node-line-node
  // patrol. Built in the same screen-fitted coords NavGraph renders nodes in.
  const commutes = useMemo<Commute[]>(() => {
    const center = { x: cx, y: cy };
    const placed = Object.keys(VILLAGE_WORKER)
      .map((id) => {
        const p = positions.get(id);
        return p ? { id, x: p.x, y: p.y, angle: p.angle } : null;
      })
      .filter((v): v is { id: string; x: number; y: number; angle: number } => v !== null);

    const out: Commute[] = [];
    for (let i = 0; i < placed.length; i++) {
      const here = placed[i];
      const next = placed[(i + 1) % placed.length];
      // village → center → neighbour village → center; the closed ring loops
      // back home, so the worker shuttles between two villages via the hub.
      const side = i % 2 === 0 ? 1 : -1;
      const herePorch = aroundVillage(here, -34, 22 * side);
      const hereLane = aroundVillage(here, -92, 48 * side);
      const hubEntry = aroundHub(center, here.angle, 88, -18 * side);
      const hubExit = aroundHub(center, next.angle, 88, 18 * side);
      const nextLane = aroundVillage(next, -92, -48 * side);
      const nextPorch = aroundVillage(next, -34, -22 * side);
      const returnArc = curvedMid(nextPorch, herePorch, 54 * side);
      out.push({
        id: VILLAGE_WORKER[here.id],
        route: [herePorch, hereLane, hubEntry, hubExit, nextLane, nextPorch, returnArc],
      });
    }

    // SecondB circles the hub instead of cutting through it, so the center
    // feels alive without a large sprite repeatedly crossing the core art.
    const tour = placed.map((p, k) => aroundHub(center, p.angle, k % 2 === 0 ? 72 : 108, k % 2 === 0 ? 18 : -18));
    out.push({ id: "secondb", route: tour.length >= 2 ? tour : [center, { x: cx + 60, y: cy - 30 }] });

    return out;
  }, [positions, cx, cy]);

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
    const alreadyPlayed = navGraphSpawnPlayed;

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
        navGraphSpawnPlayed = true;
      }
    };
    void run();
    return () => { cancelled = true; };
    // Re-run only when the set of data nodes changes (e.g. after the
    // wiki fetch lands). The set comparison via dataPositions identity
    // is cheap and a fresh stream resets the show.
  }, [dataPositions]);

  const [activeId, setActiveId] = useState<string | null>(null);
  // Highlight-on-return (queue B): a tier-4 shard the user came back to see.
  const [highlightDataId, setHighlightDataId] = useState<string | null>(null);

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
    const b: 0 | 1 | 2 = s < 1.15 ? 0 : s < 1.8 ? 1 : 2;
    runOnJS(pushBucket)(b);
    return b;
  });
  const vis = tierVisibility(bucket < 1 ? 0.5 : bucket < 2 ? 1.5 : 2.0);
  // Pattern Link proximity → edge weight (worldview v-final): zoomed-in (bucket
  // 2) reads "closer" so edges thicken; zoomed-out stays thin. Recomputed when
  // the zoom bucket flips (rare), so it's a live but render-cheap signal.
  const linkStyle = patternLinkStyle(bucket / 2);
  const nodeVisible = (tier: Tier): boolean =>
    tier === 1 ? vis.tier1 : tier === 2 ? vis.tier2 : tier === 3 ? vis.tier3 : vis.tier4;

  // Soft tier fade (graph-ux-overhaul #8): instead of tier 3/4 popping in/out
  // at the zoom threshold, ramp their opacity quickly (~180ms) and keep them
  // mounted through the fade-out via `mounted` flags. Tied to the zoom bucket.
  const tier3Fade = useRef(new Animated.Value(vis.tier3 ? 1 : 0)).current;
  const tier4Fade = useRef(new Animated.Value(vis.tier4 ? 1 : 0)).current;
  const [tier3Mounted, setTier3Mounted] = useState(vis.tier3);
  const [tier4Mounted, setTier4Mounted] = useState(vis.tier4);
  useEffect(() => {
    if (vis.tier3) setTier3Mounted(true);
    Animated.timing(tier3Fade, { toValue: vis.tier3 ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false })
      .start(() => { if (!vis.tier3) setTier3Mounted(false); });
  }, [vis.tier3, tier3Fade]);
  useEffect(() => {
    if (vis.tier4) setTier4Mounted(true);
    Animated.timing(tier4Fade, { toValue: vis.tier4 ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false })
      .start(() => { if (!vis.tier4) setTier4Mounted(false); });
  }, [vis.tier4, tier4Fade]);
  const tierOf = (id: string): Tier =>
    id === CENTER_NODE.id ? 1 : MENU_NODES.find((n) => n.id === id)?.tier ?? 4;
  const idVisible = (id: string): boolean => nodeVisible(tierOf(id));

  // Highlight-on-return (queue B): when the screen mounts with a highlight id
  // (from a record / wiki detail "그래프에서 보기"), focus it. A menu/center
  // node opens its bottom sheet (reusing the focus + edge highlight); a
  // tier-4 shard reveals tier 4 and pulses for a moment so the user lands on
  // exactly the piece they tapped.
  useEffect(() => {
    if (!highlightId) return;
    if (highlightId === CENTER_NODE.id || MENU_NODES.some((n) => n.id === highlightId)) {
      setActiveId(highlightId);
      return;
    }
    if (!dataPositions.has(highlightId)) return;
    setHighlightDataId(highlightId);
    // Reveal tier-4 shards so the highlighted one is on screen.
    const revealed = Math.max(zoomScale.value, 1.25);
    zoomScale.value = revealed;
    zoomSavedScale.value = revealed;
    const v = pulseValues.current.get(highlightId);
    if (v) {
      Animated.sequence([
        Animated.timing(v, { toValue: 1.9, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(v, { toValue: 1.0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.delay(400),
        Animated.timing(v, { toValue: 1.6, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(v, { toValue: 1.0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]).start();
    }
    const t = setTimeout(() => setHighlightDataId(null), 2800);
    return () => clearTimeout(t);
  }, [highlightId, dataPositions, zoomScale, zoomSavedScale]);

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

  // Centered village zoom-in overlay (graph-transition redesign): tapping a
  // village island fills the screen center with that island, smoothly scaling
  // in, while the graph recedes behind a soft dim. Decoupled from the pan/zoom
  // camera so it can truly fill + center any district regardless of the camera
  // clamp. The same island PNG renders on the village detail (SceneHero), so
  // pressing 살펴보기 crossfades (route animation:"fade") from this overlay into
  // the detail with visual continuity. zoomMountId keeps the island mounted
  // through the fade-out.
  const zoomIslandId = activeId && ISLAND_FOR[activeId] ? activeId : null;
  const zoomReveal = useRef(new Animated.Value(0)).current;
  const [zoomMountId, setZoomMountId] = useState<string | null>(null);
  useEffect(() => {
    const reduce = prefersReducedMotion();
    if (zoomIslandId) {
      setZoomMountId(zoomIslandId);
      Animated.timing(zoomReveal, {
        toValue: 1,
        duration: reduce ? 0 : 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(zoomReveal, {
        toValue: 0,
        duration: reduce ? 0 : 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setZoomMountId(null);
      });
    }
  }, [zoomIslandId, zoomReveal]);

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
    // Relatedness edges (2026-05-31): connect pieces that share tags so the
    // graph shows actual associations between what the user added, not just
    // the parent→child hierarchy. Only between data nodes currently on stage.
    const relatable = dataNodes
      .filter((d) => dataPositions.has(d.id))
      .map((d) => ({ id: d.id, tags: d.tags ?? [] }));
    for (const e of relatedEdges(relatable, { minShared: 2, maxPerNode: 3 })) {
      // Slightly brighter than the faint parent→shard line, scaled by how
      // many tags they share, so stronger associations read stronger.
      const opacity = Math.min(0.34, 0.16 + e.weight * 0.06);
      list.push({ fromId: e.from, toId: e.to, opacity, key: `rel:${e.from}~${e.to}` });
    }
    return list;
  }, [dataPositions, dataNodes]);

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

  // A tapped tier-4 piece (data node) — distinct from the structural menu nodes
  // above. Drives the piece popup (summary + hashtags + 자세히).
  const activeDataNode = useMemo(
    () => (activeId && !activeNode ? dataNodes.find((d) => d.id === activeId) ?? null : null),
    [activeId, activeNode, dataNodes],
  );

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
  // Dim predicate combining focus (activeId) and highlight-on-return.
  const dimFor = (id: string): boolean =>
    highlightDataId != null ? id !== highlightDataId : activeId != null && !isRelated(id);

  // Village type label per tier (overhaul §6/§7 sheet "노드 타입").
  const typeLabel = (tier: Tier): string => {
    if (tier === 1) return locale === "ko" ? "나의 중심" : "Soul Core";
    if (tier === 2) return locale === "ko" ? "패턴 코어" : "Pattern Core";
    if (tier === 3) return locale === "ko" ? "패턴 데이터" : "Pattern Data";
    return locale === "ko" ? "기록 조각" : "Log";
  };

  // Tap a node (graph-ux-overhaul #6). For a tier-2 village we spring the
  // camera so its sector fills the screen, then open the sheet. Tapping the
  // same node again (or a non-domain node) just toggles the sheet.
  function handleNodeTap(id: string) {
    const willOpen = id !== activeId;
    setActiveId(willOpen ? id : null);
    if (!willOpen) return;
    // Village islands (the six tier-2 districts + the center) get the centered
    // zoom-in overlay below instead of a camera spring: the overlay fills the
    // screen with the island, so moving the graph camera behind it is both
    // unnecessary and fights the pan clamp at high fill scales.
    if (ISLAND_FOR[id]) return;
    // Tier-3 sub-places keep the gentle sector focus into the upper area so the
    // tapped place sits above the bottom sheet (#9/#10).
    const wp = worldMenu.get(id);
    const focus = wp ? sectorFocus(wp, MENU_NODES.filter((n) => n.tier === 2).length) : null;
    if (focus) {
      focusWorldPoint(focus.focus.x, focus.focus.y, 1.5, height * 0.38);
    }
  }

  function handleLook() {
    if (!activeNode?.href) return;
    const href = activeNode.href;
    // Crossfade into the village detail (route animation:"fade") with the
    // zoomed island still on screen, so the big island resolves into the
    // detail's hero (same PNG). Clear the focus AFTER the detail has taken over
    // so a later BACK returns to a clean, settled graph. ~360ms ≈ the platform
    // fade; tunable.
    router.push(href);
    setTimeout(() => setActiveId(null), 360);
  }

  function handleAskSecondB() {
    // Graph node → chat handoff: pass the node label (context pill, chat pack
    // §7) AND the domain's companion so the chat opens in that character's
    // voice (2026-05-31 directive). Center node → SecondB (no worker param).
    const label = activeNode?.label[locale];
    const worker = activeId ? VILLAGE_WORKER[activeId] : undefined;
    setActiveId(null);
    const params: Record<string, string> = {};
    if (label) params.fromNode = label;
    if (worker) params.character = worker;
    router.push(Object.keys(params).length > 0 ? { pathname: "/jarvis", params } : "/jarvis");
  }

  function handleImagine() {
    // Worldview v-final: 공상 is no longer a place — it's SecondB's Divergent
    // chat mode. "공상으로 펼치기" opens the node in /jarvis with mode=divergent.
    const label = activeNode?.label[locale];
    setActiveId(null);
    const params: Record<string, string> = { mode: "divergent" };
    if (label) params.fromNode = label;
    router.push({ pathname: "/jarvis", params });
  }

  // "자세히" on a piece popup → open the piece's village screen, the space that
  // lists that village's classified pieces (2026-06-02 directive).
  function handlePieceDetail() {
    const village = activeDataNode
      ? MENU_NODES.find((n) => n.id === activeDataNode.parentId)
      : null;
    setActiveId(null);
    router.push(village?.href ?? "/records");
  }

  // Fill size for the centered zoom-in island: large but fully visible above
  // the bottom sheet ("크게 / 전체 보임"). Tunable on device.
  const zoomFillSize = Math.min(width * 0.92, height * 0.5);

  return (
    <View ref={outerRef} style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <GestureDetector gesture={composedGesture}>
      <ReAnimated.View style={[styles.root, zoomAnimatedStyle]}>
      {/* Full-size transparent hit surface (graph-ux #6): an opaque-to-touch
          layer spanning the whole graph so pan/pinch register from ANY empty
          area, not only on island art. Node Pressables render later (on top)
          so their taps still win; this only catches the gaps. */}
      <View style={StyleSheet.absoluteFill} />
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
          // C6: edge to the ambient-glow domain stays lit (no active needed).
          const glowIncident = glowNodeId != null && (e.fromId === glowNodeId || e.toId === glowNodeId);
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
                stroke={useV3Art ? v3EdgeColor(tierOf(e.toId)) : cosmic.signalMint}
                strokeOpacity={animOpacity}
                strokeWidth={linkStyle.strokeWidth}
              />
              {/* 연결된 edge만 signal-mint 하이라이트 (§7) + C6 ambient glow. */}
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
              ) : glowIncident ? (
                <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={cosmic.signalMint} strokeOpacity={0.7} strokeWidth={2} />
              ) : null}
            </Fragment>
          );
        })}
      </Svg>

      {/* Tier 4 data shards — fade in/out with zoom (§5 + graph-ux #8). */}
      {tier4Mounted
        ? Array.from(dataPositions.entries()).map(([id, p]) => (
            <Animated.View
              key={id}
              style={[
                styles.shardWrap,
                {
                  left: p.x - 9,
                  top: p.y - 9,
                  opacity: tier4Fade as never,
                  transform: swayTransform(id) as never,
                },
                id === highlightDataId ? styles.shardHighlight : null,
                dimFor(id) ? styles.dimmed : null,
              ]}
            >
              {/* Each data shard is one of the user's classified pieces. Tapping
                  it opens the piece popup (summary + hashtags + 자세히). */}
              <Pressable
                onPress={() => handleNodeTap(id)}
                hitSlop={14}
                accessibilityLabel={dataNodes.find((d) => d.id === id)?.title ?? "piece"}
              >
                {useV3Art ? (
                  <Image
                    source={V3_LOG_PNG_DEFAULT}
                    style={[{ width: 18, height: 18 }, navPixelated]}
                    resizeMode="contain"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                ) : (
                  <TierIcon id={p.parentId.startsWith("wiki") ? "book_wiki" : "cube_data"} size={18} />
                )}
              </Pressable>
            </Animated.View>
          ))
        : null}

      {/* Tier 2 + 3 nodes — pixel-object art; tier 3 fades with zoom (§5 + #8) */}
      {MENU_NODES.map((n) => {
        // Tier 3 stays mounted through its fade-out; tier 2 is always shown.
        if (n.tier === 3 ? !tier3Mounted : !nodeVisible(n.tier)) return null;
        const base = positions.get(n.id);
        if (!base) return null;
        const size = tierSize(n.tier);
        const dim = dimFor(n.id);
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
                opacity: (n.tier === 3 ? tier3Fade : spawnOpacity(n.id)) as never,
                transform: swayTransform(n.id) as never,
              },
            ]}
          >
            <View
              style={[
                styles.nodeArtWrap,
                n.id === activeId || n.id === glowNodeId ? styles.nodeFocused : null,
                dim ? styles.dimmed : null,
              ]}
            >
              {ISLAND_FOR[n.id] ? (
                <IslandArt id={ISLAND_FOR[n.id]!} size={size * ISLAND_ART_SCALE} style={{ position: "absolute", left: size * ISLAND_ART_OFFSET, top: size * ISLAND_ART_OFFSET }} />
              ) : useV3Art ? (
                // v3: Tier-3 = Pattern Data tesseract (flag on), tinted per parent domain.
                <Image
                  source={V3_DATA_PNG[n.parentId ?? ""] ?? V3_DATA_PNG_DEFAULT}
                  style={[{ width: size, height: size }, navPixelated]}
                  resizeMode="contain"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              ) : (
                // Tier-3 nodes are pieces, not robots (closeout-v3 #9): show the
                // parent domain's signature tier icon (book / paper / heart …).
                <TierIcon id={DOMAIN_TIER_ICON[n.parentId ?? ""] ?? "cube_data"} size={size} />
              )}
              <Pressable
                onPress={() => handleNodeTap(n.id)}
                hitSlop={14}
                accessibilityLabel={n.label[locale]}
                style={StyleSheet.absoluteFill}
              />
            </View>
            {/* Village name tag (2026-05-31): tier-2 islands carry a pixel
                name plate so first-time users can read what each village is
                straight from the main graph. Tier-3 nodes get theirs only
                when zoomed in (label shown in the bottom sheet on tap). */}
            {n.tier === 2 ? (
              <View style={styles.villageTag} pointerEvents="none">
                <Text style={styles.villageTagText} numberOfLines={1}>
                  {n.label[locale]}
                </Text>
              </View>
            ) : null}
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
            dimFor(CENTER_NODE.id) ? styles.dimmed : null,
          ]}
        >
          <IslandArt id="core" size={CENTER_SIZE * CORE_ART_SCALE} style={{ position: "absolute", left: CORE_ART_OFFSET, top: CORE_ART_OFFSET }} />
          <Pressable
            onPress={() => handleNodeTap(CENTER_NODE.id)}
            hitSlop={20}
            accessibilityLabel={CENTER_NODE.label[locale]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </Animated.View>

      {/* Working residents — render LAST inside the transform so they walk
          ABOVE the island/node art (graph-ux #5: were hidden behind islands)
          yet still below the screen-fixed bottom sheet / FAB (#1). When a
          node sheet is open we hide them so nothing floats over the popup. */}
      <CharacterPathLayer commutes={commutes} hidden={activeId != null} locale={locale} spriteSize={GRAPH_WORKER_SIZE} />
      {/* Decorative Narrative crew (worldview v-final). Hidden while a sheet is
          open; renders nothing until the GPT crew sprites land (renderCrew slot). */}
      <CrewLayer count={crewCount} animated={crewAnimated} visible={activeId == null} width={width} height={height} renderCrew={renderV3Crew} />

      </ReAnimated.View>
    </GestureDetector>

      {/* "원래대로" reset button (closeout-v3 #4) — fades in near the top when
          the camera has drifted far from home or zoomed a lot. Same action as
          double-tap. Screen-fixed; doesn't steal graph gestures. */}
      {offHome ? (
        <View style={styles.resetWrap} pointerEvents="box-none">
          <Pressable onPress={() => resetCamera()} style={styles.resetBtn} accessibilityRole="button" accessibilityLabel={locale === "ko" ? "원래대로" : "Reset view"}>
            <Text variant="caption" style={styles.resetText}>{locale === "ko" ? "원래대로" : "Reset"}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Centered village zoom-in (graph-transition redesign): sits above the
          graph, below the bottom sheet (zIndex). The same island PNG renders on
          the village detail, so 살펴보기 crossfades into it. */}
      {zoomMountId && ISLAND_FOR[zoomMountId] ? (
        <Animated.View pointerEvents="none" style={styles.zoomOverlay}>
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.zoomBackdrop, { opacity: zoomReveal as never }]}
          />
          <Animated.View
            style={[
              styles.zoomIslandWrap,
              {
                opacity: zoomReveal as never,
                transform: [
                  {
                    scale: zoomReveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.86, 1],
                    }) as never,
                  },
                ],
              },
            ]}
          >
            <IslandArt id={ISLAND_FOR[zoomMountId]!} size={zoomFillSize} />
          </Animated.View>
        </Animated.View>
      ) : null}

      {/* Node bottom sheet (§7) — screen-fixed, outside the zoom transform. */}
      {activeNode ? (
        <NodeSheet
          locale={locale}
          name={activeNode.label[locale]}
          type={typeLabel(activeNode.tier)}
          character={activeId ? VILLAGE_WORKER[activeId] ?? "secondb" : "secondb"}
          connectedCount={connectedCount}
          description={activeNode.description[locale]}
          onLook={handleLook}
          onAsk={handleAskSecondB}
          onImagine={handleImagine}
          onClose={() => setActiveId(null)}
        />
      ) : null}

      {/* Piece popup (2026-06-02) — a tapped tier-4 data node shows its summary
          + hashtags and a single 자세히 button. */}
      {activeDataNode ? (
        <DataNodeSheet
          locale={locale}
          title={activeDataNode.title}
          summary={activeDataNode.summary ?? ""}
          tags={activeDataNode.tags ?? []}
          onDetail={handlePieceDetail}
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
  character,
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
  character: WorkerId;
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
          <WorkerSprite id={character} size={32} />
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
      {connectedCount > 0 ? (
        <View style={styles.sheetStats}>
          <StatTile value={connectedCount} label={locale === "ko" ? "연결된 조각" : "connected"} accent={cosmic.signalMint} />
        </View>
      ) : null}
      <View style={styles.sheetActions}>
        <PremiumButton
          label={locale === "ko" ? "살펴보기" : "Look around"}
          variant="primary"
          onPress={onLook}
          style={styles.sheetActionBtn}
        />
        <PremiumButton
          label={
            locale === "ko"
              ? `${getPersona(character).name.ko}에게 묻기`
              : `Ask ${getPersona(character).name.en}`
          }
          variant="secondary"
          onPress={onAsk}
          style={styles.sheetActionBtn}
        />
      </View>
      {/* Optional: unfold this node in the imagine workshop (imagine pack §7) */}
      <Pressable onPress={onImagine} hitSlop={6} style={styles.sheetImagine}>
        <Text variant="caption" color="brand">{locale === "ko" ? "공상 모드로 펼치기" : "Open in Divergent"}</Text>
      </Pressable>
    </Animated.View>
  );
}

// Piece popup for a tapped tier-4 data node: the AI summary + hashtags and a
// single 자세히 button that opens the piece's village (2026-06-02 directive).
function DataNodeSheet({
  locale,
  title,
  summary,
  tags,
  onDetail,
  onClose,
}: {
  locale: "en" | "ko";
  title: string;
  summary: string;
  tags: readonly string[];
  onDetail: () => void;
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
  }, [slide, title]);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Animated.View style={[styles.sheet, { opacity: slide as never, transform: [{ translateY }] }]}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetHead}>
        <Text variant="heading" style={styles.sheetName} numberOfLines={2}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={locale === "ko" ? "닫기" : "Close"}>
          <Text style={styles.sheetClose}>✕</Text>
        </Pressable>
      </View>
      {summary ? (
        <Text variant="body" color="textMuted" style={styles.sheetDesc} numberOfLines={5}>{summary}</Text>
      ) : (
        <Text variant="subtle" color="textSubtle" style={styles.sheetDesc}>
          {locale === "ko" ? "아직 요약이 없어요." : "No summary yet."}
        </Text>
      )}
      {tags.length > 0 ? (
        <View style={styles.dataTagRow}>
          {tags.slice(0, 8).map((t) => (
            <View key={t} style={styles.dataTagChip}>
              <Text style={styles.dataTagText}>#{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.sheetActions}>
        <PremiumButton
          label={locale === "ko" ? "자세히" : "Details"}
          variant="primary"
          onPress={onDetail}
          style={styles.sheetActionBtn}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill as object },
  // Centered village zoom-in overlay (graph → detail transition).
  zoomOverlay: {
    ...(StyleSheet.absoluteFill as object),
    alignItems: "center",
    justifyContent: "center",
    // Bias the island into the area ABOVE the bottom sheet so the popup never
    // covers it ("팝업을 제외한 나머지 화면의 정 중앙"). Tunable on device.
    paddingBottom: "34%",
    zIndex: 18,
  },
  zoomBackdrop: { backgroundColor: "rgba(7,10,24,0.55)" },
  zoomIslandWrap: { alignItems: "center", justifyContent: "center" },
  menuDotWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  nodeArtWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  // Village name plate under each tier-2 island. Pixel face on a dark glass
  // chip with a mint hairline so it reads against the cosmic background while
  // staying in the pixel-art register. Centered under the node; overflows the
  // node box (which is only `size` wide) so the full name shows.
  villageTag: {
    position: "absolute",
    top: "104%",
    left: "50%",
    width: 150,
    marginLeft: -75,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(7,10,24,0.86)",
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.48)",
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  villageTagText: {
    color: cosmic.moonWhite,
    fontFamily: fontFamilies.pixel,
    fontSize: 11,
    letterSpacing: 0,
    textAlign: "center",
  },
  centerArtWrap: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    alignItems: "center",
    justifyContent: "center",
    // closeout-v3 #2: no boxy backing. The no-square Core PNG carries its own
    // glow; the wrapper is a circular, transparent halo so no rectangle shows.
    borderRadius: CENTER_SIZE / 2,
    shadowColor: cosmic.coreGlow,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  resetWrap: { position: "absolute", top: 64, left: 0, right: 0, alignItems: "center", zIndex: 22 },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(13,21,48,0.92)",
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.5)",
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  resetText: { color: cosmic.signalMint, letterSpacing: 0 },
  shardWrap: { position: "absolute", width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  // Highlight-on-return: a mint halo around the shard the user came back to.
  shardHighlight: {
    shadowColor: cosmic.signalMint,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  // Selection states (§7).
  nodeFocused: {
    // Round halo (closeout-v3 #2): no square backing behind focused art.
    borderRadius: 999,
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
    // Above the premium bottom tab bar.
    bottom: 92,
    zIndex: 25,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.44)",
    backgroundColor: "rgba(7,10,24,0.97)",
    padding: 16,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.36,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(114,242,199,0.52)",
    marginBottom: 12,
  },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  sheetName: { flexShrink: 1 },
  sheetClose: { color: cosmic.mistGray, fontSize: 16, paddingHorizontal: 4 },
  sheetMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  sheetType: { letterSpacing: 0 },
  // Readable sans for the long Korean description (closeout-v3 #10).
  sheetDesc: { marginTop: 10, lineHeight: 21, fontFamily: fontFamilies.readable },
  sheetStats: { flexDirection: "row", gap: 16, marginTop: 12 },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  sheetActionBtn: { flex: 1 },
  sheetImagine: { alignSelf: "center", paddingVertical: 10 },
  dataTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  dataTagChip: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.4)",
    backgroundColor: "rgba(114,242,199,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dataTagText: { color: cosmic.signalMint, fontSize: 12, fontFamily: fontFamilies.readable },
});
