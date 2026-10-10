import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { sceneMotion, type MotionScope, type SceneMotionKind } from "@/lib/motion/scene-motion";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { usePhoneDesign } from "@/lib/theme/phone-design-context";

interface Props {
  children: ReactNode;
  transitionKey: string | number;
  kind: SceneMotionKind;
  scope?: MotionScope;
  active?: boolean;
  animateOnMount?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Animates the incoming surface only: navigation and owner teardown stay synchronous. */
export function SceneTransition({
  children, transitionKey, kind, scope, active = true, animateOnMount = true, style, testID,
}: Props) {
  const inPhone = usePhoneDesign();
  const reduced = useReducedMotionPref();
  const resolvedScope = scope ?? (inPhone ? "phone" : "world");
  const spec = useMemo(() => sceneMotion(resolvedScope, kind, reduced), [resolvedScope, kind, reduced]);
  const progress = useRef(new Animated.Value(active && animateOnMount && !reduced ? 0 : 1)).current;
  const previous = useRef<{ key: string | number; kind: SceneMotionKind; active: boolean } | null>(null);

  useLayoutEffect(() => {
    progress.stopAnimation();
    const last = previous.current;
    const changed = last === null ? animateOnMount :
      last.key !== transitionKey || last.kind !== kind || (!last.active && active);
    previous.current = { key: transitionKey, kind, active };
    // Turning reduction off restores future motion; it must not replay every
    // nested surface that is already on screen.
    if (!active || reduced || !changed) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    // JS driver on every platform and in both scopes, so this value has one
    // writer. With the native driver this effect's setValue() raced the native
    // animation's late stop report, and on Android a re-entered route could
    // stay at opacity 0 until the app restarted. The frame cost of driving the
    // phone's continuous easing from JS has not been measured on a device.
    const animation = Animated.timing(progress, {
      toValue: 1, duration: spec.duration, easing: spec.easing,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [active, animateOnMount, progress, reduced, spec, transitionKey]);

  const animatedStyle = useMemo(() => ({
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [spec.from.opacity, 1] }),
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [spec.from.x, 0] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [spec.from.y, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [spec.from.scale, 1] }) },
    ],
  }), [progress, spec]);

  return <Animated.View collapsable={false} testID={testID} style={[style, animatedStyle]}>{children}</Animated.View>;
}
