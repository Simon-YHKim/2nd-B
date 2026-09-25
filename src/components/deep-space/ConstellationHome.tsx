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
 * loadDomainLevels). 밝기는 **알파가 아니라 색과 디더 밀도**로 난다
 * (PIXEL-CLAY 규칙 4 · Simon 결정 2026-08-27). 프로토타입의 곱셈
 * 0.36 + L/5×0.64 는 m3.starLadder 안에 미리 합성돼 있다.
 */
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useUiSound } from "@/lib/audio/use-ui-sound";
import Svg, { Defs, G, Pattern, Rect } from "react-native-svg";

import { TelescopeControls } from "./TelescopeControls";
import { StarDestination } from "./StarDestination";
import { StarCapture } from "./StarCapture";
import { STAR_CAMERA_STOPS, starCameraAim, starCameraFlight } from "@/lib/motion/star-camera";
import { PixelPressable } from "../pixel/PixelPressable";
import { moveTelescopeCamera } from "@/lib/motion/camera-remote";

import { PixelStarSvg } from "../pixel/PixelStarSvg";
import { pixelStarSpan } from "../pixel/pixel-star";
import { layoutStarLabels } from "./star-label-layout";

import { NoticeDialog, useNoticeCenter } from "@/app/notices";
import { useAuth } from "@/lib/auth/AuthContext";
import { rewardedAdsConfigured } from "@/lib/ads/policy";
import { remainingReasoning } from "@/lib/entitlements/reasoning-cap";
import { REWARD_PER_WATCH } from "@/lib/entitlements/tiers";
import { getReasoningUsage } from "@/lib/entitlements/usage";
import { getAutoReasoningEnabled } from "@/lib/reasoning/auto-pref";
import { weeklyBaseRemaining } from "@/lib/reasoning/remaining-copy";
import { useCoachmarksGate } from "@/lib/onboarding/coachmarks-gate";
import { useProgression } from "@/lib/progression/useProgression";
import { useTaskStatus } from "@/lib/tasks/store";
import { flattenAlpha } from "@/lib/theme/tokens";
import { m3, m3BrightnessBand } from "@/lib/theme/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { stepPolyline, stepQuad } from "@/components/pixel/pixel-line";
import { fontFamilies } from "@/theme/typography";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { type LadderLevel } from "@/lib/persona/brightness";
import { starEntryStatus } from "@/lib/persona/star-entry-tracks";
import {
  DITHER_TILE,
  LADDER_ON_CELLS,
  ladderDitherCells,
} from "@/components/pixel/pixel-dither-cells";
import { MdButton } from "@/components/m3";
import { ReasoningLimitSheet } from "./ReasoningLimitSheet";
import { SecondbHead } from "./SecondbHead";
import { SbStarfield } from "./SbStarfield";
import { JrpgDialogueBox, useJrpgTypewriter } from "./JrpgDialogueBox";

// 누가 일곱인지는 `lib/persona/home-stars.ts` 가 갖는다 (북극성 화면도 같은
// 일곱을 보여줘야 해서 컴포넌트 밖으로 뺐다). 좌표는 여기 남는다.
export type { HomeStarId } from "@/lib/persona/home-stars";
import { type HomeStarId } from "@/lib/persona/home-stars";
import { a11yValue } from "@/lib/a11y/accessibility-value";

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `m3.accent.stageFloor` — 별자리 홈은 무대 바닥 위다.
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const homeAlpha = (c: string, a: number): string => flattenAlpha(c, a, m3.accent.stageFloor);

