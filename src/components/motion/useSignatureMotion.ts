// Animated wiring for the three signature village motions. Each hook
// returns an Animated value to bind into a style and a trigger to fire the
// moment. The numbers all come from `src/lib/motion/signature.ts` so the
// behaviour matches DESIGN.md exactly; this file only does the RN Animated
// plumbing + reduced-motion fallbacks.
//
// We use the core `Animated` API (not Reanimated) to stay consistent with
// index.tsx / NavGraph and to run identically on web (the primary
// distribution target) without native config.

import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

import {
  SAVE_MOTION,
  CONNECTION_MOTION,
  IMAGINE_MOTION,
  prefersReducedMotion,
} from "@/lib/motion/signature";
import { playPop } from "@/lib/audio/pop";

/**
 * 저장 / Save — "루루 뽁". Returns a scale value (bind to transform) and a
 * `pop()` trigger. Plays the synth pop on web. Honours reduced-motion by
 * snapping to 1 with no overshoot.
 */
export function useSavePop() {
  const scale = useRef(new Animated.Value(1)).current;

  const pop = useCallback(() => {
    playPop();
    if (prefersReducedMotion()) {
      scale.setValue(1);
      return;
    }
    scale.setValue(SAVE_MOTION.startScale);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: SAVE_MOTION.overshootScale,
        duration: SAVE_MOTION.attackMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: SAVE_MOTION.settleMs,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale]);

  return { scale, pop };
}

/**
 * 연결 발견 / Connection — "아치 라인 켜짐". Returns an opacity value that
 * resting-dims, and a `light()` trigger that illuminates it dim → bright.
 */
export function useConnectionGlow() {
  const opacity = useRef(new Animated.Value(CONNECTION_MOTION.fromOpacity)).current;

  const light = useCallback(() => {
    if (prefersReducedMotion()) {
      opacity.setValue(CONNECTION_MOTION.toOpacity);
      return;
    }
    opacity.setValue(CONNECTION_MOTION.fromOpacity);
    Animated.timing(opacity, {
      toValue: CONNECTION_MOTION.toOpacity,
      duration: CONNECTION_MOTION.durationMs,
      easing: Easing.out(Easing.cubic),
      // Drives strokeOpacity on NavGraph's <AnimatedLine>, whose x1/y1/x2/y2
      // (drift) run on the JS thread (useNativeDriver:false — SVG props can't
      // go native). Mixing native + JS drivers on one animated node hard-crashes
      // on modal close ("animated node ... moved to 'native' earlier"). Keep JS.
      useNativeDriver: false,
    }).start();
  }, [opacity]);

  return { opacity, light };
}

/**
 * Soft, continuous presence pulse for a sprite signal glow. (Legacy name:
 * imagine/공상; that place is retired, Divergent mode now lives in /secondb.)
 * Starts on mount; reduced-motion holds it at rest opacity with no animation.
 * Returns opacity + scale to bind into a style.
 */
export function useImaginePulse(active = true) {
  const opacity = useRef(new Animated.Value(IMAGINE_MOTION.restOpacity)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      opacity.setValue(IMAGINE_MOTION.restOpacity);
      scale.setValue(1);
      return;
    }
    const half = IMAGINE_MOTION.durationMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: IMAGINE_MOTION.peakOpacity,
            duration: half,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: IMAGINE_MOTION.maxScale,
            duration: half,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: IMAGINE_MOTION.minOpacity,
            duration: half,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: half,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, opacity, scale]);

  return { opacity, scale };
}
