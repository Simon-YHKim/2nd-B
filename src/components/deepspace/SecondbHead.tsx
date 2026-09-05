// SecondB character head (deep-space canon — design/2nd-Brain 화면설계.dc.html;
// PIXEL-CLAY hull from design/pixel_clay_260825 px-primitives `SbHead`, 2026-09-05).
//
// The head is a 16x16 pixel hull (secondb-hull.ts: antenna, crown, pods, visor,
// chin as integer rects) and the LIFE is layered over it in RN: two glowing cyan
// eyes and a mouth on the visor. The eyes BLINK on a random cadence and the face
// TRACKS the user's touch: the head shifts toward the touch while the eyes/mouth
// shift a few px the same way. It does NOT tilt: the bundle's SbHead treats tilt as
// a grid violation, and a rotated 16 grid resamples into blur. There is NO floating
// orb above the head (the canon has none; emotion is read from the live face).
//
// EXPRESSIONS: the face vocabulary is 13 deep (lib/companion/faces.ts is the
// geometry SoT — per-eye lids/tilt/arc, six mouth kinds, gaze offsets, blink
// cadence). Every mounted head resolves one face per frame:
//
//     reaction  ??  hold  ??  idle  ??  base mood(prop)
//
//   · reaction — reactExpression("sad") etc: a beat-long flash on EVERY head.
//   · hold     — holdExpression("thinking") while an AI call is in flight.
//   · idle     — 평소 딴청: on a quiet head the idle policy occasionally rolls a
//                whistle / bored look-away (sleepy after a long stretch). Blink
//                keeps running underneath throughout.
//   · base     — the screen's `mood` prop (3-mood back-compat surface).
//
// Tracking is AUTO by size: heads >= 80 ("big") follow touch when under a
// <SecondbHeadTrackProvider>; smaller header heads only bob + blink (canon §0.1:
// the status-bar head does not track). Override with `track`.
//
//   <SecondbHead size={158} mood="neutral" />    // big: track + bob + blink + face
//   <SecondbHead size={48}  mood="neutral" />     // small: bob + blink + face only
//   <SecondbHead size={158} track={false} />      // big but opt out of tracking
//
// Driver layout (avoids native/JS driver conflicts on one node):
//   static measure node  ->  tracking node (JS)  ->  bob node (native)  ->  face

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import Svg, { Rect } from "react-native-svg";

import { deepSpace, flattenAlpha } from "@/lib/theme/tokens";
import { stepLine, stepQuad, type LineCell } from "@/components/pixel/pixel-line";
import { m3, type M3Persona } from "@/lib/theme/m3";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { subscribeExpression, subscribeHold, type Expression } from "@/lib/companion/expression";
import { FACES, nextIdleDelayMs, pickIdleAction, type FaceSpec, type MouthKind } from "@/lib/companion/faces";
import { useSecondbTracking } from "./SecondbHeadTrack";
import { SECONDB_FACE, SECONDB_GRID, secondbHullRects, snapHeadSize, type HullPalette } from "./secondb-hull";

export type SecondbMood = "positive" | "neutral" | "negative";

