// SecondB character head (deep-space canon — design/2nd-Brain 화면설계.dc.html).
//
// The head asset is a flat PNG; the LIFE is layered over it in RN exactly like the
// canon .dc.html: a dark face "screen", two glowing cyan eyes, and a mouth. The
// eyes BLINK on a random cadence and the whole face TRACKS the user's touch — the
// head does a 2.5D look-at turn toward the touch while the eyes/mouth shift a few
// px the same way. There is NO floating orb above the head (the canon has none;
// emotion is read from the live face, not a dot).
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

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, Path } from "react-native-svg";

import { deepSpace } from "@/lib/theme/tokens";
import { m3, type M3Persona } from "@/lib/theme/m3";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { subscribeExpression, subscribeHold, type Expression } from "@/lib/companion/expression";
import { FACES, nextIdleDelayMs, pickIdleAction, type FaceSpec, type MouthKind } from "@/lib/companion/faces";
import { useSecondbTracking } from "./SecondbHeadTrack";

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

// Face-BLANK head (clean black visor): the face is drawn ENTIRELY by this
// component, matching the baked face of secondb-head-front.png 1:1 in the
// neutral pose — that PNG (the loading screen / static contexts) is the
// reference design, so every context shows the same face (사용자 지시
// 2026-07-16: 로딩 화면의 세컨비가 레퍼런스).
const HEAD_IMAGE = require("../../../assets/deepspace/secondb-head-blank.png");

/** Heads at or above this size are "big" and track by default. */
const BIG_HEAD_MIN = 80;

// Mouth as an SVG curve, six kinds (faces.ts picks per expression):
//   smile ◡ · flat — · frown ◠ · open (filled happy D) · o (whistle/surprise
//   ring, drawn as a Circle) · smirk (one-sided curl, the 잘난척 mouth).
function mouthPath(kind: MouthKind, w: number, h: number): string {
  const midY = h / 2;
  const depth = h * 0.62;
  switch (kind) {
    case "smile":
      return `M1 ${midY - depth / 2} Q ${w / 2} ${midY + depth} ${w - 1} ${midY - depth / 2}`;
    case "frown":
      return `M1 ${midY + depth / 2} Q ${w / 2} ${midY - depth} ${w - 1} ${midY + depth / 2}`;
    case "open":
      // Closed area: straight top lip, round lower lip — an open laugh.
      return `M1 ${midY - depth / 2} L ${w - 1} ${midY - depth / 2} Q ${w / 2} ${midY + depth * 1.5} 1 ${midY - depth / 2} Z`;
    case "smirk":
      // Flat from the left, curling up only on the right.
      return `M1 ${midY + depth * 0.15} Q ${w * 0.62} ${midY + depth * 0.35} ${w - 1} ${midY - depth * 0.7}`;
    case "o": // rendered as a Circle, path unused — keep a fallback line
    case "flat":
    default:
      return `M1 ${midY} L ${w - 1} ${midY}`;
  }
}

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
        Animated.timing(drift, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(drift, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduce]);
  const noteSize = Math.max(7, size * 0.1);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: size * 0.66,
        top: size * 0.56,
        opacity: drift.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] }),
        transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [1.5, -2.5] }) }],
      }}
    >
      <Svg width={noteSize} height={noteSize} viewBox="0 0 10 10">
        <Path d="M4 8 L4 2 Q6.4 1.2 8 2.6" stroke={accent} strokeWidth={1.6} strokeLinecap="round" fill="none" />
        <Circle cx={3.1} cy={8.1} r={1.9} fill={accent} />
      </Svg>
    </Animated.View>
  );
}

