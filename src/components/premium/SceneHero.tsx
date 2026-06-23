import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
  AppState,
} from "react-native";

import { IslandArt, type IslandId } from "@/components/art/IslandArt";
import { WorkerSprite, type WorkerId } from "@/components/art/WorkerSprite";
import { Text } from "@/components/ui/Text";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { cosmic, deepSpace, deepSpaceRadii, radii, semantic, spacing, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { PremiumButton } from "./surfaces";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { SecondbHead } from "@/components/deepspace";

type SceneHeroAction = {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

// Character scale is keyed to the village art, not the screen. In the records
// island, the central desk is roughly 10-11% of the rendered island height; a
// worker at ~22% reads as about two desk-heights tall.
const WORKER_TO_ISLAND_SCALE = 0.22;
const SPEECH_LAYER = 40;
const CHARACTER_LAYER = 12;
const OWNER_PATROL_MS = 2800;
const OWNER_PATROL_TO_ISLAND_SCALE = 0.034;
const HERO_SWIPE_DISTANCE = 48;
const HERO_SWIPE_VERTICAL_TOLERANCE = 1.35;

export function SceneHero({
  eyebrow,
  title,
  subtitle,
  island,
  worker,
  speech,
  primaryAction,
  secondaryAction,
  onSwipeLeft,
  onSwipeRight,
  accent = cosmic.dreamPink,
  islandSize = 188,
  workerSize = 76,
  style,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  island: IslandId;
  worker: WorkerId;
  speech: string;
  primaryAction?: SceneHeroAction;
  secondaryAction?: SceneHeroAction;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  accent?: string;
  islandSize?: number;
  workerSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const ownerSize = Math.min(workerSize, Math.max(44, Math.round(islandSize * WORKER_TO_ISLAND_SCALE)));
  const reducedMotion = useReducedMotionPref();
  // 2026-06-02: village headers show the TITLE only — eyebrow + subtitle are no
  // longer rendered. Kept in the props for API compatibility with the callers.
  void eyebrow;
  void subtitle;
  // The owner's speech bubble blinks (~2.5s shown, ~2.5s hidden) instead of
  // always showing. Reduced-motion users keep a steady bubble.
  const [speechShown, setSpeechShown] = useState(true);
  const patrol = useRef(new Animated.Value(0)).current;
  const [ownerFacing, setOwnerFacing] = useState<1 | -1>(1);
  const ownerHaloSize = ownerSize + 18;
  const ownerLeft = Math.max(12, Math.round(islandSize * 0.12));
  const ownerBottom = Math.max(14, Math.round(islandSize * 0.1));
  const ownerGroundWidth = Math.round(ownerSize * 0.76);
  const ownerGroundHeight = Math.max(7, Math.round(ownerSize * 0.18));
  const ownerGroundBottom = Math.max(4, Math.round(ownerSize * 0.09));
  const ownerContactWidth = Math.round(ownerSize * 0.44);
  const ownerContactBottom = ownerGroundBottom + Math.round(ownerGroundHeight * 0.42);
  const ownerSpriteBottom = ownerGroundBottom + Math.round(ownerGroundHeight * 0.3);
  const bubbleWidth = Math.min(220, Math.max(168, Math.round(islandSize * 0.78)));
  const maxBubbleLeft = Math.max(8, islandSize - bubbleWidth - 8);
  const bubbleLeft = Math.max(8, Math.min(maxBubbleLeft, ownerLeft + ownerHaloSize / 2 - 28));
  const bubbleBottom = ownerBottom + ownerHaloSize - 4;
  const tailLeft = Math.max(18, Math.min(bubbleWidth - 26, ownerLeft + ownerHaloSize / 2 - bubbleLeft - 5));
  const ownerStride = Math.max(6, Math.round(islandSize * OWNER_PATROL_TO_ISLAND_SCALE));
  const ownerTranslateX = patrol.interpolate({
    inputRange: [0, 1],
    outputRange: [-ownerStride, ownerStride],
  });
  const hasSwipe = Boolean(onSwipeLeft || onSwipeRight);
  const hasSwipeRef = useRef(hasSwipe);
  const swipeLeftRef = useRef(onSwipeLeft);
  const swipeRightRef = useRef(onSwipeRight);
  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) =>
        hasSwipeRef.current &&
        Math.abs(gesture.dx) > HERO_SWIPE_DISTANCE * 0.55 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * HERO_SWIPE_VERTICAL_TOLERANCE,
      onPanResponderRelease: (
        _event: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        if (Math.abs(gesture.dx) < HERO_SWIPE_DISTANCE) return;
        if (gesture.dx < 0) {
          swipeLeftRef.current?.();
        } else {
          swipeRightRef.current?.();
        }
      },
    }),
  ).current;

  useEffect(() => {
    hasSwipeRef.current = hasSwipe;
    swipeLeftRef.current = onSwipeLeft;
    swipeRightRef.current = onSwipeRight;
  }, [hasSwipe, onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    if (reducedMotion) {
      patrol.stopAnimation();
      patrol.setValue(0.5);
      setOwnerFacing(1);
      return;
    }

    let alive = true;
    const toRight = () => {
      setOwnerFacing(1);
      Animated.timing(patrol, {
        toValue: 1,
        duration: OWNER_PATROL_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (alive && finished) toLeft();
      });
    };
    const toLeft = () => {
      setOwnerFacing(-1);
      Animated.timing(patrol, {
        toValue: 0,
        duration: OWNER_PATROL_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (alive && finished) toRight();
      });
    };

    patrol.setValue(0);
    toRight();
    return () => {
      alive = false;
      patrol.stopAnimation();
    };
  }, [patrol, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      setSpeechShown(true);
      return;
    }
    const id = setInterval(() => {
      if (AppState.currentState !== "active") return;
      setSpeechShown((v) => !v);
    }, 2500);
    return () => clearInterval(id);
  }, [reducedMotion]);

  if (isDeepSpaceUI()) {
    return (
      <View style={[dsStyles.wrap, style]}>
        <View style={dsStyles.headerRow}>
          <SecondbHead size={52} mood="neutral" />
          <View style={dsStyles.bubble}>
            <View style={dsStyles.bubbleTail} />
            <Text variant="body" style={dsStyles.bubbleText}>{speech}</Text>
          </View>
        </View>
        <Text variant="heading" style={dsStyles.title}>{title}</Text>
        {primaryAction || secondaryAction ? (
          <View style={dsStyles.actions}>
            {primaryAction ? (
              <PremiumButton
                label={primaryAction.label}
                variant={primaryAction.variant ?? "primary"}
                loading={primaryAction.loading}
                disabled={primaryAction.disabled}
                onPress={primaryAction.onPress}
              />
            ) : null}
            {secondaryAction ? (
              <PremiumButton
                label={secondaryAction.label}
                variant={secondaryAction.variant ?? "secondary"}
                loading={secondaryAction.loading}
                disabled={secondaryAction.disabled}
                onPress={secondaryAction.onPress}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.copy}>
        <Text variant="heading">{title}</Text>
      </View>

      <View style={[styles.shell, { shadowColor: accent }]}>
        <View style={styles.stage} {...(hasSwipe ? swipeResponder.panHandlers : {})}>
          <View style={[styles.islandFrame, { width: islandSize, height: islandSize }]}>
            <View
              style={[
                styles.glow,
                {
                  width: islandSize * 0.92,
                  height: islandSize * 0.92,
                  borderRadius: islandSize * 0.46,
                  backgroundColor: accent,
                  shadowColor: accent,
                },
              ]}
            />
            <IslandArt id={island} size={islandSize} style={styles.island} />
            <Animated.View
              style={[
                styles.workerWrap,
                {
                  width: ownerHaloSize,
                  height: ownerHaloSize,
                  left: ownerLeft,
                  bottom: ownerBottom,
                  transform: [{ translateX: ownerTranslateX }],
                },
              ]}
            >
              <View
                style={[
                  styles.workerGround,
                  {
                    width: ownerGroundWidth,
                    height: ownerGroundHeight,
                    borderRadius: ownerGroundHeight / 2,
                    left: (ownerHaloSize - ownerGroundWidth) / 2,
                    bottom: ownerGroundBottom,
                  },
                ]}
              />
              <View
                style={[
                  styles.workerContact,
                  {
                    width: ownerContactWidth,
                    left: (ownerHaloSize - ownerContactWidth) / 2,
                    bottom: ownerContactBottom,
                    backgroundColor: accent,
                  },
                ]}
              />
              <WorkerSprite
                id={worker}
                size={ownerSize}
                facing={ownerFacing}
                paused={reducedMotion}
                style={[
                  styles.workerSprite,
                  {
                    left: (ownerHaloSize - ownerSize) / 2,
                    bottom: ownerSpriteBottom,
                  },
                ]}
              />
            </Animated.View>
            {speechShown ? (
              <Animated.View
                style={[
                  styles.bubble,
                  {
                    left: bubbleLeft,
                    bottom: bubbleBottom,
                    width: bubbleWidth,
                    transform: [{ translateX: ownerTranslateX }],
                  },
                ]}
              >
                <Text variant="body" style={styles.bubbleText}>{speech}</Text>
                <View style={[styles.bubbleTail, { left: tailLeft }]} />
              </Animated.View>
            ) : null}
          </View>
        </View>

        {primaryAction || secondaryAction ? (
          <View style={styles.actions}>
            {primaryAction ? (
              <PremiumButton
                label={primaryAction.label}
                variant={primaryAction.variant ?? "primary"}
                loading={primaryAction.loading}
                disabled={primaryAction.disabled}
                onPress={primaryAction.onPress}
                style={styles.actionButton}
              />
            ) : null}
            {secondaryAction ? (
              <PremiumButton
                label={secondaryAction.label}
                variant={secondaryAction.variant ?? "secondary"}
                loading={secondaryAction.loading}
                disabled={secondaryAction.disabled}
                onPress={secondaryAction.onPress}
                style={styles.actionButton}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  copy: { gap: spacing.xs },
  shell: {
    position: "relative",
    overflow: "hidden",
    minHeight: 268,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
    shadowColor: semantic.brand,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  stage: {
    minHeight: 202,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  islandFrame: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    opacity: 0.11,
    shadowColor: semantic.brand,
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  island: {
    opacity: 0.98,
  },
  workerWrap: {
    position: "absolute",
    zIndex: CHARACTER_LAYER,
    elevation: CHARACTER_LAYER,
    alignItems: "center",
    justifyContent: "center",
  },
  workerGround: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: semantic.background,
    opacity: 0.72,
    borderWidth: 1,
    borderColor: semantic.border,
    shadowColor: semantic.background,
    shadowOpacity: 0.32,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  workerContact: {
    position: "absolute",
    height: 2,
    borderRadius: 2,
    zIndex: CHARACTER_LAYER - 1,
    opacity: 0.56,
  },
  workerSprite: {
    position: "absolute",
  },
  // Matches the main-graph CharacterPathLayer bubble: dark fill, mint border,
  // pixel font (2026-06-02 directive).
  bubble: {
    position: "absolute",
    minHeight: 68,
    justifyContent: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.brand,
    backgroundColor: semantic.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: semantic.brand,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    zIndex: SPEECH_LAYER,
    elevation: SPEECH_LAYER,
  },
  bubbleTail: {
    position: "absolute",
    bottom: -6,
    width: 0,
    height: 0,
    borderStartWidth: 6,
    borderEndWidth: 6,
    borderTopWidth: 7,
    borderStartColor: "transparent",
    borderEndColor: "transparent",
    borderTopColor: semantic.surface,
  },
  bubbleText: {
    color: semantic.text,
    fontFamily: fontFamilies.pixel,
    fontSize: typography.sizes.sm,
    lineHeight: 18,
    letterSpacing: 0,
    textAlign: "center",
  },
  actions: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
  },
  actionButton: {
    minHeight: 52,
    borderRadius: radii.sm,
  },
});

// Deep-space hero (isDeepSpaceUI): SecondB head + speech bubble + title,
// replacing the legacy pixel-village island/worker on every SceneHero screen.
const dsStyles = StyleSheet.create({
  // paddingTop clears the floating BackArrow chip (SceneHero only renders on
  // pushed sub-screens, where the arrow is shown).
  wrap: { gap: 12, paddingTop: 52 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  bubble: {
    flex: 1,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    borderTopLeftRadius: 4,
    borderTopRightRadius: deepSpaceRadii.md,
    borderBottomRightRadius: deepSpaceRadii.md,
    borderBottomLeftRadius: deepSpaceRadii.md,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  bubbleTail: {
    position: "absolute",
    left: -5,
    top: 14,
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderRightWidth: 6,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: deepSpace.cardLine,
  },
  bubbleText: { color: deepSpace.textHi, fontSize: 14, lineHeight: 19 },
  title: { fontSize: 20, color: deepSpace.textHi },
  actions: { gap: 8, marginTop: 4 },
});
