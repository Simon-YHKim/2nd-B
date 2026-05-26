// MBTI-style 16-item screener. Disclaimers up front since the user
// explicitly requested it but the blueprint avoids it.

import { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { MBTI_ITEMS, scoreMbti, TYPE_NICKNAME, type MbtiResponses } from "@/lib/persona/mbti";

const SCALE = [1, 2, 3, 4, 5];

export default function Mbti() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<MbtiResponses>({});
  const [submitting, setSubmitting] = useState(false);

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
        locale === "ko" ? "결과는 페르소나 화면에서 다른 기록과 함께 표시됩니다." : "Results are combined with your other records on the Persona screen.",
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text variant="caption" color="brand">
              2nd-Brain
            </Text>
            <Text variant="heading" style={{ marginTop: spacing.xs }}>
              {locale === "ko" ? "MBTI 16타입 — 16문항" : "MBTI 16 types — 16 items"}
            </Text>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "각 문장에 1(전혀 아니다) ~ 5(매우 그렇다)로 답해 주세요. 3분이면 끝나요."
                : "Rate each statement 1 (Disagree strongly) to 5 (Agree strongly). 3 minutes total."}
            </Text>
            <View style={styles.warnCard}>
              <Text variant="caption" color="warning" style={{ letterSpacing: 1 }}>
                {locale === "ko" ? "주의 — 가벼운 자기 인식 도구" : "Note — light self-awareness tool"}
              </Text>
              <Text variant="subtle" color="textMuted" style={{ marginTop: 4, lineHeight: 18 }}>
                {locale === "ko"
                  ? "MBTI는 인기 있는 분류이지만 학술적으로 신뢰도가 낮아요. 단정짓는 도구가 아니라, 자기 관찰의 출발점으로만 쓰세요. 더 검증된 도구가 필요하면 Big Five (TIPI) 또는 애착 스타일 (ECR-S)을 권장합니다."
                  : "MBTI is popular but has weak psychometric validity (low test-retest reliability, no support for the 16-bimodal types). Treat the result as a conversation starter, not a verdict. For validated tools, prefer Big Five (TIPI) or Attachment (ECR-S)."}
              </Text>
            </View>
          </View>

          <View style={styles.itemList}>
            {MBTI_ITEMS.map((item) => {
              const value = responses[item.id];
              return (
                <View key={item.id} style={styles.itemCard}>
                  <Text variant="body" style={{ marginBottom: spacing.xs }}>
                    {item.id}. {locale === "ko" ? item.ko : item.en}
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
                </View>
              );
            })}
          </View>

          {result.answered > 0 ? (
            <View style={styles.scoreCard}>
              <Text variant="caption" color="brand" style={{ letterSpacing: 1 }}>
                {locale === "ko" ? "현재까지" : "Progress"}
              </Text>
              {result.type ? (
                <View style={{ marginTop: spacing.xs }}>
                  <Text variant="heading" style={{ fontSize: 26 }}>
                    {result.type}
                  </Text>
                  <Text variant="subtle" color="textMuted">
                    {TYPE_NICKNAME[locale][result.type] ?? result.type}
                  </Text>
                </View>
              ) : (
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko" ? `${result.answered}/16 응답` : `${result.answered}/16 answered`}
                </Text>
              )}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  warnCard: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    borderLeftColor: semantic.warning,
    borderLeftWidth: 3,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
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
  actions: { gap: spacing.sm },
});
