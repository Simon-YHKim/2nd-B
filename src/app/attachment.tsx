// Attachment style (ECR-S, Wei et al. 2007). Two surfaces share this route:
//   • the RESULT lens (AttachmentLensM3) — a 회피×불안 2-axis map + propose→ratify
//     estimate, the pixel target cloned from the reference AttachmentScreen; and
//   • the ECR SURVEY (AttachmentSurvey) — 12 items, two subscales, 4 styles —
//     which is the sole writer of the ecr-tagged record the lens reads.
// Canon (deep-space) shows the lens first and launches the survey from its
// empty-state / retake CTA (mirrors BigFive). Legacy renders the survey directly
// in the premium shell.

import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, BackHandler } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumToast, PremiumModal } from "@/components/premium";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { AttachmentLensM3, type AttachmentLensResult } from "@/components/deep-space/DeepSpaceViews";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadLatestAttachment } from "@/lib/persona/build";
import {
  ECR_ITEMS,
  STYLE_DESCRIPTION,
  STYLE_LABEL,
  scoreEcr,
  type EcrResponses,
} from "@/lib/persona/attachment";
import { QuantIntroModal } from "@/components/quant/QuantIntroModal";
import { LikertChoiceGroup } from "@/components/quant/LikertChoiceGroup";
import { QuantPager } from "@/components/quant/QuantPager";
import { QuantSaveCelebration } from "@/components/quant/QuantSaveCelebration";
import { isFirstStarChatNudged, markFirstStarChatNudged } from "@/lib/onboarding/state";

const SCALE: { value: number; en: string; ko: string }[] = [
  { value: 1, en: "Strongly disagree", ko: "전혀 아니다" },
  { value: 2, en: "Disagree", ko: "아니다" },
  { value: 3, en: "Slightly disagree", ko: "조금 아니다" },
  { value: 4, en: "Neutral", ko: "보통" },
  { value: 5, en: "Slightly agree", ko: "조금 그렇다" },
  { value: 6, en: "Agree", ko: "그렇다" },
  { value: 7, en: "Strongly agree", ko: "매우 그렇다" },
];

type Toast = { message: string; tone: "danger" | "info" | "success" };

