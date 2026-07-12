/**
 * rev2 constellation home — 1:1 port of the prototype's sb-home.jsx over the
 * sb-data.jsx STARS geometry (280×230 box, 북극성 overhanging at y=-16):
 * astronomically-honest Big Dipper (bowl 커리어→재정→관계→성장, handle down to
 * 뮤지엄) with the pointer stars' dashed guide to 북극성, the pinned 세컨비 head
 * with its speech bubble BELOW (소개 intro → star line + 여행하기 / head-tap menu
 * 챗봇·비서), and the top-left inbox bell. The stage paints the prototype's
 * radial washes + a static port of its neural field over the shared SbStarfield.
 *
 * Star brightness stays live (starLevels/northStarBrightness from
 * loadDomainLevels); the opacity curve is the prototype's 0.36 + L/5×0.64.
 */
import { Fragment, memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, Line, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { keepAllKo } from "@/lib/i18n/keep-all";
import { fontFamilies } from "@/theme/typography";
import { type DomainId } from "@/lib/persona/domain-stars";
import { type LadderLevel } from "@/lib/persona/brightness";
import { soulCoreOpacity } from "@/lib/persona/constellation-brightness";
import { MdButton } from "@/components/m3";
import { SecondbHead } from "./SecondbHead";
import { SbStarfield } from "./SbStarfield";

/** The seven visible home stars: six life domains + 뮤지엄 (sb-data STARS). */
export type HomeStarId = DomainId | "museum";

// sb-data.jsx STARS — coordinates in the 280×230 constellation box. 북극성 sits
// above the box (y=-16); VB_TOP expands the render space upward to keep it
// unclipped. The prototype's `leisure` id is this codebase's `recreation`.
const VBW = 280;
const VBH = 230;
const VB_TOP = 40;
const POLARIS = { x: 140, y: -16 };
const REV2_STARS: { id: HomeStarId; x: number; y: number }[] = [
  { id: "career", x: 228, y: 90 },
  { id: "finance", x: 230, y: 131 },
  { id: "relation", x: 174, y: 152 },
  { id: "growth", x: 151, y: 126 },
  { id: "health", x: 108, y: 135 },
  { id: "recreation", x: 76, y: 143 },
  { id: "museum", x: 50, y: 187 },
];

// Nearest-neighbour viewBox distance per star. Each star's hit box is capped to
// this (times the box scale u) so adjacent 44px targets never overlap on narrow
// screens — the persona-validate panel found crowded stars (health↔recreation
// ~40px apart on a 360dp phone) overlapped their 44px boxes and the later-painted
// star stole the tap, mis-routing to the wrong domain.
const NN_VIEW_DIST: Record<HomeStarId, number> = (() => {
  const out = {} as Record<HomeStarId, number>;
  for (const a of REV2_STARS) {
    let min = Infinity;
    for (const b of REV2_STARS) {
      if (a.id === b.id) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < min) min = d;
    }
    out[a.id] = min;
  }
  return out;
})();

// Dipper outline (bowl quad + handle) and the pointer→북극성 dashed guide,
// expressed through the star points so the lines can never drift from the dots.
const BOWL: HomeStarId[] = ["career", "finance", "relation", "growth"];
const HANDLE: HomeStarId[] = ["growth", "health", "recreation", "museum"];
const GUIDE: HomeStarId[] = ["finance", "career"];

// 뮤지엄 is a curated surface, not a data domain — fixed at the prototype's L4.
const MUSEUM_LEVEL: LadderLevel = 4;

// sb-home.jsx starOpacity: 0.36 + level/5 × 0.64.
function rev2StarOpacity(level: LadderLevel): number {
  return 0.36 + (level / 5) * 0.64;
}

type BubbleState = { kind: "intro" } | { kind: "menu" } | { kind: "star"; id: HomeStarId };

