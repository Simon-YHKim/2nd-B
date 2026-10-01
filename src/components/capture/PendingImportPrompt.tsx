import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PixelScrim } from "@/components/pixel/PixelDither";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { semantic, spacing } from "@/lib/theme/tokens";
import type { PendingImportPromptState } from "@/lib/capture/use-import-pending";

export function PendingImportPrompt({
  prompt,
  onConfirm,
  onDefer,
}: {
  prompt: PendingImportPromptState | null;
  onConfirm: () => void;
  onDefer: () => void;
}) {
  const { t } = useTranslation("import");
  return (
    <Modal
      visible={prompt !== null}
      transparent
      animationType="fade"
      onRequestClose={onDefer}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <PixelScrim />
        </View>
        <ScrollView style={styles.card} contentContainerStyle={styles.cardContent}>
          <Text variant="heading">{t("pendingDevice.title")}</Text>
          <Text variant="body" color="textMuted">
            {t("pendingDevice.body", { count: prompt?.count ?? 0 })}
          </Text>
          {prompt?.email ? (
            <Text variant="body" accessibilityLabel={t("pendingDevice.account", { email: prompt.email })}>
              {t("pendingDevice.account", { email: prompt.email })}
            </Text>
          ) : (
            <Text variant="body" color="textMuted" accessibilityRole="alert">
              {t("pendingDevice.accountUnavailable")}
            </Text>
          )}
          {prompt?.error ? (
            <Text variant="body" color="textMuted" accessibilityRole="alert">
              {t("pendingDevice.error")}
            </Text>
          ) : null}
          <Button
            label={prompt?.importing ? t("pendingDevice.importing") : t("pendingDevice.confirm")}
            accessibilityHint={t("pendingDevice.confirmHint")}
            disabled={!prompt?.email || prompt.importing}
            onPress={onConfirm}
          />
          <Button
            label={t("pendingDevice.defer")}
            accessibilityHint={t("pendingDevice.deferHint")}
            variant="ghost"
            disabled={prompt?.importing}
            onPress={onDefer}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
  },
  cardContent: {
    padding: spacing.xl,
    gap: spacing.md,
  },
});