// The ECR-S questionnaire body, shell-agnostic so the SAME survey mounts in both
// tracks. It is the ONLY writer of the ["attachment","ecr"] record that
// loadLatestAttachment reads. onComplete fires after the save celebration so the
// caller decides where to go next; onCancel backs out of the intro / exit modal.
function AttachmentSurvey({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<EcrResponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  const result = useMemo(() => scoreEcr(responses), [responses]);

  // Android hardware back handler: intercept navigation back requests while the
  // survey is in progress to prevent accidental loss of responses.
  useEffect(() => {
    if (!started || Object.keys(responses).length === 0 || saved) return;

    const onBackPress = () => {
      setExitConfirmOpen(true);
      return true; // Consume the event, preventing immediate navigation back
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [started, responses, saved]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(h);
  }, [toast]);

  if (loading) {
    return (
      <View style={styles.center}>
        <PremiumLoadingState message={locale === "ko" ? "검사를 불러오는 중이에요…" : "Loading assessment…"} />
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
      setSaved(true);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[attachment] save failed", (e as Error).message);
      setToast({
        tone: "danger",
        message:
          locale === "ko"
            ? "검사 결과를 저장하지 못했어요. 답변은 그대로 남아 있어요."
            : "We couldn't save your results. Your answers are still here.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {!started ? (
        <QuantIntroModal
          toolKey="ecr"
          title={locale === "ko" ? "애착 스타일 (ECR-S)" : "Attachment style (ECR-S)"}
          itemCount={ECR_ITEMS.length}
          estimatedMinutes={3}
          description={
            locale === "ko"
              ? "가까운 관계에서의 패턴을 불안과 회피 두 축으로 함께 살펴보고, 어느 스타일에 가까운지 같이 짚어볼게요. 답할 때는 한 명의 특정 관계가 아니라 ‘가까운 관계 전반’ 을 떠올려 주세요. 한 페이지 5문항씩, 3페이지로 나눠집니다."
              : "We'll look together at your pattern in close relationships across two axes: anxiety and avoidance. Then we'll see which of four styles you lean toward. Think of close relationships in general, not one specific person. Split across 3 pages, 5 items each (last page has 2)."
          }
          citation={
            locale === "ko"
              ? "Wei, Russell, Mallinckrodt, & Vogel (2007) · 검증된 단축형"
              : "Wei, Russell, Mallinckrodt, & Vogel (2007) · validated short form"
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
                  <LikertChoiceGroup
                    choices={SCALE.map((s) => ({ value: s.value, label: s[locale] }))}
                    locale={locale}
                    onSelect={(next) => setResponse(item.id, next)}
                    question={`${item.id}. ${locale === "ko" ? item.ko : item.en}`}
                    value={value}
                  />
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

      {saved ? (
        <QuantSaveCelebration
          message={locale === "ko" ? "저장됐어요 · 별 하나가 켜졌어요" : "Saved · one star is lit"}
          onDone={() => {
            // First star lit ever -> steer into one SecondB chat (activation
            // target). After the first nudge, every later save returns via
            // onComplete (canon reloads the lens; legacy routes to /persona).
            if (!isFirstStarChatNudged()) {
              markFirstStarChatNudged();
              router.replace({
                pathname: "/secondb",
                params: { fromNode: locale === "ko" ? "관계의 나" : "my relational self" },
              });
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
        accessibilityLabel={locale === "ko" ? "검사 종료 안내" : "Exit survey notice"}
      >
        <Text variant="heading">
          {locale === "ko" ? "검사를 종료할까요?" : "Exit survey?"}
        </Text>
        <Text variant="body" color="textMuted" style={{ marginVertical: spacing.sm, lineHeight: 21 }}>
          {locale === "ko"
            ? "정말 애착 스타일 검사를 종료하시겠습니까? 작성 중이던 답변이 저장되지 않고 사라집니다."
            : "Are you sure you want to exit? Your progress will not be saved."}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={locale === "ko" ? "취소" : "Cancel"}
            variant="secondary"
            onPress={() => setExitConfirmOpen(false)}
            style={{ flex: 1 }}
            accessibilityHint={locale === "ko" ? "검사를 계속 진행합니다." : "Continue the survey."}
          />
          <Button
            label={locale === "ko" ? "종료하기" : "Exit"}
            variant="primary"
            onPress={() => {
              setExitConfirmOpen(false);
              onCancel();
            }}
            style={{ flex: 1 }}
            accessibilityHint={locale === "ko" ? "검사를 종료하고 이전 화면으로 돌아갑니다." : "Exit the survey and return."}
          />
        </View>
      </PremiumModal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderStartColor: cosmic.dreamPink,
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
    shadowColor: cosmic.dreamPink,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    ...androidElevationStyle(androidElevation.card),
  },
  scaleLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
});

// Canon (deep-space): the ECR RESULT lens over the shared sky. Loads the latest
// ecr-tagged record; empty -> dark-star state whose CTA launches the survey;
// filled -> the 회피×불안 map + propose→ratify estimate. `taking` flips to the
// survey inside the same dock (the BigFive pattern).
function AttachmentDeepSpace() {
  const { t } = useTranslation("home");
  const { userId, loading } = useAuth();
  const [result, setResult] = useState<AttachmentLensResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [taking, setTaking] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setResult(null);
      return;
    }
    let cancelled = false;
    loadLatestAttachment(getSupabaseClient(), userId)
      .then((r) => {
        if (cancelled) return;
        setResult(r ? { avoidance: r.avoidance, anxiety: r.anxiety, style: r.style } : null);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading, reloadKey]);

  if (taking) {
    return (
      <DeepSpaceScreen active="lens">
        <AttachmentSurvey
          onComplete={() => {
            setTaking(false);
            setReloadKey((k) => k + 1);
          }}
          onCancel={() => setTaking(false)}
        />
      </DeepSpaceScreen>
    );
  }

  return (
    <DeepSpaceScreen
      active="lens"
      variant="windowed"
      header="none"
      title={t("ds.attachment.headline")}
      onBack={() => router.back()}
    >
      <AttachmentLensM3
        result={result}
        onStart={() => setTaking(true)}
        onInterview={() => router.push("/interview")}
        onBigFive={() => router.push("/big-five")}
      />
    </DeepSpaceScreen>
  );
}

// Legacy rollback skin: the survey directly, in the premium shell.
function AttachmentLegacy() {
  return (
    <PremiumAppShell>
      <AttachmentSurvey onComplete={() => router.replace("/persona")} onCancel={() => router.back()} />
    </PremiumAppShell>
  );
}

export default function Attachment() {
  if (isDeepSpaceUI()) return <AttachmentDeepSpace />;
  return <AttachmentLegacy />;
}
