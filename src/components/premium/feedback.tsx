// Premium feedback surfaces (Part 1): bottom sheet, modal, toast, and the
// empty / loading / error / safety states. Pixel-framed and reduced-motion
// aware. Copy is warm + non-clinical; safety uses the calm rose tone.

import { type ReactNode, useEffect, useRef } from "react";
import { Animated, BackHandler, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import {
  SCREEN_TRANSITION_DISTANCE_PX,
  SCREEN_TRANSITION_MS,
  pixelMotionDuration,
} from "@/lib/motion/pixel-physical";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, spacing, withAlpha } from "@/lib/theme/tokens";
import { PremiumButton } from "./surfaces";

const PREMIUM_LOADING_CELLS = [0, 1, 2] as const;

/** Slide-up pixel bottom sheet. Screen-fixed; renders nothing when closed. */
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
    Animated.timing(slide, {
      toValue: 1,
      duration: pixelMotionDuration(SCREEN_TRANSITION_MS),
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);
  if (!visible) return null;
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_TRANSITION_DISTANCE_PX, 0] });
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

/** Centered glassy modal. */
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

function PremiumStateLoader() {
  return (
    <View style={styles.loaderFrame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.loaderRow}>
        {PREMIUM_LOADING_CELLS.map((cell) => (
          <View
            key={cell}
            style={[
              styles.loaderCell,
              cell === 1 ? styles.loaderCellActive : null,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function PremiumLoadingState({ message }: { message?: string }) {
  const { t } = useTranslation("common");
  return <StateShell glyph={<PremiumStateLoader />} title={message ?? t("states.loading")} />;
}

export function PremiumEmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <StateShell glyph={<View style={[styles.orb, { borderColor: cosmic.soulViolet }]} />} title={title} body={body} action={action} />;
}

export function PremiumErrorState({ title, body, onRetry, retryLabel }: { title: string; body?: string; onRetry?: () => void; retryLabel?: string }) {
  const { t } = useTranslation("common");
  const resolvedRetryLabel = retryLabel ?? t("actions.retry");
  return (
    <StateShell
      glyph={<View style={[styles.orb, { borderColor: cosmic.guardRose }]} />}
      title={title}
      body={body}
      action={onRetry ? <PremiumButton label={resolvedRetryLabel} variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

/** Calm safety notice (Gadi). Non-clinical, supportive copy + optional action. */
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
  loaderFrame: {
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    borderRadius: gameboy.radius,
    backgroundColor: gameboy.screen,
    padding: gameboy.grid,
    ...pixelShadowStyle(),
  },
  loaderRow: {
    flexDirection: "row",
    gap: gameboy.grid,
  },
  loaderCell: {
    width: gameboy.grid,
    height: gameboy.grid,
    borderRadius: gameboy.radius,
    backgroundColor: cosmic.signalBlue,
    opacity: 0.55,
  },
  loaderCellActive: {
    backgroundColor: cosmic.signalMint,
    opacity: 1,
  },
  orb: {
    width: 64,
    height: 64,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    backgroundColor: withAlpha(cosmic.soulViolet, 0.08),
    ...pixelShadowStyle(cosmic.soulViolet),
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
