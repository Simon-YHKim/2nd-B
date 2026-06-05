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

// Minimal, honest FAQ covering the three topics users ask about most:
// journaling, privacy/export, and AI safety. ko + en parity.
const FAQ_KO = [
  {
    q: "기록은 어떻게 시작하나요?",
    a: "담기 화면에서 떠오른 생각을 그대로 적으면 돼요. 정리는 나중에 조각마을이 도와드려요.",
  },
  {
    q: "내 기록은 어떻게 보관되고, 내보낼 수 있나요?",
    a: "기록은 내 계정에만 연결돼 보관돼요. 설정의 내보내기에서 언제든 내 데이터를 파일로 받아갈 수 있어요.",
  },
  {
    q: "AI는 안전한가요?",
    a: "AI는 정리와 연결을 돕는 보조 역할이에요. 진단이나 치료를 대신하지 않고, 판단은 항상 나에게 있어요.",
  },
];

const FAQ_EN = [
  {
    q: "How do I start journaling?",
    a: "Just write what comes to mind on the capture screen. The village helps you organize it later.",
  },
  {
    q: "How is my data stored, and can I export it?",
    a: "Your entries stay tied to your account only. Use Export in Settings to download your data as a file anytime.",
  },
  {
    q: "Is the AI safe?",
    a: "The AI only helps you organize and connect your notes. It never diagnoses or treats, and the call is always yours.",
  },
];

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
          {(ko ? FAQ_KO : FAQ_EN).map((item, i) => (
            <View key={item.q} style={i > 0 ? styles.faqItem : undefined}>
              <Text variant="body" color="text" style={styles.faqQuestion}>{item.q}</Text>
              <Text variant="subtle" color="textMuted">{item.a}</Text>
            </View>
          ))}
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
  faqItem: {
    marginTop: spacing.md,
    borderTopColor: semantic.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  faqQuestion: { marginBottom: spacing.xs },
});
