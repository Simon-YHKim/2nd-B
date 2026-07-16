// 동기 (rev2 P3b): motivation self-report (SDT) + populated read.
//
// Flow: on mount, load the latest motivation self-report. If there is NONE, the
// screen offers a short motivation survey (9 items, 6-point Likert) whose result
// is saved as a ["motivation","assessment"] record. If there IS a result, the
// shared AxisCheckScreen renders the populated INTRINSIC↔EXTRINSIC balance bar +
// the 세 가지 욕구 (SDT-need) spectrum.
//
// HONESTY: this is a self-report ESTIMATE of what moves the user, anchored to
// Self-Determination Theory — not a medical assessment. Confidence is shown and
// capped well under 100%; the populated layout only ever shows the user's real
// answers/percentages (motivation-survey.ts), never the prototype's example numbers.
import { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, BackHandler } from "react-native";
import { useTranslation } from "react-i18next";

import { MdButton } from "@/components/m3";
import { Redirect, router } from "expo-router";

import { PremiumLoadingState, PremiumToast, PremiumModal } from "@/components/premium";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { AxisCheckScreen } from "@/components/deep-space/AxisCheck";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { loadLatestMotivation, type LoadedMotivation } from "@/lib/persona/build";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  MOTIVATION_ITEMS,
  MOTIVATION_LABEL_EN,
  MOTIVATION_LABEL_KO,
  scoreMotivation,
  type MotivationResponses,
} from "@/lib/persona/motivation-survey";
import { QuantIntroModal } from "@/components/quant/QuantIntroModal";
import { LikertChoiceGroup } from "@/components/quant/LikertChoiceGroup";
import { QuantPager } from "@/components/quant/QuantPager";
import { QuantSaveCelebration } from "@/components/quant/QuantSaveCelebration";
import { consumeFirstStarChatNudge } from "@/lib/onboarding/state";

// 6-point self-report scale: 1 전혀 나 같지 않다 … 6 매우 나 같다.
const SCALE: { value: number; en: string; ko: string }[] = [
  { value: 1, en: "Not like me at all", ko: "전혀 나 같지 않다" },
  { value: 2, en: "Unlike me", ko: "나 같지 않다" },
  { value: 3, en: "Somewhat unlike me", ko: "별로 나 같지 않다" },
  { value: 4, en: "Somewhat like me", ko: "조금 나 같다" },
  { value: 5, en: "Like me", ko: "나 같다" },
  { value: 6, en: "Very much like me", ko: "매우 나 같다" },
];

type Toast = { message: string; tone: "danger" | "info" | "success" };

