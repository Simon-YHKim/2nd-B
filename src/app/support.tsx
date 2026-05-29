// Support (A-to-Z Phase 12) — user-facing "지원". Support copy + the
// 2-business-day SLA (KST) from the product constraints (C11) + a contact
// placeholder. Warm, non-clinical wording only.

import { View, StyleSheet, ScrollView, Linking } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";

const SUPPORT_EMAIL = "support@2nd-brain.app";

export default function Support() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const ko = locale === "ko";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <Text variant="caption" color="brand" style={{ letterSpacing: 1.5 }}>
            {ko ? "설정" : "Settings"}
          </Text>
          <Text variant="heading">{ko ? "지원" : "Support"}</Text>
          <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.xs }}>
            {ko ? "막히는 곳이 있으면 도와드릴게요." : "If anything's in your way, we'll help."}
          </Text>
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "응답 시간" : "Response time"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "보내주신 문의는 영업일 기준 2일 안에 답해 드려요 (한국 시간 기준)."
              : "We reply to messages within 2 business days (KST)."}
          </Text>
        </View>

        <View style={[styles.section, { borderLeftColor: cosmic.soulViolet }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "문의하기" : "Get in touch"}</Text>
          <Text variant="body" color="textMuted">{SUPPORT_EMAIL}</Text>
          <Button
            label={ko ? "메일 보내기" : "Send an email"}
            variant="secondary"
            onPress={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}`); }}
          />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.info }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "자주 묻는 질문" : "FAQ"}</Text>
          <Text variant="subtle" color="textSubtle">
            {ko ? "도움말 모음은 곧 준비할게요." : "A help center is on the way."}
          </Text>
        </View>

        <Button label={ko ? "설정으로" : "Back to settings"} variant="secondary" onPress={() => router.push("/settings")} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: { letterSpacing: 1 },
});
