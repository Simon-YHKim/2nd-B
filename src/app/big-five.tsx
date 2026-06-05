// Big Five (BFI-44) personality questionnaire — John, Donahue, & Kentle
// (1991). 44 items, 5-point Likert. Public domain. Replaces the older TIPI
// 10-item screener (Sprint 5) for better per-trait precision. Result is
// saved as a record so it surfaces in /persona and feeds Inference Engine.

import { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import {
  BFI_ITEMS,
  TRAIT_LABEL_EN,
  TRAIT_LABEL_KO,
  scoreBfi,
  type BfiResponses,
} from "@/lib/persona/bfi";
import { QuantIntroModal } from "@/components/quant/QuantIntroModal";
import { QuantPager } from "@/components/quant/QuantPager";
import { QuantSaveCelebration } from "@/components/quant/QuantSaveCelebration";

const SCALE: { value: number; en: string; ko: string }[] = [
  { value: 1, en: "Strongly disagree", ko: "전혀 아니다" },
  { value: 2, en: "Disagree", ko: "아니다" },
  { value: 3, en: "Neither", ko: "보통" },
  { value: 4, en: "Agree", ko: "그렇다" },
  { value: 5, en: "Strongly agree", ko: "매우 그렇다" },
];

export default function BigFive() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<BfiResponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [saved, setSaved] = useState(false);

  const result = useMemo(() => scoreBfi(responses), [responses]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "검사를 불러오는 중이에요…" : "Loading assessment…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) {
    return <Redirect href="/sign-in" />;
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
        .map((s) => `${labels[s.trait]}: ${s.score.toFixed(1)}/5`)
        .join("  ·  ");
      const top = [...result.scores].sort((a, b) => b.score - a.score)[0];
      const conclusion =
        locale === "ko"
          ? `오늘 가장 높은 점수: ${labels[top.trait]} (${top.score.toFixed(1)}/5)`
          : `Highest score today: ${labels[top.trait]} (${top.score.toFixed(1)}/5)`;
      await createRecord({
        userId,
        locale,
        kind: "note",
        body: JSON.stringify({ bfi_responses: responses, scores: result.byTrait }),
        topic: locale === "ko" ? "Big Five (BFI-44) 평가" : "Big Five (BFI-44) assessment",
        summary,
        conclusion,
        tags: ["big_five", "bfi", "assessment"],
        withFollowup: false,
      });
      setSaved(true);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[big-five] save failed", (e as Error).message);
      Alert.alert(
        locale === "ko" ? "저장하지 못했어요" : "Couldn't save",
        locale === "ko"
          ? "결과를 저장하는 중 문제가 생겼어요. 답변은 그대로 남아 있으니 다시 시도해 주세요."
          : "Something went wrong while saving your result. Your answers are still here, so please try again.",
        [
          { text: locale === "ko" ? "닫기" : "Dismiss", style: "cancel" },
          { text: locale === "ko" ? "다시 시도" : "Retry", onPress: () => { void handleSubmit(); } },
        ],
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PremiumAppShell>
      {!started ? (
        <QuantIntroModal
          toolKey="bfi"
          title={locale === "ko" ? "Big Five (BFI-44)" : "Big Five (BFI-44)"}
          itemCount={BFI_ITEMS.length}
          estimatedMinutes={8}
          description={
            locale === "ko"
              ? "성격의 5가지 큰 축을 재는 검증된 자기보고 도구입니다. \"이런 사람이다\" 라는 문장에 1(전혀 아니다) ~ 5(매우 그렇다)로 답해 주세요. 정답은 없어요. 한 페이지에 5문항씩, 9페이지로 나눠집니다."
              : "A validated self-report measure of the five main personality dimensions. Rate each \"I see myself as someone who…\" statement from 1 (strongly disagree) to 5 (strongly agree). No right answers. Split across 9 pages, 5 items each."
          }
          citation={
            locale === "ko"
              ? "John, Donahue, & Kentle (1991) · public domain"
              : "John, Donahue, & Kentle (1991) · public domain"
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
              {locale === "ko" ? "Big Five · BFI-44" : "Big Five · BFI-44"}
            </Text>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "다음 문장이 당신과 얼마나 맞는지 골라주세요. 「나는 …」"
                : "How well does each statement describe you? \"I see myself as someone who…\""}
            </Text>
          </View>

          <QuantPager
            totalItems={BFI_ITEMS.length}
            perPage={5}
            answered={result.answered}
            complete={result.complete}
            onSubmit={handleSubmit}
            submitDisabled={!result.complete || submitting}
            submitLoading={submitting}
            locale={locale}
            renderItem={(idx) => {
              const item = BFI_ITEMS[idx];
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
                    {SCALE.map((s) => {
                      const active = value === s.value;
                      return (
                        <Pressable
                          key={s.value}
                          onPress={() => setResponse(item.id, s.value)}
                          style={[styles.scaleBtn, active && styles.scaleBtnActive]}
                          hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                        >
                          <Text variant="caption" color={active ? "background" : "textMuted"}>
                            {s.value}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.scaleLegend}>
                    <Text variant="subtle" color="textSubtle">
                      {locale === "ko" ? SCALE[0].ko : SCALE[0].en}
                    </Text>
                    <Text variant="subtle" color="textSubtle">
                      {locale === "ko" ? SCALE[4].ko : SCALE[4].en}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        </KeyboardAvoidingView>
      ) : null}

      {saved ? (
        <QuantSaveCelebration
          message={locale === "ko" ? "저장됐어요 · 페르소나에서 다시 만나요" : "Saved · see it on your Persona"}
          onDone={() => router.replace("/persona")}
        />
      ) : null}
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderLeftColor: cosmic.signalMint,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  itemCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
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
