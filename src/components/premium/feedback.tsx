// Premium feedback surfaces (Part 1): bottom sheet, modal, toast, and the
// empty / loading / error / safety states. Glassy, glowing, reduced-motion
// aware. Copy is warm + non-clinical; safety uses Gadi's calm rose tone.

import { type ReactNode, useEffect, useRef } from "react";
import { ActivityIndicator, Animated, BackHandler, Easing, Modal, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { cosmic, radii, spacing } from "@/lib/theme/tokens";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { PremiumButton } from "./surfaces";

/** Slide-up glassy bottom sheet. Screen-fixed; renders nothing when closed. */
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
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
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
export function PremiumModal({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
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
  return <StateShell glyph={<ActivityIndicator color={cosmic.signalMint} />} title={message ?? "불러오는 중이에요…"} />;
}

export function PremiumEmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <StateShell glyph={<View style={[styles.orb, { borderColor: cosmic.soulViolet }]} />} title={title} body={body} action={action} />;
}

export function PremiumErrorState({ title, body, onRetry, retryLabel = "다시 시도" }: { title: string; body?: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <StateShell
      glyph={<View style={[styles.orb, { borderColor: cosmic.guardRose }]} />}
      title={title}
      body={body}
      action={onRetry ? <PremiumButton label={retryLabel} variant="secondary" onPress={onRetry} /> : undefined}
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
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.42)",
    backgroundColor: "rgba(7,10,24,0.98)",
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.34,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  sheetHandle: { alignSelf: "center", width: 42, height: 3, borderRadius: 2, backgroundColor: "rgba(114,242,199,0.52)", marginBottom: spacing.sm },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.8)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.42)",
    backgroundColor: "rgba(7,10,24,0.98)",
    padding: spacing.lg,
    gap: spacing.md,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    backgroundColor: "rgba(13,21,48,0.96)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  toastDot: { width: 8, height: 8, borderRadius: 4 },
  state: { alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  stateGlyph: { marginBottom: spacing.xs },
  stateAction: { marginTop: spacing.sm, width: "100%", maxWidth: 300, gap: spacing.sm },
  orb: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 2,
    backgroundColor: "rgba(167,139,250,0.08)",
    shadowColor: cosmic.soulViolet, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },
  safety: {
    borderWidth: 1,
    borderColor: "rgba(255,122,144,0.5)",
    backgroundColor: "rgba(255,122,144,0.08)",
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  safetyHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
