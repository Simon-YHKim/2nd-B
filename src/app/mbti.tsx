// MBTI-style 32-item screener. Disclaimers up front since the user
// explicitly requested it but the blueprint avoids it.

import { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { PremiumAppShell } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { MBTI_ITEMS, scoreMbti, TYPE_NICKNAME, type MbtiResponses } from "@/lib/persona/mbti";
import { QuantIntroModal } from "@/components/quant/QuantIntroModal";
import { QuantPager } from "@/components/quant/QuantPager";

const SCALE = [1, 2, 3, 4, 5];

export default function Mbti() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<MbtiResponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);

  const result = useMemo(() => scoreMbti(responses), [responses]);

  if (loading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  function setResponse(itemId: number, value: number) {
    setResponses((prev) => ({ ...prev, [itemId]: value }));
  }

  async function handleSubmit() {
    if (!userId || !result.complete || !result.type) return;
    setSubmitting(true);
    try {
      const nickname = TYPE_NICKNAME[locale][result.type] ?? result.type;
      const summary =
        locale === "ko"
          ? `유형: ${result.type} (${nickname})`
          : `Type: ${result.type} (${nickname})`;
      await createRecord({
        userId,
        locale,
        kind: "note",
        body: JSON.stringify({ mbti_responses: responses, type: result.type, scores: result.scores }),
        topic: locale === "ko" ? "MBTI 16타입 평가" : "MBTI 16-type assessment",
        summary,
        conclusion:
          locale === "ko"
            ? "MBTI는 인기 있는 분류이지만 학술적 신뢰도가 낮아요. 결과는 자기 인식의 시작점으로만 가볍게 활용하세요."
            : "MBTI is popular but has weak scientific validity. Use the result as a self-awareness starting point, not a verdict.",
        tags: ["mbti", "assessment", `type-${result.type.toLowerCase()}`],
        withFollowup: false,
      });
      Alert.alert(
        locale === "ko" ? "저장됐어요" : "Saved",
        locale === "ko" ? "우리가 페르소나 화면에서 다른 기록과 함께 묶어둘게요." : "We'll fold this in with your other records on the Persona screen.",
      );
      router.replace("/persona");
    } catch (e) {
      Alert.alert(locale === "ko" ? "저장 실패" : "Save failed", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PremiumAppShell>
      {!started ? (
        <QuantIntroModal
          toolKey="mbti"
          title={locale === "ko" ? "MBTI 16유형" : "MBTI 16 types"}
          itemCount={MBTI_ITEMS.length}
          estimatedMinutes={6}
          description={
            locale === "ko"
              ? "4가지 축 (외향/내향 · 감각/직관 · 사고/감정 · 판단/인식)에 대한 32개 문장에 답하면 16가지 유형 중 하나가 나옵니다. 한 페이지 5문항씩, 7페이지로 나눠집니다."
              : "Answer 32 statements across 4 axes (extraversion/introversion, sensing/intuition, thinking/feeling, judging/perceiving) and land on one of 16 types. Split across 7 pages, 5 items each."
          }
          citation={
            locale === "ko"
              ? "16personalities-style 공개 문항 차용 · 공식 MBTI® 아님"
              : "Paraphrased from 16personalities-style public pool · not the official MBTI® inventory"
          }
          disclaimer={
            locale === "ko"
              ? "주의: MBTI는 학술적 신뢰도가 낮은 분류입니다. 단정짓는 도구가 아니라 자기 관찰의 출발점으로만 사용하세요. 더 검증된 측정이 필요하면 Big Five (BFI-44) 또는 애착 스타일 (ECR-S)을 권장합니다."
              : "Caveat: MBTI has weak psychometric validity (low test-retest, no support for bimodal types). Treat as a conversation starter, not a verdict. For validated tools, prefer Big Five (BFI-44) or Attachment (ECR-S)."
          }
          locale={locale}
          onStart={() => setStarted(true)}
          onCancel={() => router.back()}
        />
      ) : null}

      {started ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <Text variant="caption" color="brand">
              {locale === "ko" ? "MBTI · 32문항" : "MBTI · 32 items"}
            </Text>
            {result.type ? (
              <Text variant="subtle" color="textMuted">
                {locale === "ko" ? `현재까지 유형: ${result.type}` : `Current type: ${result.type}`}
              </Text>
            ) : (
              <Text variant="body" color="textMuted">
                {locale === "ko"
                  ? "각 문장에 1(전혀 아니다) ~ 5(매우 그렇다)로 답해 주세요."
                  : "Rate each statement 1 (strongly disagree) to 5 (strongly agree)."}
              </Text>
            )}
          </View>

          <QuantPager
            totalItems={MBTI_ITEMS.length}
            perPage={5}
            answered={result.answered}
            complete={result.complete}
            onSubmit={handleSubmit}
            submitDisabled={!result.complete || submitting}
            submitLoading={submitting}
            locale={locale}
            renderItem={(idx) => {
              const item = MBTI_ITEMS[idx];
              const value = responses[item.id];
              return (
                <View style={styles.itemCard}>
                  <Text variant="body" style={{ marginBottom: 2 }}>
                    {item.id}. {locale === "ko" ? item.ko : item.en}
                  </Text>
                  <Text variant="subtle" color="textSubtle" style={{ marginBottom: spacing.xs }}>
                    {locale === "ko" ? item.subtitleKo : item.subtitleEn}
                  </Text>
                  <View style={styles.scaleRow}>
                    {SCALE.map((v) => {
                      const active = value === v;
                      return (
                        <Pressable
                          key={v}
                          onPress={() => setResponse(item.id, v)}
                          style={[styles.scaleBtn, active && styles.scaleBtnActive]}
                          hitSlop={2}
                        >
                          <Text variant="caption" color={active ? "background" : "textMuted"}>
                            {v}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.scaleLegend}>
                    <Text variant="subtle" color="textSubtle">
                      {locale === "ko" ? "전혀 아니다" : "Strongly disagree"}
                    </Text>
                    <Text variant="subtle" color="textSubtle">
                      {locale === "ko" ? "매우 그렇다" : "Strongly agree"}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        </KeyboardAvoidingView>
      ) : null}
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginBottom: spacing.md },
  itemCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  scaleRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.xs },
  scaleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
    alignItems: "center",
  },
  scaleBtnActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  scaleLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
});
