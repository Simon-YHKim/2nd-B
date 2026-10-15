import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, Platform, StyleSheet, type ModalProps } from "react-native";
import { sceneMotion } from "@/lib/motion/scene-motion";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { usePhoneDesign } from "@/lib/theme/phone-design-context";

export interface MotionModalProps extends ModalProps {
  /** False immediately removes the dialog and its children, bypassing exit. */
  active?: boolean;
  transitionKind?: "sheet" | "replace";
  /** Normal close only; never called for a covered or unmounted screen. */
  onExitComplete?: () => void;
}

/** Native dialog ownership stays with RN (focus trap, Escape, hardware back).
 * Only its content moves. This base also works above the navigator; route
 * screens use ScreenModal so blur bypasses the ordinary closing animation.
 */
export function MotionModal({
  active = true,
  visible = true,
  animationType,
  transitionKind = animationType === "slide" ? "sheet" : "replace",
  onExitComplete,
  onShow,
  children,
  ...props
}: MotionModalProps) {
  const phone = usePhoneDesign();
  const reduced = useReducedMotionPref();
  const requested = visible !== false && visible !== null;
  const open = active && requested;
  const [present, setPresent] = useState(open);
  const [ready, setReady] = useState(false);
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const wasOpen = useRef(open);
  const exitCallback = useRef(onExitComplete);
  const motion = useMemo(() => sceneMotion(phone ? "phone" : "world", transitionKind, reduced), [phone, transitionKind, reduced]);

  useLayoutEffect(() => { exitCallback.current = onExitComplete; }, [onExitComplete]);
  useLayoutEffect(() => {
    if (!active) {
      wasOpen.current = false;
      progress.setValue(0);
      setPresent(false);
      setReady(false);
      return;
    }
    if (!open && !wasOpen.current) return;
    if (open) {
      wasOpen.current = true;
      setPresent(true);
    }
    let cancelled = false;
    const finish = () => {
      if (cancelled || open) return;
      wasOpen.current = false;
      setPresent(false);
      setReady(false);
      exitCallback.current?.();
    };
    // Native Dialog creation can lag behind React's commit. Start the entry
    // when RN actually shows it, so slow activity creation cannot skip it.
    if (!ready) {
      if (!open) finish();
      return;
    }
    if (reduced) {
      progress.setValue(open ? 1 : 0);
      finish();
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: motion.duration,
      easing: motion.easing,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => { if (finished) finish(); });
    return () => { cancelled = true; animation.stop(); };
  }, [active, open, ready, reduced, progress, motion]);

  // Do not wait for an effect to tear down a blurred screen's native dialog.
  // Never cache outgoing React children: auth/route changes must remove them.
  const shown = active && (requested || (!reduced && present));
  return (
    <Modal {...props} visible={shown} animationType="none" onShow={(event) => {
      if (open) setReady(true);
      onShow?.(event);
    }}>
      {shown ? (
        <Animated.View
          collapsable={false}
          testID="modal-scene-transition"
          style={[styles.scene, {
            opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [motion.from.opacity, 1] }),
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [motion.from.x, 0] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [motion.from.y, 0] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [motion.from.scale, 1] }) },
            ],
          }]}
          pointerEvents={open ? "auto" : "none"}
          accessibilityElementsHidden={!open}
          aria-hidden={!open}
          importantForAccessibility={open ? "auto" : "no-hide-descendants"}
        >
          {children}
        </Animated.View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({ scene: { flex: 1, minHeight: 0, flexShrink: 1 } });
