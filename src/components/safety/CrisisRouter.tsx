// Renders a non-dismissable (but closeable) modal when the Safety
// Classifier returns a red zone. Surfaces locale-aware hotlines.
// Does not invoke any LLM; the caller has already short-circuited.

import { Modal, View, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import type { HotlineId } from "@/lib/safety/lexicon";

export interface CrisisRouterProps {
  visible: boolean;
  hotline: HotlineId;
  onClose: () => void;
}

export function CrisisRouter({ visible, hotline, onClose }: CrisisRouterProps) {
  const { t } = useTranslation("safety");
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.hotlineBadge}>
            <Text variant="subtle" style={styles.hotlineBadgeText}>
              {hotline === "KR_1393" || hotline === "KR_1577_0199" ? "긴급" : "URGENT"}
            </Text>
          </View>
          <Text variant="heading">{t("red.title")}</Text>
          <Text variant="body" color="textMuted">{t("red.body")}</Text>
          <View style={styles.hotlineBox}>
            <Text variant="body" style={styles.hotline}>
              {t(`red.hotline.${hotline}`)}
            </Text>
          </View>
          <Button label={t("red.dismiss")} variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
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
  hotlineBadge: {
    alignSelf: "flex-start",
    backgroundColor: semantic.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  hotlineBadgeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 1,
    fontSize: 10,
  },
  hotlineBox: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: semantic.brand,
  },
  hotline: {
    color: semantic.brand,
    fontWeight: "600",
    fontSize: 16,
  },
});
