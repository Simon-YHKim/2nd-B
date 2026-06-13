// Data management (A-to-Z Phase 12) - user-facing "데이터 관리". Structural
// hub that explains each data action in plain language and routes to the
// place that performs it. The actual destructive controls live in the
// settings danger zone; export lives on the wiki screen. This screen makes
// the data-control surface discoverable and explains what each does.

import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { VILLAGE_UI } from "@/lib/village-ui";

export default function DataManagement() {
  const { t } = useTranslation("data");
  const { userId, loading } = useAuth();

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={VILLAGE_UI.records.island}
          worker={VILLAGE_UI.records.worker}
          accent={VILLAGE_UI.records.accent}
          speech={t("hero.speech")}
        />

        <View style={[styles.section, { borderStartColor: cosmic.soulViolet }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{t("import.eyebrow")}</Text>
          <Text variant="body" color="textMuted">
            {t("import.body")}
          </Text>
          <Button
            label={t("import.button")}
            variant="secondary"
            onPress={() => router.push("/import")}
            accessibilityHint={t("import.accessibilityHint")}
          />
        </View>

        <View style={[styles.section, { borderStartColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{t("export.eyebrow")}</Text>
          <Text variant="body" color="textMuted">
            {t("export.body")}
          </Text>
          <Button
            label={t("export.button")}
            variant="secondary"
            onPress={() => router.push("/wiki")}
            accessibilityHint={t("export.accessibilityHint")}
          />
        </View>

        <View style={[styles.section, { borderStartColor: semantic.danger }]}>
          <Text variant="caption" color="danger" style={styles.eyebrow}>{t("delete.eyebrow")}</Text>
          <Text variant="body" color="textMuted">
            {t("delete.body")}
          </Text>
          <Button
            label={t("delete.button")}
            variant="secondary"
            onPress={() => router.push("/settings")}
            accessibilityHint={t("delete.accessibilityHint")}
          />
        </View>

        <View style={[styles.section, { borderStartColor: cosmic.soulViolet }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{t("device.eyebrow")}</Text>
          <Text variant="body" color="textMuted">
            {t("device.body")}
          </Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderStartWidth: 4,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    ...androidElevationStyle(androidElevation.card),
  },
  eyebrow: { letterSpacing: 0 },
});
