import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, useWindowDimensions } from "react-native";

import { prefersReducedMotion } from "@/lib/motion/signature";
import { gameboy } from "@/lib/theme/gameboy-tokens";
import { cosmic, flattenAlpha } from "@/lib/theme/tokens";

import { POWER_ON_STORAGE_KEY, powerOnStartState } from "./power-on-state";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";

export const POWER_ON_SWEEP_MS = 180;
const POWER_ON_FADE_MS = 120;
const SCANLINE_HEIGHT = 6;

let powerOnPlayed = false;

function getSessionStorage(): Storage | null {
  const g = globalThis as unknown as { sessionStorage?: Storage };
  try {
    return g.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function hasPowerOnPlayed(): boolean {
  if (powerOnPlayed) return true;
  const storage = getSessionStorage();
  try {
    return storage?.getItem(POWER_ON_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markPowerOnPlayed() {
  powerOnPlayed = true;
  const storage = getSessionStorage();
  try {
    storage?.setItem(POWER_ON_STORAGE_KEY, "1");
  } catch {
    // Session storage can be unavailable in private web contexts.
  }
}

export function PowerOnOverlay() {
  const { height } = useWindowDimensions();
  const initialState = useRef(
    powerOnStartState({
      alreadyPlayed: hasPowerOnPlayed(),
      reducedMotion: prefersReducedMotion(),
    }),
  ).current;
  const [visible, setVisible] = useState(initialState.visible);
  const opacity = useRef(new Animated.Value(initialState.visible ? 1 : 0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!initialState.shouldAnimate) {
      markPowerOnPlayed();
      setVisible(false);
      return;
    }

    markPowerOnPlayed();
    opacity.setValue(1);
    sweep.setValue(0);

    const sequence = Animated.sequence([
      Animated.timing(sweep, {
        toValue: 1,
        duration: POWER_ON_SWEEP_MS,
        // ⚠ 계단 이징(규칙 5). 등속을 칸으로 나눠도 등속이다 — 마디만 생긴다.
        easing: pixelStepsFor(POWER_ON_SWEEP_MS),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: POWER_ON_FADE_MS,
        easing: pixelStepsFor(POWER_ON_FADE_MS),
        useNativeDriver: true,
      }),
    ]);

    sequence.start(({ finished }) => {
      if (finished) setVisible(false);
    });

    return () => {
      sequence.stop();
    };
  }, [initialState.shouldAnimate, opacity, sweep]);

  if (!visible) return null;

  const translateY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCANLINE_HEIGHT, height + SCANLINE_HEIGHT],
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.overlay, { opacity }]}
    >
      <Animated.View style={[styles.scanline, { transform: [{ translateY }] }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...(StyleSheet.absoluteFill as object),
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: cosmic.space950,
  },
  scanline: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: SCANLINE_HEIGHT,
    // ⚠ 미리 합성한 색(규칙 4). 바탕은 이 오버레이의 배경(`cosmic.space950`)이다.
    backgroundColor: flattenAlpha(gameboy.accent, 0.95, cosmic.space950),
    shadowColor: gameboy.accent,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
});
