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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          <Text variant="heading">{t("red.title")}</Text>
          <Text variant="body" color="textMuted">{t("red.body")}</Text>
          <Text variant="body" style={styles.hotline}>
            {t(`red.hotline.${hotline}`)}
          </Text>
          <Button label={t("red.dismiss")} variant="secondary" onPress={onClose} />
        </View>
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
    maxWidth: 420,
  },
  hotline: {
    marginVertical: spacing.sm,
    color: semantic.brand,
    fontWeight: "600",
  },
});