// Static t=0 frame of the prototype's neural field (seed 99173, mulberry32):
// 24 drifting glow nodes + 46 pin stars + <96px connection arcs, with the
// 70px head-avoidance hole at (w/2, h×0.7).
function neuralRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNeuralField(w: number, h: number) {
  const rand = neuralRng(99173);
  const nodes: { x: number; y: number; r: number; depth: number; phase: number }[] = [];
  for (let i = 0; i < 24; i += 1) {
    const baseX = rand() * w;
    const baseY = rand() * h;
    const d = 0.28 + rand() * 0.72;
    const phase = rand() * 6.28;
    const drift = 4 + rand() * 9;
    rand(); // speed — unused in the static frame
    nodes.push({
      x: baseX + Math.sin(phase) * drift,
      y: baseY + Math.cos(phase) * drift * 0.55,
      r: 1.4 + d * 4,
      depth: d,
      phase,
    });
  }
  const stars: { x: number; y: number; r: number; a: number }[] = [];
  for (let i = 0; i < 46; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 0.4 + rand() * 1.1;
    const a = 0.12 + rand() * 0.4;
    const phase = rand() * 6.28;
    stars.push({ x, y, r, a: a * (0.6 + Math.sin(phase) * 0.3) });
  }
  const hx = w / 2;
  const hy = h * 0.7;
  const near = (n: { x: number; y: number }) => Math.hypot(n.x - hx, n.y - hy) > 70;
  const links: { ax: number; ay: number; bx: number; by: number; mx: number; my: number; a: number; wln: number }[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dd = Math.hypot(a.x - b.x, a.y - b.y);
      if (dd < 96 && near(a) && near(b)) {
        const pulse = 0.5 + Math.sin(a.phase + b.phase) * 0.3;
        const al = Math.max(0, (1 - dd / 96) * 0.24 * pulse * Math.min(a.depth, b.depth));
        if (al > 0.01) {
          links.push({
            ax: a.x,
            ay: a.y,
            bx: b.x,
            by: b.y,
            mx: (a.x + b.x) / 2,
            my: (a.y + b.y) / 2 + Math.sin(i) * 4,
            a: al,
            wln: 0.8 + (1 - dd / 96),
          });
        }
      }
    }
  }
  return { nodes: nodes.map((n) => ({ ...n, fade: near(n) ? 1 : 0.16 })), stars, links };
}

// The stage washes + static neural field are a pure function of the stage
// dimensions (no per-tap props), so they must not re-reconcile the ~100-element
// SVG every time a star/head tap flips `bubble` in ConstellationHome. Extracted
// and memoized on the w/h primitives: it re-renders only on a real stage resize.
const NeuralFieldBackdrop = memo(function NeuralFieldBackdrop({ w, h }: { w: number; h: number }) {
  const neural = useMemo(() => buildNeuralField(w, h), [w, h]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="ds-stage" cx="50%" cy="26%" rx="120%" ry="70%">
          <Stop offset="0" stopColor={m3.accent.stageGlow} stopOpacity={0.5} />
          <Stop offset="0.42" stopColor={m3.accent.skySurface} stopOpacity={0.3} />
          <Stop offset="0.76" stopColor={m3.accent.stageFloor} stopOpacity={1} />
          <Stop offset="1" stopColor={m3.accent.stageFloor} stopOpacity={1} />
        </RadialGradient>
        <RadialGradient id="ds-vignette" cx="50%" cy="30%" rx="72%" ry="72%">
          <Stop offset="0" stopColor={m3.accent.stageFloor} stopOpacity={0} />
          <Stop offset="0.4" stopColor={m3.accent.stageFloor} stopOpacity={0} />
          <Stop offset="0.72" stopColor={m3.accent.stageFloor} stopOpacity={0.3} />
          <Stop offset="1" stopColor={m3.accent.stageFloor} stopOpacity={0.62} />
        </RadialGradient>
        <RadialGradient id="ds-node" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={m3.accent.star} stopOpacity={0.3} />
          <Stop offset="0.4" stopColor={m3.accent.skyText} stopOpacity={0.1} />
          <Stop offset="1" stopColor={m3.accent.starCore} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#ds-stage)" />
      {neural.links.map((l, i) => (
        <Path
          key={`l${i}`}
          d={`M${l.ax},${l.ay} Q${l.mx},${l.my} ${l.bx},${l.by}`}
          fill="none"
          stroke={withAlpha(m3.accent.starCore, l.a)}
          strokeWidth={l.wln}
          strokeLinecap="round"
        />
      ))}
      {neural.nodes.map((n, i) => {
        const pulse = 0.72 + Math.sin(n.phase) * 0.24;
        return (
          <Fragment key={`n${i}`}>
            <Circle cx={n.x} cy={n.y} r={n.r * (3.4 + pulse)} fill="url(#ds-node)" opacity={n.depth * n.fade} />
            <Circle
              cx={n.x}
              cy={n.y}
              r={n.r * pulse}
              fill={withAlpha(m3.accent.star, Math.min(0.5, (0.26 + 0.26 * n.depth) * pulse) * n.fade)}
            />
          </Fragment>
        );
      })}
      {neural.stars.map((s, i) => (
        <Circle key={`t${i}`} cx={s.x} cy={s.y} r={s.r} fill={withAlpha(m3.accent.star, Math.max(0, s.a))} />
      ))}
      <Rect x={0} y={0} width={w} height={h} fill="url(#ds-vignette)" />
    </Svg>
  );
});

