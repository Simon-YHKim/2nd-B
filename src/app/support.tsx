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
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { canonGaps } from "@/lib/canon";
import { VILLAGE_UI } from "@/lib/village-ui";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceSupportDesignScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

const SUPPORT_EMAIL = "support@2nd-brain.app";

type SupportFaq = { question: string; answer: string };

function SupportLegacy() {
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

        <View style={[styles.section, { borderStartColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{t("response.eyebrow")}</Text>
          <Text variant="body" color="textMuted">
            {t("response.body")}
          </Text>
        </View>

        <View style={[styles.section, { borderStartColor: semantic.info }]}>
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

        <View style={[styles.section, { borderStartColor: semantic.warning }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{t("faqLabel")}</Text>
          {faq.map((item, i) => (
            <View key={item.question} style={i > 0 ? styles.faqItem : undefined}>
              <Text variant="body" color="text" style={styles.faqQuestion}>{item.question}</Text>
              <Text variant="subtle" color="textMuted">{item.answer}</Text>
            </View>
          ))}
        </View>

        {/* Canon (proto rev2) additive help content — the prototype's SupportScreen
            carried concept FAQs + notices the app never wired (gaps.json). Rendered
            KO-from-canon (museum pattern) to avoid 5-locale churn; the existing
            locale-sourced sections above are untouched. */}
        <View style={[styles.section, { borderStartColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>개념 도움말</Text>
          {canonGaps.faqs.map((item, i) => (
            <View key={item.q} style={i > 0 ? styles.faqItem : undefined}>
              <Text variant="body" color="text" style={styles.faqQuestion}>{item.q}</Text>
              <Text variant="subtle" color="textMuted">{item.a}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.section, { borderStartColor: semantic.info }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>공지사항</Text>
          {canonGaps.notices.map((n, i) => (
            <View key={n.t} style={[styles.noticeRow, i > 0 ? styles.faqItem : undefined]}>
              <Text variant="caption" color="brand" style={styles.noticeTag}>{n.tag}</Text>
              <Text variant="body" color="text" style={styles.noticeTitle}>{n.t}</Text>
              <Text variant="subtle" color="textMuted">{n.d}</Text>
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
    borderStartWidth: 4,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: semantic.brand,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    ...androidElevationStyle(androidElevation.card),
  },
  eyebrow: { letterSpacing: 0 },
  faqItem: {
    marginTop: spacing.md,
    borderTopColor: semantic.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  faqQuestion: { marginBottom: spacing.xs },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  noticeTag: { flexShrink: 0 },
  noticeTitle: { flex: 1, minWidth: 0 },
});

export default function Support() {
  if (isDeepSpaceUI()) return <DeepSpaceSupportDesignScreen />;
  return <SupportLegacy />;
}
