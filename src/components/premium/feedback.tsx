// Premium feedback surfaces (Part 1): bottom sheet, modal, toast, and the
// empty / loading / error / safety states. Glassy, glowing, reduced-motion
// aware. Copy is warm + non-clinical; safety uses the system-only rose tone.

import { type ReactNode, useEffect, useRef } from "react";
import { Animated, BackHandler, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { V3_DATA_ART, V3_LOG_ART } from "@/lib/assets/soulcore-v3";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, spacing, withAlpha } from "@/lib/theme/tokens";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { PremiumButton } from "./surfaces";

const LOADING_DOT_PATTERN = [true, true, true, true, false, true, true, true, true];
type FeedbackStateKind = "empty" | "error";

/** Slide-up premium bottom sheet. Screen-fixed; renders nothing when closed. */
export function PremiumBottomSheet({
  visible,
  onClose,
  children,
  accessibilityLabel,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  accessibilityLabel?: string;
}) {
  const { t } = useTranslation("common");
  const slide = useRef(new Animated.Value(0)).current;

  // Android hardware back closes the sheet. It is a plain View (not a Modal), so
  // it never gets Modal's onRequestClose — without this, back pops the route
  // instead of dismissing the open sheet. Returning true consumes the event.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    if (prefersReducedMotion()) {
      slide.setValue(1);
      return;
    }
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, slide]);
  if (!visible) return null;
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });
  return (
    <View style={styles.sheetWrap} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("actions.close")}
      />
      <Animated.View
        style={[styles.sheet, { opacity: slide as never, transform: [{ translateY }] }]}
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.sheetHandle} />
        {children}
      </Animated.View>
    </View>
  );
}

/** Centered premium modal. */
export function PremiumModal({
  visible,
  onClose,
  children,
  accessibilityLabel,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  accessibilityLabel?: string;
}) {
  const { t } = useTranslation("common");
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        style={styles.modalBackdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("actions.close")}
      >
        <Pressable
          style={styles.modalCard}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Transient toast pinned near the bottom. Controlled by the caller. */
export function PremiumToast({ message, tone = "info" }: { message: string; tone?: "info" | "success" | "danger" }) {
  const color = tone === "success" ? cosmic.signalMint : tone === "danger" ? cosmic.guardRose : cosmic.soulViolet;
  return (
    <View style={[styles.toast, { borderColor: color, shadowColor: color }]} accessibilityRole="alert">
      <View style={[styles.toastDot, { backgroundColor: color }]} />
      <Text variant="body" style={{ flex: 1 }}>{message}</Text>
    </View>
  );
}

function StateShell({ glyph, title, body, action }: { glyph: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.state}>
      <View style={styles.stateGlyph}>{glyph}</View>
      <Text variant="heading" style={{ textAlign: "center" }}>{title}</Text>
      {body ? <Text variant="body" color="textMuted" style={{ textAlign: "center" }}>{body}</Text> : null}
      {action ? <View style={styles.stateAction}>{action}</View> : null}
    </View>
  );
}

export function PremiumLoadingState({ message }: { message?: string }) {
  const { t } = useTranslation("common");
  return <StateShell glyph={<PixelLoadingGlyph />} title={message ?? t("states.loading")} />;
}

function PixelLoadingGlyph() {
  const opacity = useRef(new Animated.Value(1)).current;
  // Subscribed read: the blink loop must stop/restart on a lite-mode toggle.
  const reduceMotion = useReducedMotionPref();

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.28, duration: 360, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 360, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <View style={styles.loadingGlyph} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.loadingMatrix}>
        {LOADING_DOT_PATTERN.map((filled, i) => (
          <Animated.View
            key={i}
            style={[
              styles.loadingDot,
              filled ? styles.loadingDotOn : styles.loadingDotOff,
              filled && !reduceMotion ? { opacity } : null,
            ]}
          />
        ))}
      </View>
      <Animated.View style={[styles.loadingBlink, !reduceMotion ? { opacity } : null]} />
    </View>
  );
}

