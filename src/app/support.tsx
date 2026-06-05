// Support (A-to-Z Phase 12) — user-facing "지원". Support copy + the
// 2-business-day SLA (KST) from the product constraints (C11) + a contact
// placeholder. Warm, non-clinical wording only.

import { View, StyleSheet, ScrollView, Linking } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { VILLAGE_UI } from "@/lib/village-ui";

const SUPPORT_EMAIL = "support@2nd-brain.app";

export default function Support() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "지원을 불러오는 중이에요…" : "Loading support…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const ko = locale === "ko";

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={ko ? "08-3. 지원" : "08-3. Support"}
          title={ko ? "막힌 조각을 같이 풀어요" : "Untangle stuck pieces together"}
          subtitle={ko ? "응답 시간 · 문의 · 도움말" : "Response time · contact · help"}
          island={VILLAGE_UI.relation.island}
          worker={VILLAGE_UI.relation.worker}
          accent={VILLAGE_UI.relation.accent}
          speech={ko ? "문제가 생기면 메일로 보내주세요. 필요한 맥락부터 차분히 볼게요." : "Send us what got stuck. We'll start from the context."}
        />

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "응답 시간" : "Response time"}</Text>
          <Text variant="body" color="textMuted">
            {ko
              ? "보내주신 문의는 영업일 기준 2일 안에 답해 드려요 (한국 시간 기준)."
              : "We reply to messages within 2 business days (KST)."}
          </Text>
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.info }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "문의하기" : "Get in touch"}</Text>
          <Text variant="body" color="textMuted">{SUPPORT_EMAIL}</Text>
          <Button
            label={ko ? "메일 보내기" : "Send an email"}
            variant="secondary"
            onPress={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}`); }}
          />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.warning }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>{ko ? "자주 묻는 질문" : "FAQ"}</Text>
          <Text variant="subtle" color="textSubtle">
            {ko ? "도움말 모음은 곧 준비할게요." : "A help center is on the way."}
          </Text>
        </View>

      </ScrollView>
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
});
