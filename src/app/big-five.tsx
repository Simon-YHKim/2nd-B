// Big Five (TIPI) personality questionnaire — Gosling et al. 2003.
// One of the validated "professional tools" the user requested (master
// blueprint §9 + chat note "전문 도메인 지식과 툴"). Result is saved as
// a record so it surfaces in /persona and feeds Inference engine.

import { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppNav } from "@/components/ui/AppNav";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import {
  TIPI_ITEMS,
  TRAIT_LABEL_EN,
  TRAIT_LABEL_KO,
  scoreTipi,
  type BigFiveTrait,
  type TipiResponses,
} from "@/lib/persona/tipi";

const SCALE: { value: number; en: string; ko: string }[] = [
  { value: 1, en: "Disagree strongly", ko: "전혀 아니다" },
  { value: 2, en: "Disagree", ko: "아니다" },
  { value: 3, en: "Disagree slightly", ko: "약간 아니다" },
  { value: 4, en: "Neither", ko: "보통" },
  { value: 5, en: "Agree slightly", ko: "약간 그렇다" },
  { value: 6, en: "Agree", ko: "그렇다" },
  { value: 7, en: "Agree strongly", ko: "매우 그렇다" },
];

export default function BigFive() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<TipiResponses>({});
  const [submitting, setSubmitting] = useState(false);

  const result = useMemo(() => scoreTipi(responses), [responses]);

  if (loading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  function setResponse(itemId: number, value: number) {
    setResponses((prev) => ({ ...prev, [itemId]: value }));
  }

  async function handleSubmit() {
    if (!userId || !result.complete) return;
    setSubmitting(true);
    try {
      const labels = locale === "ko" ? TRAIT_LABEL_KO : TRAIT_LABEL_EN;
      const summary = result.scores
        .map((s) => `${labels[s.trait]}: ${s.score.toFixed(1)}/7`)
        .join("  ·  ");
      const top = [...result.scores].sort((a, b) => b.score - a.score)[0];
      const conclusion =
        locale === "ko"
          ? `오늘 가장 높은 점수: ${labels[top.trait]} (${top.score.toFixed(1)}/7)`
          : `Highest score today: ${labels[top.trait]} (${top.score.toFixed(1)}/7)`;
      await createRecord({
        userId,
        locale,
        kind: "note",
        body: JSON.stringify({ tipi_responses: responses, scores: result.byTrait }),
        topic: locale === "ko" ? "Big Five (TIPI) 평가" : "Big Five (TIPI) assessment",
        summary,
        conclusion,
        tags: ["big_five", "tipi", "assessment"],
        withFollowup: false,
      });
      Alert.alert(
        locale === "ko" ? "저장됐어요" : "Saved",
        locale === "ko"
          ? "결과는 페르소나 화면에서 다른 기록과 종합돼 표시됩니다."
          : "Results are combined with your other records on the Persona screen.",
      );
      router.replace("/persona");
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "저장 실패" : "Save failed",
        (e as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const traitLabels = locale === "ko" ? TRAIT_LABEL_KO : TRAIT_LABEL_EN;

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text variant="caption" color="brand">
              2nd-Brain
            </Text>
            <Text variant="heading" style={{ marginTop: spacing.xs }}>
              {locale === "ko" ? "Big Five (TIPI) — 10문항" : "Big Five (TIPI) — 10 items"}
            </Text>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "Gosling 등 (2003)의 검증된 10문항 빅파이브 측정. 1(전혀 아니다) ~ 7(매우 그렇다)로 답해 주세요. 3분이면 끝나요."
                : "Gosling et al. (2003) — a validated 10-item Big Five measure. Rate from 1 (Disagree strongly) to 7 (Agree strongly). 3 minutes total."}
            </Text>
          </View>

          <View style={styles.itemList}>
            {TIPI_ITEMS.map((item) => {
              const value = responses[item.id];
              return (
                <View key={item.id} style={styles.itemCard}>
                  <Text variant="body" style={{ marginBottom: spacing.xs }}>
                    {item.id}. {locale === "ko" ? item.ko : item.en}
                  </Text>
                  <View style={styles.scaleRow}>
                    {SCALE.map((s) => {
                      const active = value === s.value;
                      return (
                        <Pressable
                          key={s.value}
                          onPress={() => setResponse(item.id, s.value)}
                          style={[styles.scaleBtn, active && styles.scaleBtnActive]}
                          hitSlop={2}
                        >
                          <Text variant="caption" color={active ? "background" : "textMuted"}>
                            {s.value}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text variant="subtle" color="textSubtle" style={{ marginTop: 4 }}>
                    {locale === "ko" ? "1 = 전혀 아니다 · 7 = 매우 그렇다" : "1 = Disagree strongly · 7 = Agree strongly"}
                  </Text>
                </View>
              );
            })}
          </View>

          {result.answered > 0 ? (
            <View style={styles.scoreCard}>
              <Text variant="caption" color="brand" style={{ letterSpacing: 1 }}>
                {locale === "ko" ? "현재까지 점수 (1~7)" : "Current scores (1–7)"}
              </Text>
              {(["extraversion", "agreeableness", "conscientiousness", "emotional_stability", "openness"] as BigFiveTrait[]).map((trait) => (
                <View key={trait} style={styles.scoreRow}>
                  <Text variant="subtle" color="textMuted">
                    {traitLabels[trait]}
                  </Text>
                  <Text variant="subtle" color="text">
                    {result.byTrait[trait] > 0 ? result.byTrait[trait].toFixed(1) : "—"}
                  </Text>
                </View>
              ))}
              <Text variant="subtle" color="textSubtle">
                {locale === "ko"
                  ? `${result.answered}/10 응답 — 모두 답하면 저장 가능합니다.`
                  : `${result.answered}/10 answered — save unlocks at 10/10.`}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={locale === "ko" ? "결과 저장 (페르소나에 반영)" : "Save result (feeds Persona)"}
              variant="primary"
              onPress={handleSubmit}
              disabled={!result.complete || submitting}
              loading={submitting}
            />
            <Button
              label={locale === "ko" ? "뒤로" : "Back"}
              variant="secondary"
              onPress={() => router.back()}
              disabled={submitting}
            />
          </View>

          <Text variant="subtle" color="textSubtle" style={styles.footnote}>
            {locale === "ko"
              ? "TIPI는 빠른 스크리닝 도구입니다. 정밀한 측정은 BFI-2 등 더 긴 도구가 필요해요. MBTI·에니어그램은 사용하지 않습니다."
              : "TIPI is a quick screener. For high-precision use the BFI-2 or longer instruments. We don't use MBTI / Enneagram."}
          </Text>
          <AppNav locale={locale} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  itemList: { gap: spacing.sm },
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
  scoreCard: {
    backgroundColor: semantic.surface,
    borderLeftColor: semantic.brand,
    borderLeftWidth: 3,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  scoreRow: { flexDirection: "row", justifyContent: "space-between" },
  actions: { gap: spacing.sm },
  footnote: { textAlign: "center", marginTop: spacing.sm },
});
