// Support (A-to-Z Phase 12) - user-facing "지원". Support copy + the
// 2-business-day SLA (KST) from the product constraints (C11) + a contact
// route. Warm, non-clinical wording only.

import { View, StyleSheet, ScrollView, Linking, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { VILLAGE_UI } from "@/lib/village-ui";

const SUPPORT_EMAIL = "support@2nd-brain.app";

type SupportFaq = { question: string; answer: string };

export default function Support() {
  const { t } = useTranslation("support");
  const { userId, loading } = useAuth();
  const faq = t("faq", { returnObjects: true }) as SupportFaq[];

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
          island={VILLAGE_UI.relation.island}
          worker={VILLAGE_UI.relation.worker}
          accent={VILLAGE_UI.relation.accent}
          speech={t("hero.speech")}
        />

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{t("response.eyebrow")}</Text>
          <Text variant="body" color="textMuted">
            {t("response.body")}
          </Text>
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.info }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{t("contact.eyebrow")}</Text>
          <Text variant="body" color="textMuted">{SUPPORT_EMAIL}</Text>
          <Button
            label={t("contact.button")}
            variant="secondary"
            accessibilityLabel={t("contact.accessibilityLabel")}
            accessibilityHint={t("contact.accessibilityHint")}
            onPress={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}`); }}
          />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.warning }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{t("faqLabel")}</Text>
          {faq.map((item, i) => (
            <View key={item.question} style={i > 0 ? styles.faqItem : undefined}>
              <Text variant="body" color="text" style={styles.faqQuestion}>{item.question}</Text>
              <Text variant="subtle" color="textMuted">{item.answer}</Text>
            </View>
          ))}
        </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: semantic.brand,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: { letterSpacing: 0 },
  faqItem: {
    marginTop: spacing.md,
    borderTopColor: semantic.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  faqQuestion: { marginBottom: spacing.xs },
});
