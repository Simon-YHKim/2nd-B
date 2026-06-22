// Big Five (BFI-44) personality questionnaire — John, Donahue, & Kentle
// (1991). 44 items, 5-point Likert. Public domain. Replaces the older TIPI
// 10-item screener (Sprint 5) for better per-trait precision. Result is
// saved as a record so it surfaces in /persona and feeds Inference Engine.

import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { LensView, type LensTraits } from "@/components/deep-space/DeepSpaceViews";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { loadLatestBfi } from "@/lib/persona/build";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  BFI_ITEMS,
  TRAIT_LABEL_EN,
  TRAIT_LABEL_KO,
  bfiMeanToPercent,
  scoreBfi,
  type BfiResponses,
} from "@/lib/persona/bfi";
import { QuantIntroModal } from "@/components/quant/QuantIntroModal";
import { LikertChoiceGroup } from "@/components/quant/LikertChoiceGroup";
import { QuantPager } from "@/components/quant/QuantPager";
import { QuantSaveCelebration } from "@/components/quant/QuantSaveCelebration";

const SCALE: { value: number; en: string; ko: string }[] = [
  { value: 1, en: "Strongly disagree", ko: "전혀 아니다" },
  { value: 2, en: "Disagree", ko: "아니다" },
  { value: 3, en: "Neither", ko: "보통" },
  { value: 4, en: "Agree", ko: "그렇다" },
  { value: 5, en: "Strongly agree", ko: "매우 그렇다" },
];

type Toast = { message: string; tone: "danger" | "info" | "success" };

function BigFiveLegacy() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<BfiResponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const result = useMemo(() => scoreBfi(responses), [responses]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(h);
  }, [toast]);

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
      setToast({
        tone: "danger",
        message:
          locale === "ko"
            ? "저장하지 못했어요. 답변은 그대로 남아 있으니 다시 시도해 주세요."
            : "Couldn't save. Your answers are still here; please try again.",
      });
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
                  <LikertChoiceGroup
                    choices={SCALE.map((s) => ({ value: s.value, label: s[locale] }))}
                    locale={locale}
                    onSelect={(next) => setResponse(item.id, next)}
                    question={`${item.id}. ${locale === "ko" ? item.ko : item.en}`}
                    value={value}
                  />
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

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
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
    borderStartColor: cosmic.signalMint,
    borderWidth: 1,
    borderStartWidth: 3,
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
    ...androidElevationStyle(androidElevation.card),
  },
  scaleLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
});

function BigFiveDeepSpace() {
  const { userId, loading } = useAuth();
  const [traits, setTraits] = useState<LensTraits | null>(null);
  const [hasError, setHasError] = useState(false);
  // Bumping reloadKey re-runs the BFI load (retry path from the error state).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setTraits(null);
      setHasError(false);
      return;
    }
    let cancelled = false;
    setHasError(false);
    loadLatestBfi(getSupabaseClient(), userId)
      .then((r) => {
        if (cancelled) return;
        // BFI trait means are 1-5 Likert; bfiMeanToPercent maps to 0-100 using
        // the same (v-1)/4 anchor buildPersona uses (1->0%, 3->50%, 5->100%).
        setTraits(
          r
            ? {
                openness: bfiMeanToPercent(r.openness),
                conscientiousness: bfiMeanToPercent(r.conscientiousness),
                extraversion: bfiMeanToPercent(r.extraversion),
                agreeableness: bfiMeanToPercent(r.agreeableness),
                neuroticism: bfiMeanToPercent(r.neuroticism),
              }
            : null,
        );
      })
      .catch(() => {
        // Distinguish a fetch failure (offline / query error) from "no result
        // yet": the former drives LensView's error+retry state, never dummy data.
        if (!cancelled) {
          setTraits(null);
          setHasError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading, reloadKey]);

  return (
    <DeepSpaceScreen active="lens">
      <LensView
        traits={traits}
        hasError={hasError}
        onStart={() => router.push("/interview")}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    </DeepSpaceScreen>
  );
}

export default function BigFive() {
  if (isDeepSpaceUI()) return <BigFiveDeepSpace />;
  return <BigFiveLegacy />;
}
