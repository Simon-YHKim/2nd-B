import { useTranslation } from "react-i18next";
import { View, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Link, Redirect } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing, typography } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Landing() {
  const { t, i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      </Screen>
    );
  }

  if (userId) return <Redirect href="/journal" />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <Text variant="caption" color="brand">2nd-Brain</Text>
          <Text variant="display" style={styles.display}>
            {t("app.name")}
          </Text>
          <Text variant="body" color="textMuted" style={styles.tagline}>
            {locale === "ko"
              ? "노트 저장소가 아닌, 당신을 배우는 AI."
              : "Not a note vault — an AI that learns you."}
          </Text>
        </View>

        <View style={styles.pillars}>
          {PILLARS[locale].map((p) => (
            <View key={p.title} style={styles.pillarCard}>
              <Text variant="subtle" color="brand" style={{ letterSpacing: 1, fontWeight: "700" }}>
                {p.eyebrow}
              </Text>
              <Text variant="body" style={{ marginTop: spacing.xs, fontSize: typography.sizes.lg, fontWeight: "600" }}>
                {p.title}
              </Text>
              <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
                {p.body}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.evidenceCard}>
          <Text variant="caption" color="textMuted" style={{ letterSpacing: 1 }}>
            {locale === "ko" ? "근거 기반" : "Evidence-grounded"}
          </Text>
          <Text variant="body" style={{ marginTop: spacing.xs }}>
            {locale === "ko"
              ? "Big Five · Self-Determination Theory · Attachment · VIA · Erikson — 검증된 학술 프레임만 인용합니다. MBTI나 점성술은 사용하지 않습니다."
              : "Big Five · Self-Determination Theory · Attachment · VIA · Erikson — we cite only validated frameworks. No MBTI, no astrology."}
          </Text>
        </View>

        <View style={styles.actions}>
          <Link href="/sign-up" asChild>
            <Button label={locale === "ko" ? "시작하기" : "Get started"} variant="primary" />
          </Link>
          <Link href="/sign-in" asChild>
            <Button label={locale === "ko" ? "로그인" : "Sign in"} variant="secondary" />
          </Link>
        </View>

        <Text variant="subtle" color="textSubtle" style={styles.disclosure}>
          {locale === "ko"
            ? "진단이 아닙니다. 치료 권고도 아닙니다. 자기 이해를 돕는 도구입니다."
            : "Not a diagnosis. Not therapeutic advice. A reflection scaffold."}
        </Text>
      </ScrollView>
    </Screen>
  );
}

// Three pillars per DESIGN.md voice ("companion, not coach") + blueprint §1
// differentiators (guided capture, portability, validated psychology).
const PILLARS: Record<"en" | "ko", { eyebrow: string; title: string; body: string }[]> = {
  en: [
    {
      eyebrow: "01 · CAPTURE",
      title: "Journal that asks back.",
      body: "Daily entries, life-audit interviews, and free-form notes — the questions are tuned to who you've been writing as.",
    },
    {
      eyebrow: "02 · INFER",
      title: "A self-model that updates.",
      body: "Patterns extracted across your entries — Big Five proxy, values, attachment cues — surfaced as observations, never verdicts.",
    },
    {
      eyebrow: "03 · OWN",
      title: "Portable RAG, your data.",
      body: "Export a Markdown knowledge base that works with Claude, ChatGPT, or whatever comes next. Your second brain travels.",
    },
  ],
  ko: [
    {
      eyebrow: "01 · 캡처",
      title: "되묻는 일기.",
      body: "매일의 기록, 라이프 오딧 인터뷰, 자유 노트. 질문은 당신이 어떻게 써왔는지에 맞춰 정교해집니다.",
    },
    {
      eyebrow: "02 · 추론",
      title: "업데이트되는 자기 모델.",
      body: "기록 전체에서 패턴을 추출합니다. Big Five 근사, 가치, 애착 단서를 단정이 아닌 관찰로 보여드려요.",
    },
    {
      eyebrow: "03 · 소유",
      title: "당신 데이터, 어디서든.",
      body: "Markdown 지식 베이스로 내보내면 Claude·ChatGPT·차세대 어떤 도구에도 가져갈 수 있어요. 두번째 뇌는 함께 이동합니다.",
    },
  ],
};

const styles = StyleSheet.create({
  scroll: { gap: spacing.xl, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  display: { marginTop: spacing.sm, fontSize: typography.sizes.display, fontWeight: "800", letterSpacing: -1 },
  tagline: { marginTop: spacing.sm, fontSize: typography.sizes.lg, lineHeight: typography.sizes.lg * 1.4 },
  pillars: { gap: spacing.md },
  pillarCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  evidenceCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: semantic.brand,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  actions: { gap: spacing.sm },
  disclosure: { textAlign: "center", marginTop: spacing.sm },
});
