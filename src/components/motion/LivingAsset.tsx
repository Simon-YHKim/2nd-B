import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { Animated, AppState, Easing, type StyleProp, type ViewStyle } from "react-native";

import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import {
  LIVING_ASSET_MOTION,
  livingAssetPhase,
  type LivingAssetPreset,
} from "@/lib/motion/living-assets";

interface LivingAssetProps {
  preset: LivingAssetPreset;
  id?: string | number;
  size?: number;
  enabled?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "box-none" | "none" | "box-only" | "auto";
}

export function LivingAsset({
  preset,
  id,
  size,
  enabled = true,
  children,
  style,
  pointerEvents,
}: LivingAssetProps) {
  const motion = LIVING_ASSET_MOTION[preset];
  const phase = useMemo(() => livingAssetPhase(id, preset), [id, preset]);
  const progress = useRef(new Animated.Value(0)).current;
  // Subscribed (not the pure read): a lite-mode toggle must stop/restart the
  // breathing loop on mounted assets, not wait for a remount.
  const reduced = useReducedMotionPref();

  useEffect(() => {
    if (!enabled || reduced) {
      progress.setValue(0);
      return;
    }
    const delay = motion.delayMs + Math.round((phase / 1000) * motion.durationMs);
    let loop: Animated.CompositeAnimation | null = null;
    progress.setValue(0);
    const startLoop = () => {
      // Never spin up a loop while backgrounded — the delayed setTimeout can
      // fire after the app has gone background — and never double-create on
      // repeated "active" transitions.
      if (AppState.currentState === "background" || AppState.currentState === "inactive") return;
      if (loop) return;
      loop = Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: motion.durationMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      );
      loop.start();
    };
    const stopLoop = () => {
      loop?.stop();
      loop = null;
    };
    const timer = setTimeout(startLoop, delay);
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        stopLoop();
      } else if (nextState === "active") {
        startLoop();
      }
    });
    return () => {
      clearTimeout(timer);
      stopLoop();
      appStateSub.remove();
    };
  }, [enabled, reduced, motion.delayMs, motion.durationMs, phase, progress]);

  const animatedStyle = enabled && !reduced
    ? {
        // ⚠ **불투명도로 숨쉬지 않는다** (PIXEL-CLAY 규칙 4).
        //   예전에는 `opacity` 를 0.94~1 사이로 흘렸는데, 그 진폭은 거의 안 보이면서
        //   순간값이 소수가 되어 정적 반투명과 같은 문제를 만들었다
        //   (`/capture-full` 의 A축에 끝까지 남은 한 건이 이것이었다).
        //   살아있는 느낌은 아래의 **떠오름(translateY)과 맥박(scale)** 이 낸다.
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, motion.translateY, 0],
            }),
          },
          {
            scale: progress.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, motion.scale, 1],
            }),
          },
        ],
      }
    : null;

  return (
    <Animated.View
      pointerEvents={pointerEvents}
      style={[size ? { width: size, height: size, overflow: "visible" } : null, style, animatedStyle as StyleProp<ViewStyle>]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Animated.View>
  );
}

export type { LivingAssetPreset };