export function SecondbHead({ mood = "neutral", persona, size = 48, track, accessibilityLabel, style }: SecondbHeadProps) {
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
  const wantsTrack = track ?? size >= BIG_HEAD_MIN;
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
        Animated.timing(bob, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
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
          Animated.timing(blink, { toValue: 0.08, duration: 65 * lidMs, easing: Easing.in(Easing.quad), useNativeDriver: false }),
          Animated.timing(blink, { toValue: 1, duration: 75 * lidMs, easing: Easing.out(Easing.quad), useNativeDriver: false }),
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

  // Head 2.5D look-at toward the touch, scaled by engage (eases in on touch, springs
  // back to a centered, face-forward rest on release). perspective FIRST or the
  // rotateX/rotateY collapse to a flat shear.
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

    const turnY = Animated.multiply(
      engage,
      dx.interpolate({ inputRange: [-reach, reach], outputRange: [-20, 20], extrapolate: "clamp" }),
    );
    const rotateY = turnY.interpolate({ inputRange: [-20, 20], outputRange: ["-20deg", "20deg"], extrapolate: "clamp" });

    const turnX = Animated.multiply(
      engage,
      dy.interpolate({ inputRange: [-reach, reach], outputRange: [16, -16], extrapolate: "clamp" }),
    );
    const rotateX = turnX.interpolate({ inputRange: [-16, 16], outputRange: ["-16deg", "16deg"], extrapolate: "clamp" });

    const scale = engage.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
    const perspective = 600 + size * 1.5;
    return {
      transform: [{ perspective }, { translateX: shift(dx) }, { translateY: shift(dy) }, { rotateX }, { rotateY }, { scale }],
    };
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

  // Face geometry as canon fractions of the head size, then expression-shaped.
  const eyeW = Math.max(4, size * 0.062);
  // Reference eyes are rounded SQUARES (the baked face of the loading logo) —
  // height == width at h: 1; expression h-multipliers squash them into lids.
  const eyeHBase = eyeW;
  const eyeRadius = eyeW * 0.24;
  const mouthW = Math.max(6, size * 0.058) * (face.mouthScale ?? 1);
  const mouthBoxH = Math.max(4, size * 0.05);
  const mouthStroke = Math.max(1.5, size * 0.012);
  const gazeX = (face.lookX ?? 0) * size;
  const gazeY = (face.lookY ?? 0) * size;

  return (
    <View ref={rootRef} onLayout={measure} collapsable={false} style={[styles.root, style]}>
      <Animated.View style={trackStyle}>
        <Animated.View style={[styles.wrap, { width: size, height: size }, bobStyle]}>
          <Image source={HEAD_IMAGE} style={{ width: size, height: size }} contentFit="contain" accessibilityLabel={accessibilityLabel} />

          {/* Eyes — glowing cyan; blink + drift toward touch, expression-shaped
              PER SIDE (wink closes one; smug half-lowers one; sad droops both). */}
          {[0.385, 0.615].map((cx, i) => {
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
                    { left: size * cx - arcW / 2 + gazeX, top: size * spec.top - arcH / 2 + gazeY, shadowColor: accent },
                  ]}
                >
                  <Svg width={arcW} height={arcH}>
                    <Path
                      d={`M1 1 Q ${arcW / 2} ${arcH * 1.6} ${arcW - 1} 1`}
                      stroke={accent}
                      strokeWidth={Math.max(2, size * 0.02)}
                      strokeLinecap="round"
                      fill="none"
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
                    width: eyeW,
                    height: eyeH,
                    borderRadius: eyeRadius,
                    left: size * cx - eyeW / 2 + gazeX,
                    top: size * spec.top - eyeH / 2 + gazeY,
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
              { width: mouthW, height: mouthBoxH, left: size * 0.5 - mouthW / 2, top: size * 0.655 - mouthBoxH / 2 },
            ]}
          >
            <Svg width={mouthW} height={mouthBoxH}>
              {face.mouth === "o" ? (
                <Circle
                  cx={mouthW / 2}
                  cy={mouthBoxH / 2}
                  r={Math.max(2, Math.min(mouthW, mouthBoxH) / 2 - 1)}
                  stroke={deepSpace.text}
                  strokeWidth={mouthStroke}
                  fill="none"
                />
              ) : (
                <Path
                  d={mouthPath(face.mouth, mouthW, mouthBoxH)}
                  stroke={deepSpace.text}
                  strokeWidth={mouthStroke}
                  strokeLinecap="round"
                  fill={face.mouth === "open" ? deepSpace.text : "none"}
                />
              )}
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
  // the transparent head PNG. The eyes carry their own (circular) glow.
  wrap: { position: "relative", flexShrink: 0, alignItems: "center", justifyContent: "center" },
  eye: {
    position: "absolute",
    alignItems: "center",
    backgroundColor: deepSpace.accent,
    shadowColor: deepSpace.accent,
    shadowOpacity: 0.85,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  arcEye: {
    position: "absolute",
    shadowColor: deepSpace.accent,
    shadowOpacity: 0.85,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  mouth: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: deepSpace.accent,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
});
