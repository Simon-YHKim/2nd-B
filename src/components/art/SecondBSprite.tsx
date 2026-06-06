// Premium SecondB sprite wrapper. The public API still exposes the expressive
// v2 states, but the rendered body now uses the production premium worker PNG
// so FAB, chat, onboarding, and empty states stay in the same visual family as
// the main village workers.

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View, AppState, type ViewStyle } from "react-native";

import { ShardArt } from "@/components/art/IslandArt";
import { TierIcon } from "@/components/art/TierIcon";
import { WorkerSprite } from "@/components/art/WorkerSprite";
import { cosmic, withAlpha } from "@/lib/theme/tokens";
import { prefersReducedMotion } from "@/lib/motion/signature";

export type SecondBState =
  | "idle"
  | "blink"
  | "happy"
  | "thinking"
  | "carrying_shard"
  | "chat"
  | "sleep"
  | "alert"
  | "wave_a"
  | "wave_b"
  | "walk_1"
  | "walk_2";

export type SecondBFabState = "default" | "notification" | "chat_ready";

function useFloat(enabled: boolean) {
  const ty = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ty, { toValue: -4, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    if (AppState.currentState === "active") {
      loop.start();
    }

    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") loop.start();
      else loop.stop();
    });

    return () => {
      loop.stop();
      sub.remove();
    };
  }, [enabled, ty]);
  return ty;
}

function SecondBStateAccent({ state, size }: { state: SecondBState; size: number }) {
  const chip = Math.max(14, size * 0.28);

  if (state === "carrying_shard") {
    return (
      <View style={[styles.stateLayer, { right: -size * 0.08, bottom: -size * 0.04 }]}>
        <ShardArt id="core_violet" size={chip * 1.35} />
      </View>
    );
  }

  if (state === "chat" || state === "thinking") {
    return (
      <View style={[styles.chatChip, { width: chip * 1.45, height: chip, right: -size * 0.08, top: size * 0.02 }]}>
        <View style={styles.chatDot} />
        <View style={[styles.chatDot, { opacity: state === "thinking" ? 0.72 : 1 }]} />
        <View style={[styles.chatDot, { opacity: state === "thinking" ? 0.44 : 1 }]} />
      </View>
    );
  }

  if (state === "happy" || state === "wave_a" || state === "wave_b") {
    return (
      <View style={[styles.stateLayer, { right: -size * 0.1, top: -size * 0.04 }]}>
        <TierIcon id="spark_recent" size={chip * 1.1} />
      </View>
    );
  }

  if (state === "alert") {
    return (
      <View style={[styles.alertBurst, { right: -size * 0.05, top: size * 0.04 }]}>
        <View style={styles.alertBar} />
        <View style={[styles.alertBar, { transform: [{ rotate: "90deg" }] }]} />
      </View>
    );
  }

  if (state === "sleep") {
    return <View style={[styles.sleepDot, { width: chip * 0.58, height: chip * 0.58, right: size * 0.06, top: size * 0.04 }]} />;
  }

  return null;
}

export function SecondBSprite({
  state = "idle",
  size = 64,
  float = false,
  label,
  style,
}: {
  state?: SecondBState;
  size?: number;
  float?: boolean;
  label?: string;
  style?: ViewStyle;
}) {
  const ty = useFloat(float);
  const a11y = label
    ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label }
    : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };
  const walking = state === "walk_1" || state === "walk_2";

  return (
    <Animated.View style={[{ transform: [{ translateY: ty }] }, style]} {...a11y}>
      <View style={[styles.spriteBox, { width: size, height: size, opacity: state === "sleep" ? 0.64 : 1 }]}>
        <WorkerSprite id="secondb" size={size} paused={!walking} />
        <SecondBStateAccent state={state} size={size} />
      </View>
    </Animated.View>
  );
}

function FabBadge({ fabState, size }: { fabState: SecondBFabState; size: number }) {
  if (fabState === "notification") {
    return (
      <View style={[styles.fabBadge, { width: size * 0.24, height: size * 0.24, right: -size * 0.02, top: -size * 0.02 }]}>
        <View style={styles.fabBadgeCore} />
      </View>
    );
  }

  if (fabState === "chat_ready") {
    return (
      <View style={[styles.fabChatBadge, { width: size * 0.34, height: size * 0.24, right: -size * 0.06, top: size * 0.04 }]}>
        <View style={styles.chatDot} />
        <View style={styles.chatDot} />
      </View>
    );
  }

  return null;
}

export function SecondBFab({ fabState = "default", size = 64 }: { fabState?: SecondBFabState; size?: number }) {
  const ty = useFloat(true);
  return (
    <Animated.View
      style={[
        styles.fabFrame,
        {
          width: size,
          height: size,
          borderRadius: Math.max(14, size * 0.3),
          transform: [{ translateY: ty }],
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <WorkerSprite id="secondb" size={size * 0.68} paused />
      <FabBadge fabState={fabState} size={size} />
    </Animated.View>
  );
}

export function useSaveCelebration(): {
  state: SecondBState;
  active: boolean;
  celebrate: () => void;
} {
  const [state, setState] = useState<SecondBState>("idle");
  const [active, setActive] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const celebrate = useCallback(() => {
    clear();
    setActive(true);
    setState("carrying_shard");
    timers.current.push(setTimeout(() => setState("happy"), 750));
    timers.current.push(
      setTimeout(() => {
        setState("idle");
        setActive(false);
      }, 1500),
    );
  }, []);

  useEffect(() => () => clear(), []);
  return { state, active, celebrate };
}

const styles = StyleSheet.create({
  spriteBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  stateLayer: {
    position: "absolute",
  },
  chatChip: {
    position: "absolute",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.signalMint, 0.62),
    backgroundColor: withAlpha(cosmic.space950, 0.76),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  chatDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: cosmic.signalMint,
  },
  alertBurst: {
    position: "absolute",
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  alertBar: {
    position: "absolute",
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: cosmic.guardRose,
  },
  sleepDot: {
    position: "absolute",
    borderRadius: 99,
    borderWidth: 2,
    borderColor: cosmic.signalBlue,
    opacity: 0.74,
  },
  fabFrame: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: withAlpha(cosmic.signalMint, 0.48),
    backgroundColor: withAlpha(cosmic.soulViolet, 0.16),
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.38,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  fabBadge: {
    position: "absolute",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.pixelLamp, 0.86),
    backgroundColor: withAlpha(cosmic.pixelLamp, 0.24),
    alignItems: "center",
    justifyContent: "center",
  },
  fabBadgeCore: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: cosmic.pixelLamp,
  },
  fabChatBadge: {
    position: "absolute",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.signalMint, 0.72),
    backgroundColor: withAlpha(cosmic.space950, 0.72),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
});