export function ConstellationHome({
  onStarTravel,
  onPolarisPress,
  onChatPress,
  onOpsPress,
  onBellPress,
  starLevels = {},
  northStarBrightness = 0.2,
  hasUnread = false,
}: {
  /** 여행하기 on a star bubble (domains → their records lens, museum → /museum). */
  onStarTravel: (id: HomeStarId) => void;
  onPolarisPress: () => void;
  /** Head-tap menu actions (prototype bubble buttons 챗봇 / 비서). */
  onChatPress: () => void;
  onOpsPress: () => void;
  onBellPress: () => void;
  starLevels?: Partial<Record<DomainId, LadderLevel>>;
  northStarBrightness?: number;
  /** Real unread signal for the inbox bell dot. Defaults false so no fake
   *  "unread" dot shows until a real unread source is wired (the inbox is
   *  canon-seeded today, so there is no honest unread count yet). */
  hasUnread?: boolean;
}) {
  const { t } = useTranslation("home");
  const { width: winW } = useWindowDimensions();
  const [bubble, setBubble] = useState<BubbleState>({ kind: "intro" });
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);

  // Constellation box: prototype 380×312 (280×230 space), shrunk to fit narrow
  // screens; k scales the prototype's screen-px values proportionally.
  const boxW = Math.min(380, winW - 24);
  const k = boxW / 380;
  const u = boxW / VBW; // box px per viewBox unit
  const boxH = (VBH + VB_TOP) * u;
  const px = (x: number) => x * u;
  const py = (y: number) => (y + VB_TOP) * u;
  const starAt = (id: HomeStarId) => REV2_STARS.find((s) => s.id === id)!;
  const pathOf = (ids: HomeStarId[], close = false) =>
    ids.map((id, i) => `${i === 0 ? "M" : "L"}${px(starAt(id).x)},${py(starAt(id).y)}`).join(" ") + (close ? " Z" : "");

  const levelOf = (id: HomeStarId): LadderLevel =>
    id === "museum" ? MUSEUM_LEVEL : ((starLevels[id] ?? 1) as LadderLevel);
  const starName = (id: HomeStarId) =>
    id === "museum" ? t("ds.home.museumName") : t(`ds.home.domainName.${id}`);
  const kindOf = (id: HomeStarId) => (id === "museum" ? t("ds.home.kind.museum") : t("ds.home.kind.domain"));

  const focusedId = bubble.kind === "star" ? bubble.id : null;
  // sb-home renders the head at 152×1.05 CSS px; the app asset carries more
  // transparent padding than the prototype box, so the box is scaled up until
  // the VISIBLE head width matches the reference capture (~35% of the canvas).
  const headSize = 200;

  const bubbleTag =
    bubble.kind === "menu" ? t("ds.home.bubble.menuTag") : bubble.kind === "star" ? kindOf(bubble.id) : t("ds.home.bubble.introTag");
  const bubbleTitle = bubble.kind === "star" ? starName(bubble.id) : null;
  const bubbleLine =
    bubble.kind === "menu"
      ? t("ds.home.bubble.menu")
      : bubble.kind === "star"
        ? t(`ds.home.star.${bubble.id}.line`)
        : t("ds.home.bubble.intro");

  return (
    <View style={styles.root} onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* stage washes over the shared starfield (sb-home stage radial), then the
          static neural field, then the edge vignette. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <SbStarfield />
        {stage ? <NeuralFieldBackdrop w={stage.w} h={stage.h} /> : null}
      </View>

      {/* home inbox bell (sb-app "home inbox bell": 40dp chip, 4dp under the
          status inset, orange unread dot). LAYOUT NOTE (PR 680): Fabric Android
          drops styles given to Pressable, so the chip visual/position live on
          a View and the Pressable inside is a bare touch surface. */}
      <View style={styles.bell}>
        <Pressable
          onPress={onBellPress}
          accessibilityRole="button"
          accessibilityLabel={t("ds.home.inbox")}
          hitSlop={14}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              d="M12 3a6 6 0 0 0-6 6v3.2l-1.6 2.8a.8.8 0 0 0 .7 1.2h13.8a.8.8 0 0 0 .7-1.2L18 12.2V9a6 6 0 0 0-6-6zM9.8 18a2.3 2.3 0 0 0 4.4 0"
              stroke={m3.accent.bellGlyph}
              strokeWidth={1.8}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
        {hasUnread ? <View pointerEvents="none" style={styles.bellDot} /> : null}
      </View>

      {/* constellation block (sb-home: flex 1, box centered, 84px top clearance) */}
      <View style={styles.constellationBlock}>
        <View style={{ width: boxW, height: boxH }}>
          <Svg width={boxW} height={boxH} pointerEvents="none">
            <Defs>
              <RadialGradient id="ds-star" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={m3.accent.star} />
                <Stop offset="0.72" stopColor={m3.accent.starCore} />
                <Stop offset="1" stopColor={m3.accent.starCore} />
              </RadialGradient>
              <RadialGradient id="ds-star-glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={m3.accent.starCore} stopOpacity={0.95} />
                <Stop offset="0.55" stopColor={m3.accent.starCore} stopOpacity={0.4} />
                <Stop offset="1" stopColor={m3.accent.starCore} stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="ds-polaris" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={m3.accent.skyStarWhite} />
                <Stop offset="0.48" stopColor={m3.accent.polarisSoft} />
                <Stop offset="0.84" stopColor={m3.accent.moodNeutral} />
                <Stop offset="1" stopColor={m3.accent.moodNeutral} />
              </RadialGradient>
              <RadialGradient id="ds-polaris-glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={m3.accent.polarisGlow} stopOpacity={0.9} />
                <Stop offset="0.5" stopColor={m3.accent.moodNeutral} stopOpacity={0.5} />
                <Stop offset="1" stopColor={m3.accent.moodNeutral} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Path d={pathOf(BOWL, true)} fill="none" stroke={withAlpha(m3.accent.dipperLine, 0.34)} strokeWidth={1.2 * k} strokeLinejoin="round" />
            <Path d={pathOf(HANDLE)} fill="none" stroke={withAlpha(m3.accent.dipperLine, 0.34)} strokeWidth={1.2 * k} strokeLinejoin="round" />
            <Path
              d={`${pathOf(GUIDE)} L${px(POLARIS.x)},${py(POLARIS.y)}`}
              fill="none"
              stroke={withAlpha(m3.accent.moodNeutral, 0.45)}
              strokeWidth={1 * k}
              strokeDasharray={`${2 * k} ${5 * k}`}
            />
            {/* 북극성: 18dp dot + violet halo; brightness stays honest (soulCoreOpacity). */}
            <Circle cx={px(POLARIS.x)} cy={py(POLARIS.y)} r={17 * k} fill="url(#ds-polaris-glow)" opacity={0.7 * soulCoreOpacity(northStarBrightness)} />
            <Circle cx={px(POLARIS.x)} cy={py(POLARIS.y)} r={9 * k} fill="url(#ds-polaris)" opacity={soulCoreOpacity(northStarBrightness)} />
            {REV2_STARS.map((s) => {
              const on = focusedId === s.id;
              const o = rev2StarOpacity(levelOf(s.id));
              const dotR = 6 * k * (on ? 1.5 : 1);
              return (
                <Fragment key={s.id}>
                  <Circle cx={px(s.x)} cy={py(s.y)} r={dotR * (on ? 2.5 : 2.2)} fill="url(#ds-star-glow)" opacity={o * (on ? 1 : 0.8)} />
                  <Circle cx={px(s.x)} cy={py(s.y)} r={dotR} fill="url(#ds-star)" opacity={o} />
                </Fragment>
              );
            })}
          </Svg>

          {/* star labels (10.5px/600 under each dot; polaris label under its orb) */}
          {REV2_STARS.map((s) => {
            const on = focusedId === s.id;
            return (
              <Text
                key={`label-${s.id}`}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                numberOfLines={1}
                style={[
                  styles.starLabel,
                  // lineHeight (~1.34x) gives the Korean domain names room for
                  // their 받침 descenders — Android clips the last line of a
                  // numberOfLines Text without a padded line box.
                  { left: px(s.x) - 40, top: py(s.y) + (6 * k + 8), fontSize: 10.5 * k, lineHeight: Math.round(14 * k) },
                  on && { color: m3.accent.starFocus },
                ]}
              >
                {starName(s.id)}
              </Text>
            );
          })}
          <Text
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            numberOfLines={1}
            style={[styles.polarisLabel, { left: px(POLARIS.x) - 60, top: py(POLARIS.y) + (9 * k + 8), fontSize: 10.5 * k, lineHeight: Math.round(14 * k) }]}
          >
            {t("ds.home.polaris")}
          </Text>

          {/* tap targets — LAYOUT NOTE (PR 680): positioning lives on Views;
              each Pressable inside is a bare full-size touch surface. */}
          <View style={[styles.hit, { left: px(POLARIS.x) - 28, top: py(POLARIS.y) - 28, width: 56, height: 56 }]}>
            <Pressable
              onPress={() => {
                setBubble({ kind: "intro" });
                onPolarisPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={t("ds.home.polaris")}
              style={StyleSheet.absoluteFill}
            />
          </View>
          {REV2_STARS.map((s) => {
            // Size the hit box to the nearest-neighbour gap (floored at 32px) so
            // adjacent stars never overlap on narrow screens; isolated stars keep
            // the full 44px. Prevents the wrong-domain mis-tap (persona-validate).
            const hitSize = Math.max(32, Math.min(44, NN_VIEW_DIST[s.id] * u));
            const half = hitSize / 2;
            return (
              <View
                key={`hit-${s.id}`}
                style={[styles.hit, { left: px(s.x) - half, top: py(s.y) - half, width: hitSize, height: hitSize }]}
              >
                <Pressable
                  onPress={() => {
                    setBubble({ kind: "star", id: s.id });
                    // The domain card opens at the BOTTOM of the screen with no
                    // focus move; announce so a screen-reader user knows the tap
                    // registered and which star it selected (WCAG 4.1.3).
                    AccessibilityInfo.announceForAccessibility(starName(s.id));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={starName(s.id)}
                  // Level (the brightness signal) is otherwise conveyed by opacity
                  // alone; expose it so a blind user hears the domain's progress.
                  accessibilityValue={{ min: 1, max: 5, now: levelOf(s.id) }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* head + bubble block (sb-home HeadBubble: head pinned above center,
          bubble grows downward from just below the head) */}
      <View style={styles.headBlock}>
        <View style={[styles.headAnchor, { marginTop: -104 - headSize / 2 }]}>
          <Pressable
            onPress={() => setBubble((b) => (b.kind === "menu" ? { kind: "intro" } : { kind: "menu" }))}
            accessibilityRole="button"
            accessibilityLabel={t("ds.home.headA11y")}
          >
            <SecondbHead size={headSize} mood="neutral" track />
          </Pressable>
        </View>
        <View style={[styles.bubbleAnchor, { marginTop: -104 + headSize / 2 - 6 }]}>
          <View style={styles.bubble}>
            <View style={styles.bubbleCaret} />
            <Text style={styles.bubbleTag}>{bubbleTag}</Text>
            {/* keepAllKo joins Hangul words with U+2060 so the short bubble copy
                wraps at spaces (Android breaks mid-word otherwise); the screen
                reader gets the untouched string as accessibilityLabel. */}
            {bubbleTitle ? (
              <Text style={styles.bubbleTitle} accessibilityLabel={bubbleTitle}>{keepAllKo(bubbleTitle)}</Text>
            ) : null}
            <Text style={styles.bubbleLine} accessibilityLabel={bubbleLine}>{keepAllKo(bubbleLine)}</Text>
            {bubble.kind === "menu" ? (
              <View style={styles.bubbleActions}>
                <MdButton
                  label={t("ds.home.bubble.chatbot")}
                  variant="filled"
                  onPress={() => {
                    setBubble({ kind: "intro" });
                    onChatPress();
                  }}
                />
                <MdButton
                  label={t("ds.home.bubble.assistant")}
                  variant="tonal"
                  onPress={() => {
                    setBubble({ kind: "intro" });
                    onOpsPress();
                  }}
                />
              </View>
            ) : null}
            {bubble.kind === "star" ? (
              <View style={styles.bubbleActions}>
                <MdButton
                  label={t("ds.home.bubble.travel")}
                  variant="filled"
                  onPress={() => {
                    const id = bubble.id;
                    setBubble({ kind: "intro" });
                    onStarTravel(id);
                  }}
                />
                <MdButton label={t("ds.home.bubble.later")} variant="text" onPress={() => setBubble({ kind: "intro" })} />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bell: {
    position: "absolute",
    top: 4,
    left: 16,
    zIndex: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(m3.accent.bellSurface, 0.7),
  },
  bellDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: m3.accent.alertDot,
  },
  constellationBlock: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
    paddingHorizontal: 12,
    zIndex: 3,
  },
  starLabel: {
    position: "absolute",
    width: 80,
    textAlign: "center",
    color: withAlpha(m3.accent.starLabel, 0.78),
    fontWeight: "600",
    letterSpacing: 0.2,
    fontFamily: fontFamilies.readable,
  },
  polarisLabel: {
    position: "absolute",
    width: 120,
    textAlign: "center",
    color: withAlpha(m3.accent.polarisSoft, 0.92),
    fontWeight: "600",
    letterSpacing: 0.2,
    fontFamily: fontFamilies.readable,
  },
  hit: { position: "absolute" },
  headBlock: { flex: 1, minHeight: 0, zIndex: 5 },
  headAnchor: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    alignItems: "center",
  },
  bubbleAnchor: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  bubble: {
    width: "100%",
    maxWidth: 268,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: withAlpha(m3.accent.starCore, 0.34),
    backgroundColor: withAlpha(m3.accent.bubbleSurface, 0.95),
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  bubbleCaret: {
    position: "absolute",
    top: -7,
    alignSelf: "center",
    width: 12,
    height: 12,
    backgroundColor: withAlpha(m3.accent.bubbleSurface, 0.95),
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: withAlpha(m3.accent.starCore, 0.34),
    transform: [{ rotate: "45deg" }],
  },
  bubbleTag: {
    fontFamily: m3.font.mono,
    fontSize: 9,
    letterSpacing: 1.26,
    color: withAlpha(m3.accent.moodNeutral, 0.9),
    marginBottom: 6,
  },
  bubbleTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: m3.accent.starFocus,
    marginBottom: 5,
    fontFamily: fontFamilies.readable,
  },
  bubbleLine: {
    fontSize: 13.5,
    lineHeight: 20,
    color: m3.accent.bubbleText,
    textAlign: "center",
    fontFamily: fontFamilies.readable,
  },
  bubbleActions: { flexDirection: "row", gap: 8, marginTop: 12, justifyContent: "center" },
});
