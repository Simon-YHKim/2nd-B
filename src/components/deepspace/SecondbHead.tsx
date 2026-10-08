// Compatibility entrypoint for all character surfaces. The displayed character is HustleK.
// Keep legacy imports/persona IDs stable; only the supplied portrait changes with expression.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { M3Persona } from "@/lib/theme/m3";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { currentHold, subscribeExpression, subscribeHold, type Expression } from "@/lib/companion/expression";
import { nextIdleDelayMs, pickIdleAction } from "@/lib/companion/faces";
import { hustlekExpressionFor } from "@/lib/companion/hustlek-expression";
import { HustleKPortrait } from "@/components/character/HustleKPortrait";
import { useSecondbTracking } from "./SecondbHeadTrack";

export type SecondbMood = "positive" | "neutral" | "negative";
interface SecondbHeadProps {
  mood?: SecondbMood;
  /** Legacy persona identifier retained for caller compatibility; the portrait is never tinted. */
  persona?: M3Persona;
  size?: number;
  track?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}
const BIG_HEAD_MIN = 80;

export function SecondbHead({ mood = "neutral", size: sizeProp = 48, track, accessibilityLabel, style }: SecondbHeadProps) {
  const size = Math.max(1, Math.round(sizeProp));
  const reduce = useReducedMotionPref();
  const bob = useRef(new Animated.Value(0)).current;
  // Reaction layer (save -> happy, delete -> sad): overrides the base mood for a
  // beat, then reverts. Hold layer (AI 응답 대기): sticky until released. Idle
  // layer (딴청): rolled by the idle policy when nothing else is going on.
  const [reactExpr, setReactExpr] = useState<Expression | null>(null);
  const [holdExpr, setHoldExpr] = useState<Expression | null>(currentHold);
  const [idleExpr, setIdleExpr] = useState<Expression | null>(null);
  const reactRef = useRef<Expression | null>(null);
  const holdRef = useRef<Expression | null>(holdExpr);
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
  // portrait stays upright, keeping the supplied pixel artwork intact.
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


  return (
    <View ref={rootRef} onLayout={measure} collapsable={false} style={[styles.root, style]}>
      <Animated.View collapsable={false} style={trackStyle}>
        <Animated.View collapsable={false} style={bobStyle}>
          <HustleKPortrait expression={hustlekExpressionFor(effExpr)} size={size} accessibilityLabel={accessibilityLabel} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
});
