// Renders a non-dismissable (but closeable) modal when the Safety
// Classifier returns a red zone. Surfaces locale-aware hotlines.
// Does not invoke any LLM; the caller has already short-circuited.
//
// UX choices:
// - Backdrop tap does NOT dismiss. A panicked accidental tap shouldn't
//   close a safety surface; explicit "닫기 / Close" button only.
// - Hotline row is tap-to-call (tel: URI). On native this opens the
//   dialer; on web most browsers prompt to call via the system handler.
// - aria/accessibility hints surface the hotline number to screen readers.

import { useCallback } from "react";
import { Modal, View, StyleSheet, Pressable, Linking } from "react-native";
import { useTranslation } from "react-i18next";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { WorkerSprite } from "@/components/art/WorkerSprite";
import { HOTLINES, type HotlineId } from "@/lib/safety/lexicon";

export interface CrisisRouterProps {
  visible: boolean;
  hotline: HotlineId;
  onClose: () => void;
}

// P1-3 (Simon-approved option A, 2026-06-11): 988 serves the US, but the EN
// locale also reaches users in countries we have no number for. ThroughLine's
// findahelpline.com (the directory WHO and major platforms point to) covers
// the rest — surfaced as a secondary row, never replacing the call box.
export const CRISIS_DIRECTORY_URL = "https://findahelpline.com";

export function CrisisRouter({ visible, hotline, onClose }: CrisisRouterProps) {
  const { t } = useTranslation("safety");
  const number = HOTLINES[hotline].number;
  const isKorean =
    hotline === "KR_109" ||
    hotline === "KR_1393" ||
    hotline === "KR_1577_0199" ||
    hotline === "KR_1388";

  const handleCall = useCallback(() => {
    // Strip non-digits for the tel: URI (e.g. "1577-0199" → "15770199").
    const dialNumber = number.replace(/[^\d+]/g, "");
    void Linking.openURL(`tel:${dialNumber}`).catch(() => {
      // If the system can't open tel: (web with no handler), do nothing —
      // the number is also visible as text.
    });
  }, [number]);

  const handleDirectory = useCallback(() => {
    void Linking.openURL(CRISIS_DIRECTORY_URL).catch(() => {
      // Browser open failed — the hotline number above is still actionable.
    });
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Hardware back / Esc — explicit dismissal is fine, just not backdrop.
      onRequestClose={onClose}
    >
      <View
        style={styles.backdrop}
        accessibilityViewIsModal
        accessibilityRole="alert"
        accessibilityLabel={isKorean ? "긴급 안전 안내" : "Crisis safety notice"}
      >
        <View style={styles.card}>
          <View style={styles.hotlineBadge}>
            <Text variant="subtle" style={styles.hotlineBadgeText}>
              {isKorean ? "긴급" : "URGENT"}
            </Text>
          </View>
          <View style={styles.titleRow}>
            {/* 가디 — safety guard, calm and protective (§9) */}
            <WorkerSprite id="gadi" size={40} />
            <Text variant="heading" style={{ flexShrink: 1 }}>{t("red.title")}</Text>
          </View>
          <Text variant="body" color="textMuted">{t("red.body")}</Text>
          {/* Safety-critical: visuals live on the wrapper View, NOT the
              Pressable — Fabric Android drops function-form Pressable styles
              (#680), which can render the hotline box invisible. */}
          <View style={styles.hotlineBox}>
            <Pressable
              onPress={handleCall}
              accessibilityRole="button"
              accessibilityHint={isKorean ? "전화 걸기" : "Place a call"}
              accessibilityLabel={`${number}: ${HOTLINES[hotline].label}`}
              style={({ pressed }) => [styles.hotlinePress, pressed && styles.hotlineBoxPressed]}
            >
              <Text variant="body" style={styles.hotline}>
                {t(`red.hotline.${hotline}`)}
              </Text>
              <Text variant="subtle" color="textMuted" style={{ marginTop: 4 }}>
                {isKorean ? "탭하여 전화 걸기" : "Tap to call"}
              </Text>
            </Pressable>
          </View>
          {hotline === "GLOBAL_988" ? (
            <View style={styles.directoryRow}>
              <Pressable
                onPress={handleDirectory}
                accessibilityRole="link"
                accessibilityLabel={t("red.directoryLabel")}
                accessibilityHint={t("red.directoryHint")}
                style={({ pressed }) => [styles.directoryPress, pressed && styles.hotlineBoxPressed]}
              >
                <Text variant="caption" color="brand">{t("red.directoryLabel")}</Text>
              </Pressable>
            </View>
          ) : null}
          <Button label={t("red.dismiss")} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    width: "100%",
    maxWidth: 440,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  hotlineBadge: {
    alignSelf: "flex-start",
    backgroundColor: semantic.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  hotlineBadgeText: {
    color: semantic.text,
    fontWeight: "700",
    letterSpacing: 0,
    fontSize: 12,
  },
  hotlineBox: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    borderStartWidth: 3,
    borderStartColor: semantic.brand,
    overflow: "hidden",
  },
  // bare touch surface inside the styled wrapper (#680 Fabric-safe)
  hotlinePress: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  hotlineBoxPressed: {
    backgroundColor: semantic.surface,
    opacity: 0.85,
  },
  directoryRow: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  directoryPress: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  hotline: {
    color: semantic.brand,
    fontWeight: "600",
    fontSize: 16,
  },
});
