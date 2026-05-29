// SecondB sprite pack v2 — the expressive companion. Renders the 12 state
// sprites + 3 FAB states (public/assets/cosmic-pixel-v2/secondb) via
// SvgXml from the already-installed react-native-svg, so native + web
// match with no extra bundler config (same approach as the v1 art layer).
//
// Motion is deliberately restrained (asset order §6): idle gets a 4px
// float only; event sequences finish within 1.2–1.8s. Honours
// prefers-reduced-motion (holds still).

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";

import { SECONDB_V2_XML } from "./secondbV2Xml";
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

/** A gentle 4px vertical float (asset order §6) — for the resting FAB / idle. */
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
    loop.start();
    return () => loop.stop();
  }, [enabled, ty]);
  return ty;
}

/**
 * One SecondB sprite in a given state. Decorative by default (aria-hidden);
 * pass `label` to surface it to screen readers.
 */
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
  const xml = SECONDB_V2_XML[state] ?? SECONDB_V2_XML.idle;
  const a11y = label
    ? { accessible: true, accessibilityLabel: label }
    : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };
  return (
    <Animated.View style={[{ transform: [{ translateY: ty }] }, style]} {...a11y}>
      <SvgXml xml={xml} width={size} height={size} />
    </Animated.View>
  );
}

/**
 * The bottom-right SecondB FAB art (default / notification / chat_ready),
 * with the resting float. Decorative — the wrapping Pressable owns the
 * "세컨비에게 묻기" label/role.
 */
export function SecondBFab({ fabState = "default", size = 64 }: { fabState?: SecondBFabState; size?: number }) {
  const ty = useFloat(true);
  const xml = SECONDB_V2_XML[`fab_${fabState}`] ?? SECONDB_V2_XML.fab_default;
  return (
    <Animated.View
      style={{ transform: [{ translateY: ty }] }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SvgXml xml={xml} width={size} height={size} />
    </Animated.View>
  );
}

/**
 * Save-celebration sequence (asset order §3): carrying_shard → happy →
 * idle, finishing in ~1.5s (inside the 1.2–1.8s budget). `active` is true
 * while it plays so callers can mount the sprite transiently.
 */
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