// The motivation self-report body, mirroring StrengthsSurvey: QuantIntroModal →
// paged Likert items → live scoring → createRecord. It is the only writer of the
// ["motivation","assessment"] record that loadLatestMotivation reads. onComplete
// fires after the save celebration so the caller reloads into the populated lens;
// onCancel backs out of the intro (caller shows the not-measured state).
function MotivationSurvey({ onComplete, onCancel, registerBackGuard }: { onComplete: () => void; onCancel: () => void; registerBackGuard?: (fn: (() => boolean) | null) => void }) {
  const { i18n } = useTranslation("home");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<MotivationResponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  const result = useMemo(() => scoreMotivation(responses), [responses]);

  // Android hardware back: while mid-survey with answers, confirm before losing.
  useEffect(() => {
    if (!started || Object.keys(responses).length === 0 || saved) return;
    const onBackPress = () => {
      setExitConfirmOpen(true);
      return true;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [started, responses, saved]);

  // med#8: the top app-bar back arrow must honor the same mid-survey exit
  // confirm as the hardware back — it used to bypass it and silently drop
  // every answer in progress.
  useEffect(() => {
    if (!registerBackGuard) return;
    registerBackGuard(() => {
      if (started && Object.keys(responses).length > 0 && !saved) {
        setExitConfirmOpen(true);
        return true;
      }
      return false;
    });
    return () => registerBackGuard(null);
  }, [registerBackGuard, started, responses, saved]);


  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(h);
  }, [toast]);

  if (loading) {
    return (
      <View style={styles.center}>
        <PremiumLoadingState message={locale === "ko" ? "불러오는 중…" : "Loading…"} />
      </View>
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
      const labels = locale === "ko" ? MOTIVATION_LABEL_KO : MOTIVATION_LABEL_EN;
      const intr = locale === "ko" ? "내적" : "Intrinsic";
      const extr = locale === "ko" ? "외적" : "Extrinsic";
      const topNeed = result.needs[0];
      // Summary is the real balance split + the top SDT need — never a hardcoded
      // example. The populated lens re-derives the same from the stored body.
      const summary =
        `${intr} ${result.intrinsicPct}%  ·  ${extr} ${result.extrinsicPct}%` +
        (topNeed ? `  ·  ${labels[topNeed.key]}: ${topNeed.score}` : "");
      await createRecord({
        userId,
        locale,
        kind: "note",
        body: JSON.stringify({
          motivation_responses: responses,
          needs: result.needs,
          intrinsicPct: result.intrinsicPct,
          extrinsicPct: result.extrinsicPct,
          confidence: result.confidence,
        }),
        topic: locale === "ko" ? "동기 자기보고" : "Motivation self-report",
        summary,
        conclusion:
          locale === "ko"
            ? "자기보고 추정 (진단 아님)."
            : "Self-report estimate (not a medical assessment).",
        tags: ["motivation", "assessment"],
        withFollowup: false,
      });
      setSaved(true);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[motivation] save failed", (e as Error).message);
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
    <>
      {!started ? (
        <QuantIntroModal
          toolKey="motivation"
          title={locale === "ko" ? "동기 자기보고" : "Motivation self-report"}
          itemCount={MOTIVATION_ITEMS.length}
          estimatedMinutes={3}
          description={
            locale === "ko"
              ? "무엇이 나를 움직이는지 스스로 답하는 짧은 자기보고예요. 각 문장이 나와 얼마나 맞는지 1(전혀 나 같지 않다) ~ 6(매우 나 같다)로 답해 주세요. 정답은 없고, 진단이 아니라 추정이에요."
              : "A short self-report of what moves you. Rate how well each statement fits you from 1 (not like me at all) to 6 (very much like me). No right answers, and it's an estimate, not a medical assessment."
          }
          citation={
            locale === "ko"
              ? "자기결정성 이론(SDT)에서 착안 · 자기보고 추정"
              : "Anchored to Self-Determination Theory (SDT) · self-report estimate"
          }
          locale={locale}
          onStart={() => setStarted(true)}
          onCancel={onCancel}
        />
      ) : null}

      {started ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <Text variant="caption" color="brand">
              {locale === "ko" ? "동기 자기보고" : "Motivation self-report"}
            </Text>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "다음 문장이 당신과 얼마나 맞는지 골라주세요."
                : "How well does each statement fit you?"}
            </Text>
          </View>

          <QuantPager
            totalItems={MOTIVATION_ITEMS.length}
            perPage={4}
            answered={result.answered}
            complete={result.complete}
            onSubmit={handleSubmit}
            submitDisabled={!result.complete || submitting}
            submitLoading={submitting}
            locale={locale}
            renderItem={(idx) => {
              const item = MOTIVATION_ITEMS[idx];
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
                    <Text variant="subtle" color="textMuted">
                      {locale === "ko" ? SCALE[0].ko : SCALE[0].en}
                    </Text>
                    <Text variant="subtle" color="textMuted">
                      {locale === "ko" ? SCALE[5].ko : SCALE[5].en}
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
          message={locale === "ko" ? "동기 자기보고를 저장했어요." : "Your motivation self-report is saved."}
          onDone={() => {
            // med#7: first star ever -> one SecondB chat (activation). This
            // nudge lived only on /attachment; now every instrument takes it.
            if (consumeFirstStarChatNudge()) {
              router.replace({ pathname: "/secondb", params: { fromNode: locale === "ko" ? "동기 자기보고" : "Motivation self-report" } });
            } else {
              onComplete();
            }
          }}
        />
      ) : null}

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}

      <PremiumModal
        visible={exitConfirmOpen}
        onClose={() => setExitConfirmOpen(false)}
        accessibilityLabel={locale === "ko" ? "종료 확인" : "Exit confirmation"}
      >
        <Text variant="heading">{locale === "ko" ? "그만두시겠어요?" : "Leave the survey?"}</Text>
        <Text variant="body" color="textMuted" style={{ marginVertical: spacing.sm, lineHeight: 21 }}>
          {locale === "ko"
            ? "정말 종료하시겠습니까? 작성 중이던 답변이 저장되지 않고 사라집니다."
            : "Are you sure you want to exit? Your progress will not be saved."}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={locale === "ko" ? "계속하기" : "Keep going"}
            variant="secondary"
            onPress={() => setExitConfirmOpen(false)}
            style={{ flex: 1 }}
          />
          <Button
            label={locale === "ko" ? "종료" : "Exit"}
            variant="primary"
            onPress={() => {
              setExitConfirmOpen(false);
              onCancel();
            }}
            style={{ flex: 1 }}
          />
        </View>
      </PremiumModal>
    </>
  );
}

