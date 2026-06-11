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
        opacity: progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [motion.opacityMin, 1, motion.opacityMin],
        }),
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