interface SecondbHeadProps {
  mood?: SecondbMood;
  /** 세컨비 persona tint (rev2): secondb / meta / twi. Omit for the canonical cyan. */
  persona?: M3Persona;
  size?: number;
  /**
   * Follow the user's touch (needs SecondbHeadTrackProvider above). Omit to AUTO-
   * decide by size: big heads (>= 80) track, small heads don't, so one provider
   * mount extends tracking to every screen. Pass a boolean to override.
   */
  track?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// Face-BLANK hull: the body comes from secondb-hull.ts (the bundle's `head-blank`,
// 11 integer rects on a 16 grid) and the face is drawn ENTIRELY by this component
// on the visor. secondb-head-front.png (loading screen) stays the static reference
// for the neutral pose (사용자 지시 2026-07-16). Colors are canon ramp tokens only:
// the canon test forbids hex literals in this file.

/** Heads at or above this size are "big" and track by default. */
const BIG_HEAD_MIN = 80;

// 입은 여섯 가지(faces.ts 가 표정마다 고른다):
//   smile ◡ · flat — · frown ◠ · open (웃는 D, 채움) · o (휘파람/놀람, 링) ·
//   smirk (한쪽만 올라간 잘난척 입).
//
// ## 곡선에서 셀로 (PIXEL-CLAY 규칙 1)
//
// 전에는 `<Path d="M… Q…">` 한 줄이었다. 이제 같은 곡선을 **정수 셀**로 놓는다.
// ⚠ 표정은 이 캐릭터의 전부라 셀 크기를 획 굵기(`mouthStroke`)에 맞춘다 —
//   더 크게 잡으면 웃는 입과 무표정이 구분이 안 된다.
function mouthCells(kind: MouthKind, w: number, h: number, cell: number): LineCell[] {
  const midY = h / 2;
  const depth = h * 0.62;
  switch (kind) {
    case "smile":
      return stepQuad(1, midY - depth / 2, w / 2, midY + depth, w - 1, midY - depth / 2, cell);
    case "frown":
      return stepQuad(1, midY + depth / 2, w / 2, midY - depth, w - 1, midY + depth / 2, cell);
    case "open": {
      // 벌린 입 — 윤곽이 아니라 **채운 덩어리**다. 위는 곧고 아래가 둥글다.
      const out: LineCell[] = [];
      const top = midY - depth / 2;
      const rows = Math.max(2, Math.round((depth * 1.4) / cell));
      for (let i = 0; i < rows; i += 1) {
        const t = i / rows;
        const half = (w / 2 - 1) * (1 - t * t);
        out.push(...stepLine(w / 2 - half, top + i * cell, w / 2 + half, top + i * cell, cell));
      }
      return out;
    }
    case "smirk":
      return stepQuad(1, midY + depth * 0.15, w * 0.62, midY + depth * 0.35, w - 1, midY - depth * 0.7, cell);
    case "o": {
      // 휘파람 — 사각 링. 원을 셀로 놓으면 이 크기에서 그냥 사각이 된다.
      const r = Math.max(cell, Math.min(w, h) / 2 - 1);
      const x0 = w / 2 - r;
      const y0 = h / 2 - r;
      const x1 = w / 2 + r;
      const y1 = h / 2 + r;
      return [
        ...stepLine(x0, y0, x1, y0, cell),
        ...stepLine(x1, y0, x1, y1, cell),
        ...stepLine(x1, y1, x0, y1, cell),
        ...stepLine(x0, y1, x0, y0, cell),
      ];
    }
    case "flat":
    default:
      return stepLine(1, midY, w - 1, midY, cell);
  }
}

/**
 * 발광 + 심 두 겹을 셀로 그린다.
 *
 * 전에는 같은 path 를 굵은 획·얇은 획으로 두 번 그려 발광을 만들었다.
 * rect 로는 **큰 셀 아래에 작은 셀**을 겹치는 것이 같은 일을 한다.
 */
function GlowCells({ cells, cell, glow, core }: { cells: LineCell[]; cell: number; glow: string; core: string }) {
  return (
    <>
      {cells.map((p, i) => (
        <Rect key={`g${i}`} x={p.x - cell} y={p.y - cell} width={cell * 3} height={cell * 3} fill={glow} />
      ))}
      {cells.map((p, i) => (
        <Rect key={`c${i}`} x={p.x} y={p.y} width={cell} height={cell} fill={core} />
      ))}
    </>
  );
}

// ⚠ 원이 아니라 **사각**이다. 곡선 도형을 감싼 별칭은 가드가 추적한다
//   (`check:pixel-rules` 의 `curveAliasPattern`) — Rect 는 걸리지 않는다.
function SvgRect({ collapsable: _collapsable, ...props }: ComponentProps<typeof Rect> & { collapsable?: boolean }) {
  return <Rect {...props} />;
}

const AnimatedRect = Animated.createAnimatedComponent(SvgRect);

/** Tiny cyan eighth-note that floats beside the mouth while whistling. */
function WhistleNote({ size, accent, reduce }: { size: number; accent: string; reduce: boolean }) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      drift.setValue(0.5);
      return;
    }
    // JS driver on purpose — every face-layer animation stays on the JS side
    // (see the blink note below for why mixing drivers here throws).
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 900, easing: pixelStepsFor(900), useNativeDriver: false }),
        Animated.timing(drift, { toValue: 0, duration: 900, easing: pixelStepsFor(900), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduce]);
  const noteSize = Math.max(7, size * 0.1);
  // 어두운 쪽·밝은 쪽을 **화면 배경 위에 미리 합성**해 둔다. 음표는 그 위에 떠 있다.
  const noteFill = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [flattenAlpha(accent, 0.45, deepSpace.bg), flattenAlpha(accent, 0.95, deepSpace.bg)],
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: size * 0.66,
        top: size * 0.56,
        // ⚠ **불투명도를 쓰지 않는다**(규칙 4). 예전에는 opacity 를 0.45↔0.95 로
        //   흘렸는데, 픽셀아트에서 밝기는 투명도가 아니라 **색**이다. 아래 `fill` 이
        //   미리 합성한 두 색 사이를 오간다. 떠오르는 움직임은 그대로 둔다.
        transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [1.5, -2.5] }) }],
      }}
    >
      {/* 8분음표 — 기둥 + 깃발 + 머리. 곡선이었던 것을 셀 넷으로. */}
      <Svg width={noteSize} height={noteSize} viewBox="0 0 10 10">
        <AnimatedRect x={4} y={2} width={1.4} height={6} fill={noteFill} />
        <AnimatedRect x={5.4} y={1.4} width={2.6} height={1.4} fill={noteFill} />
        <AnimatedRect x={6.6} y={2.8} width={1.4} height={1.4} fill={noteFill} />
        <AnimatedRect x={1.6} y={6.6} width={3.4} height={3} fill={noteFill} />
      </Svg>
    </Animated.View>
  );
}