export default function MotivationCheck() {
  const { t } = useTranslation("home");
  const { userId, loading } = useAuth();
  // undefined = still loading; null = no stored result; object = has result.
  const [result, setResult] = useState<LoadedMotivation | null | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  // med#9: a read FAILURE must not masquerade as "no result yet" — that
  // re-offered the survey to people who already took it (the exact antipattern
  // values/strengths fixed).
  const [hasError, setHasError] = useState(false);
  // When there is no result and the user backs out of the survey intro, fall
  // back to the honest not-measured AxisCheck state instead of the survey.
  const [dismissed, setDismissed] = useState(false);
  // med#8: filled by the survey so the app-bar back can route through its confirm.
  const surveyBackGuard = useRef<(() => boolean) | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setResult(null);
      return;
    }
    let cancelled = false;
    loadLatestMotivation(getSupabaseClient(), userId)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        // med#9: surface the failure (error + retry) instead of pretending the
        // user has no result — never fabricate either data or its absence.
        if (!cancelled) {
          setHasError(true);
          setResult(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading, reloadKey]);

  // Loading the stored result (or auth).
  if (loading || result === undefined) {
    return (
      <DeepSpaceScreen
        active="lens"
        header="none"
        variant="windowed"
        title={t("ds.axisCheck.motivation.headline")}
        onBack={() => router.back()}
      >
        <View style={styles.center}>
          <PremiumLoadingState message={t("ds.axisCheck.motivation.headline")} />
        </View>
      </DeepSpaceScreen>
    );
  }

  // Read failed. Say so, and offer a retry — never re-offer a survey they may
  // have already taken (mirrors values/strengths).
  if (hasError) {
    return (
      <DeepSpaceScreen
        active="lens"
        header="none"
        variant="windowed"
        title={t("ds.axisCheck.motivation.headline")}
        onBack={() => router.back()}
      >
        <View style={styles.center}>
          <Text variant="body" accessibilityRole="alert">{t("ds.axisCheck.loadError")}</Text>
          <MdButton
            variant="tonal"
            label={t("ds.axisCheck.retry")}
            onPress={() => {
              setHasError(false);
              setResult(undefined);
              setReloadKey((k) => k + 1);
            }}
          />
        </View>
      </DeepSpaceScreen>
    );
  }

  // Has a real self-report → populated 내적↔외적 balance + 세 가지 욕구 spectrum.
  if (result) {
    return <AxisCheckScreen axis="motivation" motivationResult={result} />;
  }

  // No stored result, user backed out of the survey → honest not-measured state.
  if (dismissed) {
    return <AxisCheckScreen axis="motivation" />;
  }

  // No stored result → offer the short motivation self-report.
  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={t("ds.axisCheck.motivation.headline")}
      onBack={() => {
        if (surveyBackGuard.current?.()) return;
        router.back();
      }}
    >
      <MotivationSurvey
        onComplete={() => setReloadKey((k) => k + 1)}
        onCancel={() => setDismissed(true)}
        registerBackGuard={(fn) => {
          surveyBackGuard.current = fn;
        }}
      />
    </DeepSpaceScreen>
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