export function PremiumEmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <StateShell glyph={<FeedbackStateAsset kind="empty" />} title={title} body={body} action={action} />;
}

export function PremiumErrorState({ title, body, onRetry, retryLabel }: { title: string; body?: string; onRetry?: () => void; retryLabel?: string }) {
  const { t } = useTranslation("common");
  const resolvedRetryLabel = retryLabel ?? t("actions.retry");
  return (
    <StateShell
      glyph={<FeedbackStateAsset kind="error" />}
      title={title}
      body={body}
      action={onRetry ? <PremiumButton label={resolvedRetryLabel} variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

function FeedbackStateAsset({ kind }: { kind: FeedbackStateKind }) {
  const Asset = kind === "empty" ? V3_LOG_ART : V3_DATA_ART;
  const tone = kind === "empty" ? cosmic.soulViolet : cosmic.guardRose;
  const glow = kind === "empty" ? cosmic.signalMint : cosmic.guardRose;

  return (
    <View
      style={[styles.stateAssetShell, { borderColor: tone, backgroundColor: withAlpha(tone, 0.08), shadowColor: glow }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.stateAssetGlow, { borderColor: withAlpha(glow, 0.7) }]} />
      <Asset width={42} height={42} />
      {kind === "error" ? <View style={[styles.stateAssetFault, { backgroundColor: cosmic.guardRose }]} /> : null}
    </View>
  );
}

/** Calm safety notice. Non-clinical, supportive copy + optional action. */
export function SafetyNoticePanel({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.safety} accessibilityRole="alert">
      <View style={styles.safetyHead}>
        <View style={[styles.toastDot, { backgroundColor: cosmic.guardRose }]} />
        <Text variant="body" style={{ fontWeight: "700", color: cosmic.guardRose }}>{title}</Text>
      </View>
      <Text variant="body" color="textMuted">{body}</Text>
      {action ? <View style={{ marginTop: spacing.sm }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end" },
  sheet: {
    margin: spacing.md,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    backgroundColor: gameboy.screen,
    padding: spacing.lg,
    gap: spacing.sm,
    ...pixelShadowStyle(),
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: gameboy.radius,
    backgroundColor: gameboy.border,
    marginBottom: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: withAlpha(cosmic.space950, 0.8),
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    backgroundColor: gameboy.screen,
    padding: spacing.lg,
    gap: spacing.md,
    ...pixelShadowStyle(),
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    backgroundColor: withAlpha(cosmic.space900, 0.96),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...pixelShadowStyle(),
  },
  toastDot: { width: 8, height: 8, borderRadius: gameboy.radius },
  state: { alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  stateGlyph: { marginBottom: spacing.xs },
  stateAction: { marginTop: spacing.sm, width: "100%", maxWidth: 300, gap: spacing.sm },
  loadingGlyph: {
    width: 58,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    borderRadius: gameboy.radius,
    backgroundColor: gameboy.screen,
    ...pixelShadowStyle(gameboy.power),
  },
  loadingMatrix: {
    width: 28,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
  },
  loadingDotOn: {
    borderColor: gameboy.power,
    backgroundColor: gameboy.power,
  },
  loadingDotOff: {
    borderColor: gameboy.border,
    backgroundColor: "transparent",
  },
  loadingBlink: {
    width: 28,
    height: 4,
    borderRadius: gameboy.radius,
    backgroundColor: gameboy.power,
  },
  stateAssetShell: {
    width: 64,
    height: 64,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    alignItems: "center",
    justifyContent: "center",
    ...pixelShadowStyle(cosmic.soulViolet),
  },
  stateAssetGlow: {
    position: "absolute",
    width: 46,
    height: 46,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    opacity: 0.45,
  },
  stateAssetFault: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 10,
    height: 10,
    borderRadius: gameboy.radius,
  },
  safety: {
    borderWidth: gameboy.borderWidth,
    borderColor: cosmic.guardRose,
    backgroundColor: withAlpha(cosmic.guardRose, 0.08),
    borderRadius: gameboy.radius,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  safetyHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