export function SecondbHead({ mood = "neutral", persona, size: sizeProp = 48, track, accessibilityLabel, style }: SecondbHeadProps) {
  // PIXEL-CLAY: the drawn head is the largest multiple of 16 that fits the requested
  // box, so every grid cell is a whole number of px (72 -> 64, 158 -> 144). Every
  // fraction below is of this snapped size; `sizeProp` still decides tracking.
  const size = snapHeadSize(sizeProp);
  const reduce = useReducedMotionPref();
  const bob = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current; // 1 = eyes open, ~0.08 = shut

  // Reaction layer (save -> happy, delete -> sad): overrides the base mood for a
  // beat, then reverts. Hold layer (AI 응답 대기): sticky until released. Idle
  // layer (딴청): rolled by the idle policy when nothing else is going on.
  const [reactExpr, setReactExpr] = useState<Expression | null>(null);
  const [holdExpr, setHoldExpr] = useState<Expression | null>(null);
  const [idleExpr, setIdleExpr] = useState<Expression | null>(null);
  const reactRef = useRef<Expression | null>(null);
  const holdRef = useRef<Expression | null>(null);
  const lastActiveRef = useRef(Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offReact = subscribeExpression((expr, dur) => {
      reactRef.current = expr;
      lastActiveRef.current = Date.now();
      setReactExpr(expr);
      setIdleExpr(null); // a real moment interrupts any 딴청
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        reactRef.current = null;
        setReactExpr(null);
      }, dur);
    });
    const offHold = subscribeHold((expr) => {
      holdRef.current = expr;
      lastActiveRef.current = Date.now();
      setHoldExpr(expr);
      if (expr) setIdleExpr(null);
    });
    return () => {
      offReact();
      offHold();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Idle policy (평소): occasionally whistle / look away bored; sleepy after a
  // long quiet stretch. The pure cadence lives in faces.ts. Reduced motion opts
  // out entirely.
  useEffect(() => {
    if (reduce) {
      setIdleExpr(null);
      return;
    }
    let rollTimer: ReturnType<typeof setTimeout> | undefined;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const loop = () => {
      rollTimer = setTimeout(() => {
        if (cancelled) return;
        if (!reactRef.current && !holdRef.current) {
          const quietMs = Date.now() - lastActiveRef.current;
          const action = pickIdleAction(Math.random, quietMs);
          if (action.expr) {
            setIdleExpr(action.expr);
            clearTimer = setTimeout(() => {
              if (!cancelled) setIdleExpr(null);
            }, action.holdMs);
          }
        }
        loop();
      }, nextIdleDelayMs());
    };
    loop();
    return () => {
      cancelled = true;
      if (rollTimer) clearTimeout(rollTimer);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [reduce]);

  const effExpr: Expression = reactExpr ?? holdExpr ?? idleExpr ?? mood;
  const face: FaceSpec = FACES[effExpr];
  // Persona tint (rev2): personas share the silhouette; only the accent glow
  // differs. Unset persona keeps the canonical deep-space cyan (no regression).
  const accent = persona ? m3.persona[persona].accent : deepSpace.accent;

  const tracking = useSecondbTracking();
  // Auto by size when `track` is omitted: big heads follow touch, small heads don't.
  const wantsTrack = track ?? sizeProp >= BIG_HEAD_MIN;
  const enabled = wantsTrack && !!tracking && !reduce;
  const rootRef = useRef<View>(null);
  const [center, setCenter] = useState<{ x: number; y: number; ready: boolean }>({ x: 0, y: 0, ready: false });

  // Calm bob (둥둥). Reduced motion holds it still.
  useEffect(() => {
    if (reduce) {
      bob.setValue(0);
      return;
    }
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 2000, easing: pixelStepsFor(2000), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2000, easing: pixelStepsFor(2000), useNativeDriver: true }),
      ]),
    );
    bobLoop.start();
    return () => bobLoop.stop();
  }, [bob, reduce]);

  // Blink on a random cadence (canon: ~130ms close, next in 1.6-4.8s). Reduced
  // motion keeps the eyes open. The current face sets the cadence: `slow`
  // (sleepy/bored/sad/thinking) blinks about half as often and a touch heavier;
  // `none` (arc-closed eyes: happy/wink/surprised) suspends blinking while that
  // face shows.
  const blinkMode = face.blink;
  useEffect(() => {
    if (reduce || blinkMode === "none") {
      blink.setValue(1);
      return;
    }
    const slow = blinkMode === "slow" ? 2.1 : 1;
    const lidMs = blinkMode === "slow" ? 1.6 : 1;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.sequence([
          // JS driver (NOT native): blink's scaleY shares the eye's transform with
          // the JS-driven look-at (eyeOffset, from the setValue-driven engage/touch).
          // A native blink would move that node to the native side, and the
          // SecondbHeadTrack provider's JS setValue/spring on touch/engage would then
          // throw "JS driven animation on a node moved to native" on the next touch.
          Animated.timing(blink, { toValue: 0.08, duration: 65 * lidMs, easing: pixelStepsFor(65 * lidMs), useNativeDriver: false }),
          Animated.timing(blink, { toValue: 1, duration: 75 * lidMs, easing: pixelStepsFor(75 * lidMs), useNativeDriver: false }),
        ]).start(() => {
          if (!cancelled) schedule();
        });
      }, (1600 + Math.random() * 3200) * slow);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [blink, reduce, blinkMode]);

  // Measure the static root's window center so touch offsets are accurate.
  const measure = () => {
    if (!enabled) return;
    rootRef.current?.measureInWindow((x, y, w, h) => {
      if (w && h) setCenter({ x: x + w / 2, y: y + h / 2, ready: true });
    });
  };

  const bobStyle = useMemo(
    () => ({ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }),
    [bob],
  );

  // Head look-at toward the touch, scaled by engage (eases in on touch, springs
  // back to a centered rest on release). PIXEL-CLAY: translate ONLY. The bundle's
  // SbHead ignores tilt as a grid violation, and the former perspective +
  // rotateX/rotateY + scale resampled the 16 grid into subpixel blur. The eyes
  // carry the gaze (eyeOffset below).
  const trackStyle = useMemo(() => {
    if (!enabled || !center.ready || !tracking) return null;
    const { touch, engage } = tracking;
    const reach = 200; // px from head center mapped to full deflection
    const maxShift = size * 0.12;
    const dx = Animated.subtract(touch.x, center.x);
    const dy = Animated.subtract(touch.y, center.y);

    const shift = (d: Animated.AnimatedSubtraction<number>) =>
      Animated.multiply(
        engage,
        d.interpolate({ inputRange: [-reach, reach], outputRange: [-maxShift, maxShift], extrapolate: "clamp" }),
      );

    return { transform: [{ translateX: shift(dx) }, { translateY: shift(dy) }] };
  }, [enabled, center.x, center.y, center.ready, size, tracking]);

  // Eyes drift a few px toward the touch (smaller than the head shift). null when
  // tracking is off, so the eye transform stays purely blink (+ the face's own
  // fixed gaze offset — thinking looks up-side, bored looks away).
  const eyeOffset = useMemo(() => {
    if (!enabled || !center.ready || !tracking) return null;
    const { touch, engage } = tracking;
    const reach = 200;
    const exMax = size * 0.035; // canon 5.5px @158
    const eyMax = size * 0.022; // canon 3.5px @158
    const dx = Animated.subtract(touch.x, center.x);
    const dy = Animated.subtract(touch.y, center.y);
    return {
      x: Animated.multiply(engage, dx.interpolate({ inputRange: [-reach, reach], outputRange: [-exMax, exMax], extrapolate: "clamp" })),
      y: Animated.multiply(engage, dy.interpolate({ inputRange: [-reach, reach], outputRange: [-eyMax, eyMax], extrapolate: "clamp" })),
    };
  }, [enabled, center.x, center.y, center.ready, size, tracking]);

  // Face geometry on the 16 grid (secondb-hull.ts, from the bundle's SbHead): eyes
  // are 2x3 cells at columns 4 and 10 with top row 6; the mouth sits on row 10, the
  // hull band right under the visor. One grid cell is the pixel unit for every face
  // shape so lids, arcs and mouth curves land on whole cells.
  const cell = size / SECONDB_GRID;
  const eyeW = size * SECONDB_FACE.eyeW;
  const eyeHBase = size * SECONDB_FACE.eyeH;
  // 눈의 세로 중심. faces.ts 의 `top` 은 3D 렌더 PNG 의 바이저에 맞춘 값이라 더
  // 쓰지 않는다: 격자에서는 모든 표정이 같은 행에 앉고, 표정은 h/tilt/arc 로 낸다.
  const eyeCy = SECONDB_FACE.eyeTop + SECONDB_FACE.eyeH / 2;
  // PIXEL-CLAY 규칙 2 — 격자에는 모서리가 없다.
  // 발광의 한 칸: 밝은 심 둘레에 accentGlow 테두리를 두른다. RN 의 border 는
  // 안쪽으로 그려지므로 상자를 2칸씩 키우고 그만큼 위치를 당겨, **심의 크기와
  // 자리는 그대로** 두고 테두리만 바깥에 생기게 한다.
  const glowBand = 2;
  const mouthW = size * SECONDB_FACE.mouthW * (face.mouthScale ?? 1);
  const mouthBoxH = cell * 2;
  const mouthStroke = cell;
  const gazeX = (face.lookX ?? 0) * size;
  const gazeY = (face.lookY ?? 0) * size;

  // Hull palette: canon ramp tokens only (the canon test forbids hex literals here).
  // c03 hull, c02 pods and chin, c04 crown highlight, c00 visor (the bundle's own
  // visor token sits one step off the ramp; the sunken ground stands in for it),
  // antenna tip = mood color, like the bundle's `--sb-mood-*`.
  const hull: HullPalette = {
    hull: m3.color.surfaceBright,
    hullDark: m3.color.surfaceContainerHigh,
    hullLight: m3.color.onSurfaceVariant,
    visor: deepSpace.bgEdge,
    antenna: mood === "positive" ? m3.accent.moodPositive : mood === "negative" ? m3.accent.moodNegative : m3.accent.moodNeutral,
  };

  return (
    <View ref={rootRef} onLayout={measure} collapsable={false} style={[styles.root, style]}>
      <Animated.View style={trackStyle}>
        <Animated.View
          style={[styles.wrap, { width: size, height: size }, bobStyle]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
        >
          {/* 16x16 pixel hull. No image and no fade: sprites pop (PIXEL-CLAY 규칙 4). */}
          <Svg width={size} height={size} viewBox="0 0 16 16" pointerEvents="none">
            {secondbHullRects(hull).map(([x, y, w, h, fill], i) => (
              <SvgRect key={i} x={x} y={y} width={w} height={h} fill={fill} />
            ))}
          </Svg>

          {/* Eyes — glowing cyan; blink + drift toward touch, expression-shaped
              PER SIDE (wink closes one; smug half-lowers one; sad droops both). */}
          {SECONDB_FACE.eyeCx.map((cx, i) => {
            const spec = face.eyes[i];
            const eyeH = eyeHBase * spec.h;
            // Sad: outer corners drop — left eye tilts one way, right eye mirrors.
            const tilt = spec.tilt === 0 ? "0deg" : `${i === 0 ? -spec.tilt : spec.tilt}deg`;

            if (spec.arc) {
              // Closed smiling eye (∪): a stroked arc instead of the glowing pill.
              // No pupil, no blink — it IS a blink held at its happiest frame.
              const arcW = eyeW * 1.9;
              const arcH = Math.max(3, eyeHBase * 0.55);
              return (
                <View
                  key={i}
                  pointerEvents="none"
                  style={[
                    styles.arcEye,
                    { left: size * cx - arcW / 2 + gazeX, top: size * eyeCy - arcH / 2 + gazeY, shadowColor: accent },
                  ]}
                >
                  <Svg width={arcW} height={arcH}>
                    {/* 아래: 굵은 셀. 위: 작은 셀. 두 겹이 발광을 만든다. */}
                    <GlowCells
                      cells={stepQuad(1, 1, arcW / 2, arcH * 1.6, arcW - 1, 1, cell)}
                      cell={cell}
                      glow={deepSpace.accentGlow}
                      core={accent}
                    />
                  </Svg>
                </View>
              );
            }

            const transform = eyeOffset
              ? [{ translateX: eyeOffset.x }, { translateY: eyeOffset.y }, { rotate: tilt }, { scaleY: blink }]
              : [{ rotate: tilt }, { scaleY: blink }];
            return (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={[
                  styles.eye,
                  {
                    width: eyeW + glowBand * 2,
                    height: eyeH + glowBand * 2,
                    left: size * cx - eyeW / 2 + gazeX - glowBand,
                    top: size * eyeCy - eyeH / 2 + gazeY - glowBand,
                    transform,
                    backgroundColor: accent,
                    shadowColor: accent,
                  },
                ]}
              />
            );
          })}

          {/* Mouth — cyan SVG shape per expression: smile / flat / frown / open
              laugh (filled) / whistling·surprised o (ring) / smug smirk. */}
          <View
            pointerEvents="none"
            style={[
              styles.mouth,
              { width: mouthW, height: mouthBoxH, left: size * 0.5 - mouthW / 2, top: size * SECONDB_FACE.mouthCy - mouthBoxH / 2 },
            ]}
          >
            <Svg width={mouthW} height={mouthBoxH}>
              {/* 여섯 표정 전부 같은 길로 간다 — `o` 도 링 셀이라 분기가 필요 없다. */}
              <GlowCells
                cells={mouthCells(face.mouth, mouthW, mouthBoxH, mouthStroke)}
                cell={mouthStroke}
                glow={deepSpace.accentGlow}
                core={deepSpace.text}
              />
            </Svg>
          </View>

          {/* 휘파람 notelet — whistle only, cyan-identity, drifts gently. */}
          {face.note ? <WhistleNote size={size} accent={accent} reduce={reduce} /> : null}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
  // No rectangular shadow/elevation on the head: on web it renders as a square
  // box-shadow halo and on Android elevation casts a rectangular outline around
  // the transparent hull. The eyes carry their own glow band.
  wrap: { position: "relative", flexShrink: 0, alignItems: "center", justifyContent: "center" },
  // 발광은 블러가 아니라 **한 칸 어두운 테두리**다(PIXEL-CLAY 규칙 3·6).
  // borderWidth 는 안쪽으로 그려지므로 심(accent)은 그대로 남고 둘레만 밴드가 된다.
  eye: {
    position: "absolute",
    alignItems: "center",
    backgroundColor: deepSpace.accent,
    borderWidth: 2,
    borderColor: deepSpace.accentGlow,
    borderRadius: m3.shape.none,
  },
  // 감은 눈(호)과 입은 선이라 테두리를 두를 수 없다. 대신 같은 선을 **두 번**
  // 그린다 — 굵은 accentGlow 를 아래, 얇은 accent 를 위에. 픽셀아트의 발광이다.
  arcEye: { position: "absolute" },
  mouth: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