// sb-data.jsx STARS — coordinates in the 280×230 constellation box. 북극성 sits
// above the box (y=-16); VB_TOP expands the render space upward to keep it
// unclipped. The prototype's `leisure` id is this codebase's `recreation`.
const VBW = 280;
const VBH = 230;
const VB_TOP = 40;
const POLARIS = { x: 140, y: -16 };
// 좌표는 그대로 두고 **누가 어느 자리인지만** 바꿨다(2026-08-24). 북두칠성 모양은
// 캐논이고, 바뀐 것은 각 자리가 무엇을 뜻하는지다.
//
// 손잡이 끝(50,187)이 프로필인 것도 그대로다 -- 국자에서 가장 바깥, 즉 지극성에서
// 가장 먼 자리가 "나에 대한 기본 정보"인 편이 읽기 좋다. 나머지는 **시간 순서**로
// 국자를 따라간다: 영유아기 → 학창시절 → 20대 → 30대 이후, 그리고 주제 둘.
const REV2_STARS: { id: HomeStarId; x: number; y: number }[] = [
  { id: "now", x: 228, y: 90 },
  { id: "work", x: 230, y: 131 },
  { id: "later", x: 174, y: 152 },
  { id: "twenties", x: 151, y: 126 },
  { id: "school", x: 108, y: 135 },
  { id: "infancy", x: 76, y: 143 },
  { id: "profile", x: 50, y: 187 },
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
const BOWL: HomeStarId[] = ["now", "work", "later", "twenties"];
const HANDLE: HomeStarId[] = ["twenties", "school", "infancy", "profile"];
const GUIDE: HomeStarId[] = ["work", "now"];

/**
 * 별을 잇는 선을 놓는 셀 크기.
 *
 * 3px 인 이유: 원래 굵기가 1.2 라 1px 셀로 놓으면 대각선이 점선처럼 끊긴다.
 * 규칙을 지키느라 그림을 망가뜨리지 않기 위한 값이다(`SbStarfield` 와 같은 판단).
 */
const LINK_CELL = 3;

/** 신경망 링크를 놓는 셀. 원래 굵기가 1 안팎이라 2가 맞다. */
const NEURAL_CELL = 2;

/** Background nodes must stay below even a resting home star's visual span. */
const NEURAL_NODE_OUTER_MAX = 6;
const NEURAL_NODE_INNER_MAX = 2;

/** Keep SecondB present while the constellation remains the screen's one hero graphic. */
const HOME_HEAD_SIZE = 96;
const DIALOGUE_STAGE_HEIGHT = 136;
const DIALOGUE_ACTION_HIT_SLOP = 6;
const DIALOGUE_BLIP = require("../../../assets/audio/jrpg-text-blip.mp3");

/**
 * 선 색 — 원래 `homeAlpha(…, 0.34)` 였다. 미리 합성해 불투명 색으로 둔다(규칙 4).
 * 바닥은 별자리 상자가 앉은 무대 바닥색이다.
 */
const DIPPER_LINK_FILL = flattenAlpha(m3.accent.dipperLine, 0.34, m3.accent.stageFloor);
const GUIDE_LINK_FILL = flattenAlpha(m3.accent.moodNeutral, 0.45, m3.accent.stageFloor);
// Keep the star silhouette continuous at L1. The 5-step dither now changes
// the halo's tone instead of leaving isolated bright pixels on empty sky.
const DOMAIN_HALO_BASE = flattenAlpha(m3.accent.starCore, 0.36, m3.accent.stageFloor);
const DOMAIN_HALO_LIGHT = flattenAlpha(m3.accent.starCore, 0.48, m3.accent.stageFloor);
const POLARIS_HALO_BASE = flattenAlpha(m3.accent.polarisGlow, 0.36, m3.accent.stageFloor);
const POLARIS_HALO_LIGHT = flattenAlpha(m3.accent.polarisGlow, 0.48, m3.accent.stageFloor);

// 뮤지엄 is a curated surface, not a data domain — fixed at the prototype's L4.

// 밝기는 이제 **알파가 아니라 색과 디더 밀도**로 표현한다
// (PIXEL-CLAY 절대 규칙 4 · Simon 결정 2026-08-27 "전부 디더 5단").
//
// 옛 `rev2StarOpacity` 가 내던 값(0.36 + L/5 × 0.64)은 사라진 게 아니라
// `m3.starLadder` 안에 **미리 합성돼** 있다. 심 색은 그 다섯 값과 같은
// 픽셀이고, 광채는 같은 다섯 단을 디더 밀도로 낸다.
//
// ⚠ 사다리 배열은 0 부터라 `level - 1` 로 읽는다.
function ladderIndex(level: LadderLevel): number {
  return Math.max(0, Math.min(4, level - 1));
}

type BubbleState =
  | { kind: "intro" }
  | { kind: "tip"; index: number }
  | { kind: "reasoning" }
  | { kind: "menu" }
  | { kind: "star"; id: HomeStarId };

type ReasoningBubbleMode = "available" | "automatic" | "running" | "depleted";
type HomeReasoningLocale = "en" | "ko" | "es" | "pt" | "id";

const HOME_TIP_KEYS = [
  "ds.home.bubble.tip1",
  "ds.home.bubble.tip2",
  "ds.home.bubble.tip3",
] as const;

function nextHomeBubble(current: BubbleState): BubbleState {
  if (current.kind === "intro") return { kind: "tip", index: 0 };
  if (current.kind === "tip") {
    return current.index + 1 < HOME_TIP_KEYS.length
      ? { kind: "tip", index: current.index + 1 }
      : { kind: "reasoning" };
  }
  if (current.kind === "reasoning") return { kind: "menu" };
  return { kind: "intro" };
}

const HOME_REASONING_COPY: Record<
  HomeReasoningLocale,
  {
    reasoningTag: string;
    notices: string;
    running: string;
    depleted: string;
    automatic: string;
    choose: string;
    baseLeft: (count: number) => string;
    rewardLeft: (count: number) => string;
    adReward: (count: number) => string;
    viewPlans: string;
    viewProgress: string;
    chooseItems: string;
    automaticButton: string;
  }
> = {
  en: {
    reasoningTag: "REASONING",
    notices: "Notices",
    running: "I'm reading your selected items and connecting their stars.",
    depleted: "You've used this week's base runs. They refill Monday.",
    automatic: "Automatic reasoning is on. New items connect right away.",
    choose: "Choose the items whose stars you want to connect.",
    baseLeft: (count) => `You have ${count} runs left this week. What should we connect?`,
    rewardLeft: (count) => `Weekly base is used. ${count} reward runs are available.`,
    adReward: (count) => `Watch an ad for ${count} runs`,
    viewPlans: "View plans",
    viewProgress: "View progress",
    chooseItems: "Choose items",
    automaticButton: "Automatic",
  },
  ko: {
    reasoningTag: "리즈닝",
    notices: "공지사항",
    running: "선택한 자료를 읽고 별을 잇는 중이에요.",
    depleted: "이번 주 기본 횟수를 다 썼어요. 월요일에 다시 채워져요.",
    automatic: "자동 리즈닝이 켜져 있어요. 새 자료를 담으면 바로 이어요.",
    choose: "필요한 자료를 골라 별을 이어볼까요?",
    baseLeft: (count) => `이번 주 ${count}회 남았어요. 어떤 자료를 이을까요?`,
    rewardLeft: (count) => `주간 기본은 다 썼어요. 보상 ${count}회를 쓸 수 있어요.`,
    adReward: (count) => `광고 보고 ${count}회 받기`,
    viewPlans: "플랜 보기",
    viewProgress: "진행 화면 보기",
    chooseItems: "자료 선택",
    automaticButton: "자동 설정",
  },
  es: {
    reasoningTag: "RAZONAMIENTO",
    notices: "Avisos",
    running: "Estoy leyendo tus elementos seleccionados y conectando sus estrellas.",
    depleted: "Ya usaste las ejecuciones base de esta semana. Se recargan el lunes.",
    automatic: "El razonamiento automatico esta activo. Los nuevos elementos se conectan al instante.",
    choose: "Elige los elementos cuyas estrellas quieres conectar.",
    baseLeft: (count) => `Te quedan ${count} ejecuciones esta semana. ¿Que conectamos?`,
    rewardLeft: (count) => `La base semanal se uso. Hay ${count} ejecuciones de recompensa disponibles.`,
    adReward: (count) => `Ver un anuncio por ${count} ejecuciones`,
    viewPlans: "Ver planes",
    viewProgress: "Ver progreso",
    chooseItems: "Elegir elementos",
    automaticButton: "Automatico",
  },
  pt: {
    reasoningTag: "RACIOCINIO",
    notices: "Avisos",
    running: "Estou lendo os itens selecionados e conectando suas estrelas.",
    depleted: "Voce usou as execucoes base desta semana. Elas voltam na segunda.",
    automatic: "O raciocinio automatico esta ativo. Novos itens se conectam na hora.",
    choose: "Escolha os itens cujas estrelas voce quer conectar.",
    baseLeft: (count) => `Voce tem ${count} execucoes nesta semana. O que vamos conectar?`,
    rewardLeft: (count) => `A base semanal acabou. ${count} execucoes de recompensa estao disponiveis.`,
    adReward: (count) => `Ver um anuncio por ${count} execucoes`,
    viewPlans: "Ver planos",
    viewProgress: "Ver progresso",
    chooseItems: "Escolher itens",
    automaticButton: "Automatico",
  },
  id: {
    reasoningTag: "PENALARAN",
    notices: "Pengumuman",
    running: "Aku sedang membaca item pilihanmu dan menghubungkan bintangnya.",
    depleted: "Jatah dasar minggu ini sudah habis. Akan terisi lagi Senin.",
    automatic: "Penalaran otomatis aktif. Item baru langsung terhubung.",
    choose: "Pilih item yang bintangnya ingin kamu hubungkan.",
    baseLeft: (count) => `Minggu ini tersisa ${count} kali. Apa yang perlu kita hubungkan?`,
    rewardLeft: (count) => `Jatah dasar mingguan sudah habis. ${count} jatah hadiah tersedia.`,
    adReward: (count) => `Tonton iklan untuk ${count} kali`,
    viewPlans: "Lihat paket",
    viewProgress: "Lihat progres",
    chooseItems: "Pilih item",
    automaticButton: "Otomatis",
  },
};

function homeReasoningLocale(language: string | undefined): HomeReasoningLocale {
  const code = language?.toLowerCase() ?? "en";
  if (code.startsWith("ko")) return "ko";
  if (code.startsWith("es")) return "es";
  if (code.startsWith("pt")) return "pt";
  if (code.startsWith("id")) return "id";
  return "en";
}

function NoticeTicker({ text, reducedMotion, onPress }: {
  text: string;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  useEffect(() => {
    offset.stopAnimation();
    if (reducedMotion || trackWidth === 0 || textWidth === 0) {
      offset.setValue(0);
      return;
    }
    const startX = Math.max(0, trackWidth - 48);
    const duration = Math.max(6000, Math.round((startX + textWidth) * 30));
    let active = true;
    let current: ReturnType<typeof Animated.timing> | null = null;
    const run = () => {
      offset.setValue(startX);
      current = Animated.timing(offset, {
        toValue: -textWidth,
        duration,
        easing: pixelStepsFor(duration),
        useNativeDriver: Platform.OS !== "web",
      });
      current.start(({ finished }) => { if (active && finished) run(); });
    };
    run();
    return () => {
      active = false;
      current?.stop();
    };
  }, [offset, reducedMotion, text, textWidth, trackWidth]);

  return (
    <Pressable
      style={styles.tickerPress}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text}
      hitSlop={{ top: 2, bottom: 2 }}
    >
      <View style={styles.tickerTrack} onLayout={(event) => setTrackWidth(Math.round(event.nativeEvent.layout.width))}>
        {reducedMotion ? (
          <Text style={styles.tickerText} numberOfLines={1}>{text}</Text>
        ) : (
          <Animated.View style={[styles.tickerMotion, { transform: [{ translateX: offset }] }]}>
            <Text style={styles.tickerText} numberOfLines={1} onLayout={(event) => setTextWidth(Math.round(event.nativeEvent.layout.width))}>
              {text}
            </Text>
          </Animated.View>
        )}
      </View>
    </Pressable>
  );
}

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

/**
 * The neural field has three opaque, canonical colour bands. Its old
 * continuously pre-composited alpha values were technically opaque at render
 * time, but still produced an unbounded colour ramp. Quantizing the signal
 * keeps depth readable without reintroducing opacity or interpolation.
 */
const NEURAL_BAND_FILL = [
  m3.color.surfaceContainerHighest,
  m3.color.primaryContainer,
  m3.accent.starCore,
] as const;

function neuralBand(signal: number): (typeof NEURAL_BAND_FILL)[number] {
  if (signal < 0.2) return NEURAL_BAND_FILL[0];
  if (signal < 0.4) return NEURAL_BAND_FILL[1];
  return NEURAL_BAND_FILL[2];
}

// The opaque stage + static neural field are a pure function of the stage
// dimensions (no per-tap props), so they must not re-reconcile the ~100-element
// SVG every time a star/head tap flips `bubble` in ConstellationHome. Extracted
// and memoized on the w/h primitives: it re-renders only on a real stage resize.
const NeuralFieldBackdrop = memo(function NeuralFieldBackdrop({ w, h }: { w: number; h: number }) {
  const neural = useMemo(() => buildNeuralField(w, h), [w, h]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      {/* PIXEL-CLAY uses one opaque canonical floor here. The old radial wash
          and alpha vignette produced thousands of interpolated colours and
          contradicted the no-gradient/no-static-opacity contract. */}
      <Rect x={0} y={0} width={w} height={h} fill={m3.accent.stageFloor} />
      {/* 신경망 링크 — 2차 베지에 곡선이었다. 셀 계단으로(PIXEL-CLAY 규칙 1).
          알파는 미리 합성한다(규칙 4) — 바닥은 무대 바닥색이다. */}
      {neural.links.map((l, i) =>
        stepQuad(l.ax, l.ay, l.mx, l.my, l.bx, l.by, NEURAL_CELL).map((p, j) => (
          <Rect
            key={`l${i}-${j}`}
            x={p.x}
            y={p.y}
            width={NEURAL_CELL}
            height={NEURAL_CELL}
            fill={neuralBand(l.a)}
          />
        )),
      )}
      {neural.nodes.map((n, i) => {
        const pulse = 0.72 + Math.sin(n.phase) * 0.24;
        const outerSize = Math.min(
          NEURAL_NODE_OUTER_MAX,
          Math.max(2, Math.round(n.r * (3.4 + pulse) * 2)),
        );
        const innerSize = Math.min(
          NEURAL_NODE_INNER_MAX,
          Math.max(1, Math.round(n.r * pulse * 2)),
        );
        return (
          <Fragment key={`n${i}`}>
            {/* 노드 발광 — RadialGradient 원이었다. 한 겹 큰 사각으로(규칙 1·4). */}
            <Rect
              x={Math.round(n.x - outerSize / 2)}
              y={Math.round(n.y - outerSize / 2)}
              width={outerSize}
              height={outerSize}
              fill={neuralBand(0.3 * n.depth * n.fade)}
            />
            <Rect
              x={Math.round(n.x - innerSize / 2)}
              y={Math.round(n.y - innerSize / 2)}
              width={innerSize}
              height={innerSize}
              fill={neuralBand(Math.min(0.5, (0.26 + 0.26 * n.depth) * pulse) * n.fade)}
            />
          </Fragment>
        );
      })}
      {/* 배경 반짝임: PIXEL-CLAY 규칙 1 로 정수 rect. 아주 먼 별이라 광선 없이
          점 하나로 둔다 — 여기에 4방향 광선을 달면 북두칠성 7별과 서열이
          섞인다(Visual Tier). 빛나는 별은 앞의 7개와 북극성뿐이다. */}
      {neural.stars.map((s, i) => {
        const d = Math.max(1, Math.round(s.r * 2));
        return (
          <Rect
            key={`t${i}`}
            x={Math.round(s.x) - Math.floor(d / 2)}
            y={Math.round(s.y) - Math.floor(d / 2)}
            width={d}
            height={d}
            fill={neuralBand(Math.max(0, s.a))}
          />
        );
      })}
    </Svg>
  );
});

// Visual Tier 계수 (× k). constellation-polaris-dominance.test.ts 가 여기서 읽는다.
//
// 예전 원 반경(북극성 9/17, 도메인 별 6)을 그대로 쓰면 눈에 띄게 작아 보인다 —
// 4방향 글린트는 같은 반경의 원반보다 채워진 면적이 훨씬 작기 때문이다. 그래서
// **서열 비율은 그대로 두고** 전체를 약 1.35배 키웠다. 서열 자체(북극성 > 초점
// 별 > 쉬는 별)는 아래 테스트가 계속 지킨다.
const POLARIS_CORE_R = 12;
const POLARIS_MID_R = 17;
const POLARIS_HALO_R = 23;
const DOMAIN_CORE_R = 8;
const DOMAIN_FOCUS_MULT = 1.3;
const DOMAIN_HALO_MULT_REST = 1.6;

export function ConstellationHome({
  onStarTravel,
  onPolarisPress,
  onChatPress,
  coachFirstRecord = false,
  coachHeadTargetRef,
  onCoachHeadPress,
  onOpsPress,
  onBellPress,
  onMuseumPress,
  onCommunityPress,
  starLevels = {},
  northStarBrightness = 0.2,
  hasUnread = false,
}: {
  /** 여행하기 on a star bubble (domains → their records lens, profile → /profile). */
  onStarTravel: (id: HomeStarId) => void;
  onPolarisPress: () => void;
  /** Head-tap menu actions (prototype bubble buttons 챗봇 / 비서). */
  onChatPress: () => void;
  /** First-run task coach: the live head becomes step 1's only active target. */
  coachFirstRecord?: boolean;
  coachHeadTargetRef?: RefObject<View | null>;
  onCoachHeadPress?: () => void;
  onOpsPress: () => void;
  /** 뮤지엄 corner chip. The museum lost its home star to `profile`, so this is
   *  the ONLY forward entry point to /museum in the app — the swap and this chip
   *  have to ship together or the screen goes unreachable. */
  onMuseumPress: () => void;
  /** 커뮤니티 corner chip. Same story without the star swap as an excuse: the
   *  screen shipped with no forward link from anywhere, so it was reachable only
   *  by pasting an invite URL. Adults only, so the chip hides for minors. */
  onCommunityPress: () => void;
  onBellPress: () => void;
  starLevels?: Partial<Record<HomeStarId, LadderLevel>>;
  northStarBrightness?: number;
  /** Real unread signal for the inbox bell dot. Defaults false so no fake
   *  "unread" dot shows until a real unread source is wired (the inbox is
   *  canon-seeded today, so there is no honest unread count yet). */
  hasUnread?: boolean;
}) {
  // 북극성 밝기(0..1 연속)를 사다리 한 칸으로 떨어뜨린다.
  // ⚠ 손실이 있는 변환이다 — Simon 결정 2026-08-27 에서 감수하기로 한 부분.
  const polarisBand = m3BrightnessBand(northStarBrightness);
  const { t, i18n } = useTranslation(["home", "deepspace"]);
  const { userId, isMinor, age } = useAuth();
  const reasoningCopy = HOME_REASONING_COPY[homeReasoningLocale(i18n.language)];
  const noticeCenter = useNoticeCenter(userId);
  const coachmarksDue = useCoachmarksGate();
  const progression = useProgression();
  const task = useTaskStatus();
  const { width: winW, fontScale } = useWindowDimensions();
  const [bubble, setBubble] = useState<BubbleState>({ kind: "intro" });
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const [autoNoticeDismissed, setAutoNoticeDismissed] = useState(false);
  const [manualNoticeVisible, setManualNoticeVisible] = useState(false);
  const [homeFocused, setHomeFocused] = useState(false);
  const [reasoningStatus, setReasoningStatus] = useState<{
    automatic: boolean;
    /** Run gate: weekly base + monthly reward credits (what CAN still run). */
    remaining: number | null;
    /** Display split (spec 결정 5): weekly base only. null = unlimited/unknown. */
    baseRemaining: number | null;
    /** Display split: monthly reward credits still available. */
    rewardCredits: number;
  }>({ automatic: false, remaining: null, baseRemaining: null, rewardCredits: 0 });
  const [limitSheetVisible, setLimitSheetVisible] = useState(false);

  // Home stays mounted behind capture. Keep its notice Modal off other routes,
  // including the first-record coach's completion screen.
  useFocusEffect(useCallback(() => {
    setHomeFocused(true);
    return () => setHomeFocused(false);
  }, []));

  const refreshReasoningStatus = useCallback(async () => {
    if (!userId) {
      setReasoningStatus({ automatic: false, remaining: null, baseRemaining: null, rewardCredits: 0 });
      return;
    }
    const [automatic, usage] = await Promise.all([
      getAutoReasoningEnabled(userId),
      getReasoningUsage(userId),
    ]);
    setReasoningStatus({
      automatic,
      remaining: remainingReasoning(
        progression.tier,
        usage.used,
        usage.rewardCredits,
      ),
      baseRemaining: weeklyBaseRemaining(progression.tier, usage.used),
      rewardCredits: usage.rewardCredits,
    });
  }, [progression.tier, userId]);

  useEffect(() => {
    if (bubble.kind === "reasoning") void refreshReasoningStatus();
  }, [bubble.kind, refreshReasoningStatus, task.phase]);

  // Reserve the dialogue stage first, then center the constellation in the
  // remaining space. Height also constrains the scale on short screens so the
  // stars never collide with the dialogue panel.
  const [instrumentHeight, setInstrumentHeight] = useState(110);
  const dialogueStageHeight = DIALOGUE_STAGE_HEIGHT * Math.min(Math.max(fontScale, 1), 1.35);
  const constellationHeightBudget = stage
    ? Math.max(120, stage.h - dialogueStageHeight - 52 - instrumentHeight)
    : Number.POSITIVE_INFINITY;
  const boxW = Math.min(
    380,
    winW - 24,
    constellationHeightBudget * (VBW / (VBH + VB_TOP)),
  );
  const k = boxW / 380;
  const u = boxW / VBW; // box px per viewBox unit
  const boxH = (VBH + VB_TOP) * u;
  const px = (x: number) => x * u;
  const py = (y: number) => (y + VB_TOP) * u;
  const starAt = (id: HomeStarId) => REV2_STARS.find((s) => s.id === id)!;
  // 별을 잇는 선. 전에는 `M…L…` path 한 줄이었고 이제 **정수 셀 목록**이다
  // (PIXEL-CLAY 규칙 1). 좌표 계산(px/py)은 그대로라 선이 지나는 자리는 안 바뀐다.
  const cellsOf = (ids: HomeStarId[], close = false, extra?: [number, number]) => {
    const pts = ids.map((id) => [px(starAt(id).x), py(starAt(id).y)] as [number, number]);
    if (extra) pts.push(extra);
    return stepPolyline(close ? [...pts, pts[0]] : pts, LINK_CELL);
  };
  // 별 이름표 자리. 둘째 줄은 그 자리가 비어 있는 별만 받는다 (star-label-layout.ts).
  // 코어 크기는 눌렀을 때 값이다. 어느 별이 눌려도 둘째 줄이 그 코어를 덮지 않게.
  // 기기 글꼴 배율도 넘긴다. 이름표 글자는 main 처럼 상한 없이 커지고, 자리도 그 배율로 잰다.
  // 북극성 이름표 자리도 여기서 같이 나온다 (그 폭도 별 이름표 자리에 따라 정해진다).
  const starLabels = layoutStarLabels({
    stars: REV2_STARS.map((s) => ({ id: s.id, cx: px(s.x), cy: py(s.y) })),
    k,
    coreHalfSpan: pixelStarSpan(DOMAIN_CORE_R * k * DOMAIN_FOCUS_MULT),
    polaris: { cx: px(POLARIS.x), cy: py(POLARIS.y) },
    stage: { w: boxW, h: boxH },
    fontScale,
  });

  const levelOf = (id: HomeStarId): LadderLevel =>
    (starLevels[id] ?? 1) as LadderLevel;
  const starName = (id: HomeStarId) => t(`ds.star.${id}`);
  const kindOf = (id: HomeStarId) => (id === "profile" ? t("ds.home.kind.profile") : t("ds.home.kind.domain"));

  const focusedId = bubble.kind === "star" ? bubble.id : null;
  const reducedMotion = useReducedMotionPref();
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [skySize, setSkySize] = useState({ width: winW, height: boxH });
  const [visualFocusId, setVisualFocusId] = useState<HomeStarId | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [captureId, setCaptureId] = useState<HomeStarId | null>(null);
  const captureLock = useRef(false);
  const homeActive = useRef(homeFocused);
  homeActive.current = homeFocused;
  const destinationProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (homeFocused) return;
    captureLock.current = false;
    setCaptureId(null);
    setCameraReady(false);
    setVisualFocusId(null);
    destinationProgress.stopAnimation();
    destinationProgress.setValue(0);
    setBubble(current => current.kind === 'star' ? { kind: 'intro' } : current);
  }, [destinationProgress, homeFocused]);
  const selectedStar = REV2_STARS.find((s) => s.id === visualFocusId);
  const starRadius = pixelStarSpan(DOMAIN_CORE_R * k * DOMAIN_HALO_MULT_REST);
  const flight = starCameraFlight(
    selectedStar ? { x: Math.round(px(selectedStar.x)), y: Math.round(py(selectedStar.y)) } : { x: boxW / 2, y: boxH / 2 },
    camera, { width: boxW, height: boxH }, skySize, instrumentHeight, starRadius,
  );
  const cameraAim = starCameraAim(flight.origin, skySize);
  const worldX = visualFocusId ? destinationProgress.interpolate({ inputRange: STAR_CAMERA_STOPS, outputRange: flight.x }) : -camera.x * camera.zoom;
  const worldY = visualFocusId ? destinationProgress.interpolate({ inputRange: STAR_CAMERA_STOPS, outputRange: flight.y }) : -camera.y * camera.zoom;
  const worldZoom = visualFocusId ? destinationProgress.interpolate({ inputRange: STAR_CAMERA_STOPS, outputRange: flight.zoom }) : camera.zoom;
  const selectedEntry = focusedId ? starEntryStatus(focusedId, starLevels, age) : null;
  const playDialogueBlip = useUiSound(DIALOGUE_BLIP, {
    volume: 0.08,
    minIntervalMs: 72,
    updateIntervalMs: 1_000,
  });

  const bubbleTag =
    bubble.kind === "reasoning"
      ? reasoningCopy.reasoningTag
      : bubble.kind === "tip"
        ? t("ds.home.bubble.tipTag")
        : bubble.kind === "menu"
          ? t("ds.home.bubble.menuTag")
          : bubble.kind === "star"
            ? kindOf(bubble.id)
            : t("ds.home.bubble.introTag");
  const bubbleTitle = bubble.kind === "star" ? starName(bubble.id) : null;
  const bubbleLine =
    bubble.kind === "reasoning"
      ? task.phase === "running" && task.resultHref === "/reasoning"
        ? reasoningCopy.running
        : reasoningStatus.remaining !== null && reasoningStatus.remaining <= 0
          ? reasoningCopy.depleted
          : reasoningStatus.automatic
            ? reasoningCopy.automatic
            : reasoningStatus.remaining === Infinity
              ? reasoningCopy.choose
              : reasoningStatus.remaining === null
                ? reasoningCopy.choose
                : reasoningStatus.baseRemaining !== null && reasoningStatus.baseRemaining > 0
                  ? reasoningCopy.baseLeft(reasoningStatus.baseRemaining)
                  : reasoningCopy.rewardLeft(reasoningStatus.rewardCredits)
      : bubble.kind === "tip"
        ? t(HOME_TIP_KEYS[bubble.index] ?? HOME_TIP_KEYS[0])
        : bubble.kind === "menu"
          ? t("ds.home.bubble.menu")
          : bubble.kind === "star"
            ? `${t(`ds.home.star.${bubble.id}.line`)}${selectedEntry?.kind === "previous"
              ? ` ${t("ds.home.star.entryAfter", { star: starName(selectedEntry.prerequisite) })}`
              : selectedEntry?.kind === "unlived"
                ? ` ${t("ds.star.lockedBody")}`
                : ""}`
            : t("ds.home.bubble.intro");
  const dialogue = useJrpgTypewriter({
    text: bubbleLine,
    reducedMotion,
    onBlip: playDialogueBlip,
  });
  const advanceDialogue = useCallback(() => {
    if (coachFirstRecord) {
      onCoachHeadPress?.();
      return;
    }
    if (!dialogue.isComplete) {
      dialogue.reveal();
      return;
    }
    setBubble(nextHomeBubble);
  }, [coachFirstRecord, dialogue.isComplete, dialogue.reveal, onCoachHeadPress]);
  // The popup is driven by popupNotice, NOT by unreadCount. Once the notices
  // table exists an unread `minor` row also raises unreadCount, and minor is
  // explicitly not allowed to interrupt - keying the gate off the count would
  // pop a dialog for it. popupNotice already applies the precedence rules
  // (src/lib/notices/center.ts) and is null when nothing may interrupt.
  const autoNotice = noticeCenter.popupNotice;
  const autoNoticeVisible =
    noticeCenter.hydrated && autoNotice !== null && coachmarksDue === false && !autoNoticeDismissed;
  // The bell opens the newest UNREAD notice, falling back to the newest one
  // when everything is read. Positional notices[0] made the bell disagree with
  // its own dot: the dot is raised by the unread set, so tapping it could open
  // an already-read notice and leave the dot lit with no way to clear it.
  // Gated on `hydrated` like every other notice path - without it the bell can
  // open the bundled release note and then re-render as an arriving remote
  // notice under the user's finger, marking one they never saw as read.
  const manualNotice = noticeCenter.hydrated
    ? (noticeCenter.notices.find((notice) => noticeCenter.isUnread(notice.id)) ??
      noticeCenter.notices[0] ??
      null)
    : null;
  const tickerText = manualNotice
    ? `${reasoningCopy.notices} · ${manualNotice.title[homeReasoningLocale(i18n.language) === "ko" ? "ko" : "en"]}`
    : null;
  const openNotice = () => {
    setBubble({ kind: "intro" });
    setManualNoticeVisible(true);
  };
  const shownNotice = manualNoticeVisible ? manualNotice : autoNotice;
  const dismissNotice = () => {
    setAutoNoticeDismissed(true);
    setManualNoticeVisible(false);
    if (shownNotice) void noticeCenter.markSeen(shownNotice.id);
  };
  const reasoningMode: ReasoningBubbleMode =
    task.phase === "running" && task.resultHref === "/reasoning"
      ? "running"
      : reasoningStatus.remaining !== null && reasoningStatus.remaining <= 0
        ? "depleted"
        : reasoningStatus.automatic
          ? "automatic"
          : "available";

  return (
    <View style={styles.root} onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* Opaque stage floor, shared starfield and static neural field. */}
      <Animated.View testID="star-camera-sky" pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [
        { translateX: destinationProgress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, cameraAim.x, cameraAim.x] }) },
        { translateY: destinationProgress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, cameraAim.y, cameraAim.y] }) },
        { rotate: destinationProgress.interpolate({ inputRange: [0, 0.4, 0.8, 1], outputRange: ['0deg', `${cameraAim.roll}deg`, '0deg', '0deg'] }) },
        { scale: destinationProgress.interpolate({ inputRange: [0, 0.4, 0.8, 1], outputRange: [1, 1.08, 1.28, 1.28] }) },
      ] }]}>
        {stage ? <NeuralFieldBackdrop w={stage.w} h={stage.h} /> : null}
        <SbStarfield />
      </Animated.View>

      {/* The four home controls share one bar. Keep the chip visuals on Views:
          Fabric Android can drop styles applied directly to Pressable. */}
      <View style={styles.topBar}>
        <View style={styles.topBarStart}>
          <View style={styles.bell}>
            <Pressable
              onPress={onBellPress}
              accessibilityRole="button"
              accessibilityLabel={t("ds.home.inbox")}
              hitSlop={14}
            >
              <PixelGlyph name="notifications" color={m3.accent.bellGlyph} size={20} />
            </Pressable>
            {hasUnread ? <View pointerEvents="none" style={styles.bellDot} /> : null}
          </View>

          <View style={styles.museumChip}>
            <Pressable
              onPress={onMuseumPress}
              accessibilityRole="button"
              accessibilityLabel={t("ds.home.museumEntry")}
              hitSlop={14}
            >
              <PixelGlyph name="account_balance" color={m3.accent.bellGlyph} size={20} />
            </Pressable>
          </View>

          {/* Community stays hidden until the user's adult status is known. */}
          {isMinor === false ? (
            <View style={styles.communityChip}>
              <Pressable
                onPress={onCommunityPress}
                accessibilityRole="button"
                accessibilityLabel={t("ds.home.communityEntry")}
                hitSlop={14}
              >
                <PixelGlyph name="groups" color={m3.accent.bellGlyph} size={20} />
              </Pressable>
            </View>
          ) : null}
        </View>

        {tickerText ? (
          <NoticeTicker key={tickerText} text={tickerText} reducedMotion={reducedMotion} onPress={openNotice} />
        ) : null}

        {/* Campaign notice keeps its own persisted unread signal. */}
        <View style={styles.noticeBell}>
          <Pressable
            onPress={openNotice}
            accessibilityRole="button"
            accessibilityLabel={reasoningCopy.notices}
            hitSlop={14}
          >
            <PixelGlyph name="campaign" color={m3.color.primary} size={20} />
          </Pressable>
          {noticeCenter.unreadCount > 0 ? <View pointerEvents="none" style={styles.bellDot} /> : null}
        </View>
      </View>

      {/* The instrument stage keeps controls clear of SecondB and the root dock. */}
      <View style={styles.constellationBlock}>
        <View style={styles.skyViewport} onLayout={({ nativeEvent: { layout } }) => setSkySize({ width: layout.width, height: layout.height })}>
        {/* Keep the SAME world mounted throughout approach and retreat. Only
            its camera changes; neighbours leave through the viewport edges. */}
        <Animated.View testID="star-camera-world" pointerEvents={visualFocusId ? "none" : "auto"}
          aria-hidden={!!visualFocusId} accessibilityElementsHidden={!!visualFocusId} importantForAccessibility={visualFocusId ? "no-hide-descendants" : "auto"}
          style={{ position: "absolute", left: (skySize.width - boxW) / 2, top: (skySize.height - instrumentHeight - boxH) / 2,
            width: boxW, height: boxH, transform: [{ translateX: worldX }, { translateY: worldY }, { scale: worldZoom }] }}>
          <Svg width={boxW} height={boxH} pointerEvents="none">
            <Defs>
              {/* 광채는 알파 그라디언트가 아니라 **디더**다 (PIXEL-CLAY 규칙 4:
                  정적 불투명도 대신 디더/색 밴딩). patternUnits="userSpaceOnUse"
                  라 타일이 SVG 원점에 고정되고, 그래서 모든 별의 디더가 같은
                  화면 픽셀 격자 위에 놓인다 — 별마다 격자가 어긋나지 않는다. */}
              {/* 사다리 다섯 단을 **디더 밀도**로 낸다. 전에는 50% 체커 하나에
                  `opacity` 를 얹어 밝기를 표현했는데, 그 alpha 가 규칙 4 위반이었다.
                  이제 밀도가 밝기다 — 켜는 칸이 3·6·9·12·16 (16칸 중)으로 오른다.
                  `patternUnits="userSpaceOnUse"` 라 타일이 SVG 원점에 고정되고,
                  그래서 모든 별의 디더가 같은 화면 픽셀 격자 위에 놓인다. */}
              {LADDER_ON_CELLS.map((_, i) => (
                <Pattern
                  key={`star-l${i}`}
                  id={`ds-star-l${i}`}
                  patternUnits="userSpaceOnUse"
                  x={0}
                  y={0}
                  width={DITHER_TILE}
                  height={DITHER_TILE}
                >
                  <Rect x={0} y={0} width={DITHER_TILE} height={DITHER_TILE} fill={DOMAIN_HALO_BASE} />
                  {ladderDitherCells(i + 1).map((c, j) => (
                    <Rect key={j} x={c.x} y={c.y} width={1} height={1} fill={DOMAIN_HALO_LIGHT} />
                  ))}
                </Pattern>
              ))}
              {LADDER_ON_CELLS.map((_, i) => (
                <Pattern
                  key={`pol-l${i}`}
                  id={`ds-polaris-l${i}`}
                  patternUnits="userSpaceOnUse"
                  x={0}
                  y={0}
                  width={DITHER_TILE}
                  height={DITHER_TILE}
                >
                  <Rect x={0} y={0} width={DITHER_TILE} height={DITHER_TILE} fill={POLARIS_HALO_BASE} />
                  {ladderDitherCells(i + 1).map((c, j) => (
                    <Rect key={j} x={c.x} y={c.y} width={1} height={1} fill={POLARIS_HALO_LIGHT} />
                  ))}
                </Pattern>
              ))}
            </Defs>
            {[...cellsOf(BOWL, true), ...cellsOf(HANDLE)].map((p, i) => (
              <Rect key={`dip${i}`} x={p.x} y={p.y} width={LINK_CELL} height={LINK_CELL} fill={DIPPER_LINK_FILL} />
            ))}
            {/* 지극성 안내선 — 원래 `strokeDasharray` 점선이었다. 셀에서 점선은
                **한 칸 건너 하나만 그리는 것**이다. 선이 캐논과 같은 두 별
                (work→now→북극성)을 지나는 것은 그대로다. */}
            {cellsOf([...GUIDE], false, [px(POLARIS.x), py(POLARIS.y)])
              .filter((_, i) => i % 3 === 0)
              .map((p, i) => (
                <Rect key={`gd${i}`} x={p.x} y={p.y} width={LINK_CELL} height={LINK_CELL} fill={GUIDE_LINK_FILL} />
              ))}
            {/* 북극성: 색 밴딩 3단(디더 헤일로 -> polarisSoft -> 흰 코어).
                ⚠ 여기는 원래 **연속값**이었다. `soulCoreOpacity(0..1)` 을 그대로
                alpha 로 썼다. Simon 결정 2026-08-27 로 5단 밴딩을 택했고,
                그래서 미세한 밝기 변화는 사라진다("감수한다"고 명시).
                도메인 별과 달리 여기는 **손실이 있는** 변환이다. */}
            <PixelStarSvg cx={px(POLARIS.x)} cy={py(POLARIS.y)} r={POLARIS_HALO_R * k} fill={`url(#ds-polaris-l${polarisBand - 1})`} />
            <PixelStarSvg cx={px(POLARIS.x)} cy={py(POLARIS.y)} r={POLARIS_MID_R * k} fill={m3.starLadder.polarisMid[polarisBand - 1]} />
            <PixelStarSvg cx={px(POLARIS.x)} cy={py(POLARIS.y)} r={POLARIS_CORE_R * k} fill={m3.starLadder.polarisCore[polarisBand - 1]} />
            {REV2_STARS.map((s) => {
              const on = focusedId === s.id;
              const li = ladderIndex(levelOf(s.id));
              // Halo and core are one physical body under the world camera.
              const dotR = DOMAIN_CORE_R * k;
              return (
                <G key={s.id} testID={`star-body-${s.id}`}>
                  <PixelStarSvg
                    cx={px(s.x)}
                    cy={py(s.y)}
                    r={dotR * DOMAIN_HALO_MULT_REST}
                    fill={`url(#ds-star-l${li})`}
                  />
                  <PixelStarSvg
                    cx={px(s.x)}
                    cy={py(s.y)}
                    r={dotR}
                    fill={on ? m3.starLadder.focus[li] : m3.starLadder.rest[li]}
                  />
                </G>
              );
            })}
          </Svg>

          {/* star labels (10.5px/600 under each dot; polaris label under its orb).
              Geometry lives in star-label-layout.ts: a long name may take a second
              line only where that line lands on empty sky (T1a 2026-09-13: "Thirties
              and after" was cut to "Thirties and af…" on a 411dp phone). Both labels
              follow the system font size with no cap, as on main, and the geometry is
              measured at that scale (PR 1810 artifact gate F1, re-gate F1-R1). */}
          {REV2_STARS.map((s) => {
            const on = focusedId === s.id;
            const label = starLabels.stars[s.id];
            return (
              <Animated.Text
                key={`label-${s.id}`}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                numberOfLines={label.maxLines}
                pointerEvents="none"
                style={[styles.starLabel, label.frame, on && { color: m3.accent.starFocus }, { transform: [{ scale: Animated.divide(1, worldZoom) }] }]}
              >
                {starName(s.id)}
              </Animated.Text>
            );
          })}
          <Animated.Text
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            numberOfLines={1}
            style={[styles.polarisLabel, starLabels.polaris, { transform: [{ scale: Animated.divide(1, worldZoom) }] }]}
          >
            {t("ds.home.polaris")}
          </Animated.Text>

          {/* tap targets — LAYOUT NOTE (PR 680): positioning lives on Views;
              each Pressable inside is a bare full-size touch surface. */}
          <View style={[styles.hit, { left: px(POLARIS.x) - 28, top: py(POLARIS.y) - 28, width: 56, height: 56 }]}>
            <Pressable
              disabled={!!visualFocusId}
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
                  disabled={!!visualFocusId}
                  onPress={() => {
                    setCameraReady(false);
                    setVisualFocusId(s.id);
                    setBubble({ kind: "star", id: s.id });
                    // The domain card opens at the BOTTOM of the screen with no
                    // focus move; announce so a screen-reader user knows the tap
                    // registered and which star it selected (WCAG 4.1.3).
                    AccessibilityInfo.announceForAccessibility(starName(s.id));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={starName(s.id)}
                  // Level (the brightness signal) is otherwise conveyed by the
                  // colour band + dither density alone; expose it so a blind
                  // user hears the domain's progress.
                  {...a11yValue({ min: 1, max: 5, now: levelOf(s.id) })}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            );
          })}
        </Animated.View>
        {visualFocusId ? (
          <StarDestination
            active={focusedId !== null}
            progress={destinationProgress}
            name={starName(visualFocusId)}
            returnLabel={t("ds.home.bubble.returnToSky")}
            origin={flight.origin}
            originRadius={starRadius * camera.zoom}
            size={skySize}
            onReturn={() => setBubble({ kind: "intro" })}
            onReturned={() => setVisualFocusId(null)}
            onReady={() => setCameraReady(true)}
          />
        ) : null}
        </View>
        {!visualFocusId ? (
          <View style={styles.instrumentRow} onLayout={({ nativeEvent: { layout } }) => setInstrumentHeight(layout.height)}>
            <TelescopeControls
              zoom={camera.zoom}
              minZoom={1}
              maxZoom={3}
              onMove={(dx, dy) => setCamera((current) => moveTelescopeCamera(current, dx, dy, { width: skySize.width, height: skySize.height - instrumentHeight }))}
              onZoom={(zoom) => setCamera((current) => ({ ...current, zoom }))}
              onReset={() => setCamera({ x: 0, y: 0, zoom: 1 })}
            />
            <PixelPressable
              onPress={() => router.push("/dashboard")}
              accessibilityLabel={t("deepspace:telescope.phone")}
              contentStyle={styles.phoneButton}
            >
              <View style={styles.phoneScreen}>
                <View style={styles.phoneSpeaker} />
                <View style={styles.phoneApps}>
                  {[0, 1, 2, 3].map((key) => <View key={key} style={styles.phoneApp} />)}
                </View>
              </View>
              <Text style={styles.phoneCaption}>{t("deepspace:telescope.phoneLabel")}</Text>
            </PixelPressable>
          </View>
        ) : null}
      </View>

      {/* JRPG dialogue stage: SecondB becomes a framed portrait beside the copy.
          The live portrait remains the first-record coach target. */}
      <View style={[styles.headBlock, { minHeight: dialogueStageHeight }]}>
        <View style={styles.dialogueAnchor}>
          <JrpgDialogueBox
            speaker={t("ds.dock.chat")}
            tag={bubbleTag}
            title={bubbleTitle}
            fullText={bubbleLine}
            displayedText={dialogue.displayedText}
            isComplete={dialogue.isComplete}
            onReveal={dialogue.reveal}
            onAdvance={advanceDialogue}
            portrait={(
              <View ref={coachHeadTargetRef} collapsable={false}>
                <Pressable
                  onPress={advanceDialogue}
                  accessibilityRole="button"
                  accessibilityLabel={t("ds.home.headA11y")}
                  accessibilityHint={
                    coachFirstRecord ? t("deepspace:coachmarks.homeStep") : undefined
                  }
                >
                  <SecondbHead size={HOME_HEAD_SIZE} mood="neutral" track />
                </Pressable>
              </View>
            )}
            actions={bubble.kind === "tip" ? (
              <View style={styles.bubbleActions}>
                <MdButton
                  label={t("ds.home.bubble.next")}
                  variant="filled"
                  style={styles.dialogueAction}
                  hitSlop={DIALOGUE_ACTION_HIT_SLOP}
                  onPress={() => setBubble(nextHomeBubble)}
                />
                <MdButton
                  label={t("ds.home.bubble.openMenu")}
                  variant="tonal"
                  style={styles.dialogueAction}
                  hitSlop={DIALOGUE_ACTION_HIT_SLOP}
                  onPress={() => setBubble({ kind: "menu" })}
                />
              </View>
            ) : bubble.kind === "reasoning" ? (
              <View style={styles.bubbleActions}>
                {reasoningMode === "depleted" ? (
                  <>
                    {/* THE limit sheet owns the real ad path (spec F, 계약 14) and
                        applies the FULL rewarded gate — canShowRewardedAds:
                        consent + route allow-list. This entry precheck is the
                        cheap sync subset: adult + free + rewarded build flag. */}
                    {isMinor === false && progression.tier === "free" && rewardedAdsConfigured() ? (
                      <MdButton
                        label={reasoningCopy.adReward(REWARD_PER_WATCH)}
                        variant="filled"
                        style={styles.dialogueAction}
                        hitSlop={DIALOGUE_ACTION_HIT_SLOP}
                        onPress={() => {
                          setBubble({ kind: "intro" });
                          setLimitSheetVisible(true);
                        }}
                      />
                    ) : null}
                    <MdButton
                      label={reasoningCopy.viewPlans}
                      variant="tonal"
                      style={styles.dialogueAction}
                      hitSlop={DIALOGUE_ACTION_HIT_SLOP}
                      onPress={() => {
                        setBubble({ kind: "intro" });
                        router.push("/plans?from=reasoning_limit");
                      }}
                    />
                  </>
                ) : (
                  <>
                    <MdButton
                      label={
                        reasoningMode === "running"
                          ? reasoningCopy.viewProgress
                          : reasoningCopy.chooseItems
                      }
                      variant="filled"
                      style={styles.dialogueAction}
                      hitSlop={DIALOGUE_ACTION_HIT_SLOP}
                      onPress={() => {
                        setBubble({ kind: "intro" });
                        router.push("/reasoning");
                      }}
                    />
                    {reasoningMode !== "running" ? (
                      <MdButton
                        label={reasoningCopy.automaticButton}
                        variant="tonal"
                        style={styles.dialogueAction}
                        hitSlop={DIALOGUE_ACTION_HIT_SLOP}
                        onPress={() => {
                          setBubble({ kind: "intro" });
                          router.push("/reasoning");
                        }}
                      />
                    ) : null}
                  </>
                )}
              </View>
            ) : bubble.kind === "menu" ? (
              <View style={styles.bubbleActions}>
                <MdButton
                  label={t("ds.home.bubble.chatbot")}
                  variant="filled"
                  style={styles.dialogueAction}
                  hitSlop={DIALOGUE_ACTION_HIT_SLOP}
                  onPress={() => {
                    setBubble({ kind: "intro" });
                    onChatPress();
                  }}
                />
                <MdButton
                  label={t("ds.home.bubble.assistant")}
                  variant="tonal"
                  style={styles.dialogueAction}
                  hitSlop={DIALOGUE_ACTION_HIT_SLOP}
                  onPress={() => {
                    setBubble({ kind: "intro" });
                    onOpsPress();
                  }}
                />
              </View>
            ) : bubble.kind === "star" ? (
              <View style={styles.bubbleActions}>
                <MdButton
                  label={t("ds.home.bubble.travel")}
                  variant="filled"
                  disabled={selectedEntry?.kind !== "available" || !cameraReady || captureId !== null}
                  style={styles.dialogueAction}
                  hitSlop={DIALOGUE_ACTION_HIT_SLOP}
                  onPress={() => {
                    if (!cameraReady || selectedEntry?.kind !== 'available' || captureLock.current) return;
                    captureLock.current = true;
                    setCaptureId(bubble.id);
                  }}
                />
                <MdButton
                  label={t("ds.home.bubble.later")}
                  disabled={captureId !== null}
                  variant="text"
                  style={styles.dialogueAction}
                  hitSlop={DIALOGUE_ACTION_HIT_SLOP}
                  onPress={() => setBubble({ kind: "intro" })}
                />
              </View>
            ) : undefined}
          />
        </View>
      </View>
      {shownNotice ? (
        <NoticeDialog
          visible={homeFocused && (autoNoticeVisible || manualNoticeVisible)}
          notice={shownNotice}
          index={0}
          showPager={false}
          // Dismissing by ANY route records the read, not just 확인.
          // The dialog interrupted the user and put the notice on screen, so
          // that is what "read" means here. With 확인 as the only writer, a
          // backdrop tap or Android hardware back left no row and the same
          // major notice re-interrupted on every single cold start, forever,
          // while docs/OPERATIONS-NOTICES.md promised the opposite and its
          // read-count query undercounted the notice's real reach.
          onClose={() => {
            dismissNotice();
          }}
          onList={() => {
            dismissNotice();
            router.push("/notices");
          }}
          onConfirm={() => {
            dismissNotice();
          }}
        />
      ) : null}
      <ReasoningLimitSheet
        visible={limitSheetVisible}
        onClose={() => setLimitSheetVisible(false)}
        onChanged={() => void refreshReasoningStatus()}
      />
      {homeFocused && captureId ? (
        <StarCapture
          onCancel={() => { captureLock.current = false; setCaptureId(null); }}
          onComplete={() => {
            if (!captureLock.current || !homeActive.current) return;
            captureLock.current = false;
            const id = captureId;
            setCaptureId(null);
            setVisualFocusId(null);
            setCameraReady(false);
            destinationProgress.setValue(0);
            setBubble({ kind: 'intro' });
            onStarTravel(id);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 52,
    zIndex: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: m3.color.surfaceBright,
    backgroundColor: m3.color.surfaceContainer,
  },
  topBarStart: {
    flexDirection: "row",
    gap: 8,
  },
  tickerPress: {
    flex: 1,
    minWidth: 0,
    height: 40,
    marginHorizontal: 8,
    justifyContent: "center",
  },
  tickerTrack: {
    height: 32,
    overflow: "hidden",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: m3.color.outline,
    backgroundColor: m3.color.surface,
  },
  tickerMotion: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  tickerText: {
    flexShrink: 0,
    paddingHorizontal: 6,
    paddingBottom: 2,
    color: m3.accent.bellGlyph,
    fontFamily: m3.font.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.surfaceContainerHighest,
    ...m3.elevation.level2,
  },
  noticeBell: {
    width: 40,
    height: 40,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: m3.color.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.primaryContainer,
    ...m3.elevation.level2,
  },
  museumChip: {
    width: 40,
    height: 40,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.surfaceContainerHighest,
    ...m3.elevation.level2,
  },
  communityChip: {
    width: 40,
    height: 40,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.surfaceContainerHighest,
    ...m3.elevation.level2,
  },
  bellDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 0,
    backgroundColor: m3.accent.alertDot,
  },
  constellationBlock: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 52,
    zIndex: 3,
    overflow: "hidden",
  },
  skyViewport: { flex: 1, width: "100%", minHeight: 0, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  instrumentRow: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  phoneButton: { width: 48, minHeight: 72, paddingHorizontal: 4, paddingVertical: 4, alignItems: "center", gap: 4 },
  phoneScreen: { width: 28, height: 40, borderWidth: 2, borderColor: m3.color.outline, backgroundColor: m3.color.surface, padding: 3, gap: 5 },
  phoneSpeaker: { alignSelf: "center", width: 10, height: 2, backgroundColor: m3.color.onSurfaceVariant },
  phoneApps: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
  phoneApp: { width: 6, height: 6, backgroundColor: m3.color.primary },
  phoneCaption: { fontFamily: m3.font.mono, fontSize: 10, lineHeight: 16, color: m3.color.onSurface },
  // left/top/width/fontSize/lineHeight of both labels come from star-label-layout.ts.
  starLabel: {
    position: "absolute",
    textAlign: "center",
    color: homeAlpha(m3.accent.starLabel, 0.78),
    fontWeight: "600",
    letterSpacing: 0.2,
    fontFamily: fontFamilies.readable,
  },
  polarisLabel: {
    position: "absolute",
    textAlign: "center",
    color: homeAlpha(m3.accent.polarisSoft, 0.92),
    fontWeight: "600",
    letterSpacing: 0.2,
    fontFamily: fontFamilies.readable,
  },
  hit: { position: "absolute" },
  headBlock: { flexGrow: 0, flexShrink: 0, zIndex: 5 },
  dialogueAnchor: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: m3.spacing.s3,
  },
  bubbleActions: {
    minWidth: 0,
    alignSelf: "stretch",
    alignItems: "center",
    flexDirection: "row",
    gap: m3.spacing.s3,
    justifyContent: "center",
  },
  dialogueAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    paddingHorizontal: m3.spacing.s1,
  },
});
