// Attachment style assessment (ECR-S, Wei et al. 2007). 12 items, two
// subscales (anxiety + avoidance), 4 styles based on median splits.

import { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import {
  ECR_ITEMS,
  STYLE_DESCRIPTION,
  STYLE_LABEL,
  scoreEcr,
  type EcrResponses,
} from "@/lib/persona/attachment";
import { QuantIntroModal } from "@/components/quant/QuantIntroModal";
import { QuantPager } from "@/components/quant/QuantPager";

const SCALE = [1, 2, 3, 4, 5, 6, 7];

export default function Attachment() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<EcrResponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);

  const result = useMemo(() => scoreEcr(responses), [responses]);

  if (loading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  function setResponse(itemId: number, value: number) {
    setResponses((prev) => ({ ...prev, [itemId]: value }));
  }

  async function handleSubmit() {
    if (!userId || !result.complete || !result.style) return;
    setSubmitting(true);
    try {
      const styleLabel = STYLE_LABEL[locale][result.style];
      const summary =
        locale === "ko"
          ? `애착 스타일: ${styleLabel} · 불안 ${result.anxiety.toFixed(1)}/7 · 회피 ${result.avoidance.toFixed(1)}/7`
          : `Style: ${styleLabel} · Anxiety ${result.anxiety.toFixed(1)}/7 · Avoidance ${result.avoidance.toFixed(1)}/7`;
      await createRecord({
        userId,
        locale,
        kind: "note",
        body: JSON.stringify({
          ecr_responses: responses,
          anxiety: result.anxiety,
          avoidance: result.avoidance,
          style: result.style,
        }),
        topic: locale === "ko" ? "ECR-S 애착 스타일" : "ECR-S Attachment style",
        summary,
        conclusion: STYLE_DESCRIPTION[locale][result.style],
        tags: ["attachment", "ecr", "assessment"],
        withFollowup: false,
      });
      Alert.alert(
        locale === "ko" ? "저장됐어요" : "Saved",
        locale === "ko"
          ? "결과는 페르소나 화면에서 다른 기록과 함께 표시돼요."
          : "Results are combined with your other records on the Persona screen.",
      );
      router.replace("/persona");
    } catch (e) {
      Alert.alert(locale === "ko" ? "저장 실패" : "Save failed", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      {!started ? (
        <QuantIntroModal
          toolKey="ecr"
          title={locale === "ko" ? "애착 스타일 (ECR-S)" : "Attachment style (ECR-S)"}
          itemCount={ECR_ITEMS.length}
          estimatedMinutes={3}
          description={
            locale === "ko"
              ? "가까운 관계에서 당신의 패턴 — 불안과 회피 두 축에서 — 을 측정해 4가지 스타일 중 하나로 분류합니다. 답할 때는 한 명의 특정 관계가 아니라 ‘가까운 관계 전반’ 을 떠올려 주세요. 한 페이지 5문항씩, 3페이지로 나눠집니다."
              : "Measures your pattern in close relationships across two axes — anxiety and avoidance — and lands you in one of four styles. Think of close relationships in general, not one specific person. Split across 3 pages, 5 items each (last page has 2)."
          }
          citation={
            locale === "ko"
              ? "Wei, Russell, Mallinckrodt, & Vogel (2007) · 검증된 단축형"
              : "Wei, Russell, Mallinckrodt, & Vogel (2007) · validated short form"
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
              {locale === "ko" ? "ECR-S · 12문항" : "ECR-S · 12 items"}
            </Text>
            {result.style ? (
              <Text variant="subtle" color="textMuted">
                {locale === "ko"
                  ? `현재 스타일: ${STYLE_LABEL[locale][result.style]} · 불안 ${result.anxiety.toFixed(1)} · 회피 ${result.avoidance.toFixed(1)}`
                  : `Current style: ${STYLE_LABEL[locale][result.style]} · anx ${result.anxiety.toFixed(1)} · avo ${result.avoidance.toFixed(1)}`}
              </Text>
            ) : (
              <Text variant="body" color="textMuted">
                {locale === "ko"
                  ? "가까운 관계 전반을 떠올리며 1(전혀 아니다) ~ 7(매우 그렇다)로 답해 주세요."
                  : "Think of close relationships in general. Rate 1 (strongly disagree) to 7 (strongly agree)."}
              </Text>
            )}
          </View>

          <QuantPager
            totalItems={ECR_ITEMS.length}
            perPage={5}
            answered={result.answered}
            complete={result.complete}
            onSubmit={handleSubmit}
            submitDisabled={!result.complete || submitting}
            submitLoading={submitting}
            locale={locale}
            renderItem={(idx) => {
              const item = ECR_ITEMS[idx];
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
    </Screen>
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
