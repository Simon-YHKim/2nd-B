// Attachment style assessment (ECR-S, Wei et al. 2007). 12 items, two
// subscales (anxiety + avoidance), 4 styles based on median splits.

import { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { AppNav } from "@/components/ui/AppNav";
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

const SCALE = [1, 2, 3, 4, 5, 6, 7];

export default function Attachment() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<EcrResponses>({});
  const [submitting, setSubmitting] = useState(false);

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text variant="caption" color="brand">
              2nd-Brain
            </Text>
            <Text variant="heading" style={{ marginTop: spacing.xs }}>
              {locale === "ko" ? "애착 스타일 (ECR-S) — 12문항" : "Attachment style (ECR-S) — 12 items"}
            </Text>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "Wei 외 (2007)의 검증된 12문항 단축형. 가까운 관계에서 자신의 패턴을 떠올리며 1(전혀 아니다) ~ 7(매우 그렇다)로 답해 주세요."
                : "Wei et al. (2007) 12-item short form. Picture your typical pattern in close relationships and rate 1 (Disagree strongly) to 7 (Agree strongly)."}
            </Text>
          </View>

          <View style={styles.itemList}>
            {ECR_ITEMS.map((item) => {
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
              <View style={styles.dimRow}>
                <Text variant="subtle" color="textMuted">{locale === "ko" ? "불안" : "Anxiety"}</Text>
                <Text variant="subtle" color="text">{result.anxiety > 0 ? result.anxiety.toFixed(1) : "—"}</Text>
              </View>
              <View style={styles.dimRow}>
                <Text variant="subtle" color="textMuted">{locale === "ko" ? "회피" : "Avoidance"}</Text>
                <Text variant="subtle" color="text">{result.avoidance > 0 ? result.avoidance.toFixed(1) : "—"}</Text>
              </View>
              {result.style ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Text variant="caption" color="brand">
                    {locale === "ko" ? "스타일: " : "Style: "}
                    {STYLE_LABEL[locale][result.style]}
                  </Text>
                  <Text variant="subtle" color="textMuted" style={{ marginTop: 2 }}>
                    {STYLE_DESCRIPTION[locale][result.style]}
                  </Text>
                </View>
              ) : (
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko"
                    ? `${result.answered}/12 응답`
                    : `${result.answered}/12 answered`}
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
              onPress={() => router.push("/")}
              disabled={submitting}
            />
          </View>

          <Text variant="subtle" color="textSubtle" style={styles.footnote}>
            {locale === "ko"
              ? "ECR-S는 자기 이해용 스크리닝 도구입니다. 패턴 관찰일 뿐, 단정이나 권고가 아니에요."
              : "ECR-S is a self-understanding screener. Observed patterns only, not verdicts or advice."}
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
  dimRow: { flexDirection: "row", justifyContent: "space-between" },
  actions: { gap: spacing.sm },
  footnote: { textAlign: "center", marginTop: spacing.sm },
});
