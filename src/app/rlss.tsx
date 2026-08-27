// Riverside Life Satisfaction Scale (RLSS) — Margolis, Schwitzgebel, Ozer &
// Lyubomirsky (2019). 6 items, 1-7 Likert. Free to use. Measures overall life
// satisfaction DIRECTLY (a separate construct from the constellation's epistemic
// brightness), per the 2026-06-28 self-understanding research. Result is saved as
// a note record (no AI call) so it surfaces in /persona alongside the other
// validated instruments. Mirrors big-five.tsx (shell-agnostic survey + canon /
// legacy wrappers) and reuses the same quant components.

import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, BackHandler } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, PremiumToast } from "@/components/premium";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import {
  RLSS_ITEMS,
  RLSS_BAND_LABEL,
  rlssBand,
  scoreRlss,
  type RlssResponses,
} from "@/lib/persona/rlss";
import { QuantIntroModal } from "@/components/quant/QuantIntroModal";
import { LikertChoiceGroup } from "@/components/quant/LikertChoiceGroup";
import { QuantPager } from "@/components/quant/QuantPager";
import { QuantSaveCelebration } from "@/components/quant/QuantSaveCelebration";
import { consumeFirstStarChatNudge } from "@/lib/onboarding/state";

// 1-7 anchors. Only the two poles + the midpoint are labelled in the legend; the
// middle values stay numeric so the 7-point granularity reads cleanly.
const SCALE: { value: number; en: string; ko: string }[] = [
  { value: 1, en: "Strongly disagree", ko: "전혀 그렇지 않다" },
  { value: 2, en: "Disagree", ko: "그렇지 않다" },
  { value: 3, en: "Slightly disagree", ko: "조금 그렇지 않다" },
  { value: 4, en: "Neither", ko: "보통" },
  { value: 5, en: "Slightly agree", ko: "조금 그렇다" },
  { value: 6, en: "Agree", ko: "그렇다" },
  { value: 7, en: "Strongly agree", ko: "매우 그렇다" },
];

type Toast = { message: string; tone: "danger" | "info" | "success" };

// The RLSS body, shell-agnostic so the SAME survey mounts in both tracks: canon
// wraps it in DeepSpaceScreen, legacy in PremiumAppShell. onComplete fires after
// the save celebration (caller decides where to go); onCancel backs out of intro.
function RlssSurvey({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const { t, i18n } = useTranslation("rlss");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<RlssResponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const result = useMemo(() => scoreRlss(responses), [responses]);


  // Android hardware back, guarded -- the five sibling surveys (values / strengths /
  // big-five / motivation / attachment) all do this and these two were missed. A back press
  // mid-survey used to close the screen with no confirmation and lose every answer. IPIP-NEO
  // is 120 items; that is about fifteen minutes of someone's self-report, gone to one tap.
  //
  // ANDROID_QA_GUIDELINES: the subscription MUST be removed on unmount, or the handler leaks
  // and keeps swallowing back presses on later screens.
  useEffect(() => {
    if (!started || Object.keys(responses).length === 0 || saved) return;
    const onBackPress = () => {
      setExitConfirmOpen(true);
      return true;
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
        <PremiumLoadingState message={t("loading")} />
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
      const band = rlssBand(result.mean);
      const bandLabel = RLSS_BAND_LABEL[locale][band];
      const summary =
        locale === "ko"
          ? `삶의 만족도: ${result.mean.toFixed(1)}/7 · ${bandLabel}`
          : `Life satisfaction: ${result.mean.toFixed(1)}/7 · ${bandLabel}`;
      const conclusion =
        locale === "ko"
          ? "지금 이 순간의 자기보고예요. 시간이 지나며 달라질 수 있어요."
          : "A self-report for this moment. It can shift over time.";
      await createRecord({
        userId,
        locale,
        kind: "note",
        body: JSON.stringify({ rlss_responses: responses, mean: result.mean, total: result.total }),
        topic: locale === "ko" ? "삶의 만족도 (RLSS)" : "Life Satisfaction (RLSS)",
        summary,
        conclusion,
        tags: ["rlss", "life_satisfaction", "assessment"],
        withFollowup: false,
      });
      setSaved(true);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[rlss] save failed", (e as Error).message);
      setToast({
        tone: "danger",
        message: t("saveError"),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {!started ? (
        <QuantIntroModal
          toolKey="rlss"
          title={t("title")}
          itemCount={RLSS_ITEMS.length}
          perPage={RLSS_ITEMS.length}
          estimatedMinutes={2}
          description={t("introDescription")}
          citation="Margolis, Schwitzgebel, Ozer & Lyubomirsky (2019) · free to use"
          locale={locale}
          onStart={() => setStarted(true)}
          onCancel={onCancel}
        />
      ) : null}

      {started ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <Text variant="caption" color="brand">
              {t("counter")}
            </Text>
            <Text variant="body" color="textMuted">
              {t("headerPrompt")}
            </Text>
          </View>

          <QuantPager
            totalItems={RLSS_ITEMS.length}
            perPage={RLSS_ITEMS.length}
            answered={result.answered}
            complete={result.complete}
            onSubmit={handleSubmit}
            submitDisabled={!result.complete || submitting}
            submitLoading={submitting}
            locale={locale}
            renderItem={(idx) => {
              const item = RLSS_ITEMS[idx];
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
                      {locale === "ko" ? SCALE[6].ko : SCALE[6].en}
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
          message={t("saved")}
          onDone={() => {
            // med#7: first star ever -> one SecondB chat (activation). This
            // nudge lived only on /attachment; now every instrument takes it.
            if (consumeFirstStarChatNudge()) {
              router.replace({ pathname: "/secondb", params: { fromNode: t("title") } });
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
        accessibilityLabel={t("exitConfirmA11y")}
      >
        <Text variant="heading">{t("exitTitle")}</Text>
        <Text variant="body" color="textMuted" style={{ marginVertical: spacing.sm, lineHeight: 21 }}>
          {t("exitBody")}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={t("exitKeepGoing")}
            variant="secondary"
            onPress={() => setExitConfirmOpen(false)}
            style={{ flex: 1 }}
          />
          <Button
            label={t("exitLeave")}
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
    // ⚠ **흔린 그림자 대신 하드에지 베벨** (PIXEL-CLAY 규칙 3).
    //   원래 `shadowRadius: 10` 이었다 — 픽셀아트에서 깊이는 흐림이 아니라
    //   **4방향 베벨과 쌓임 순서**로 낸다. `pixelShadowStyle` 은 blur 0 이다.
    ...pixelShadowStyle(cosmic.signalMint),
  },
  scaleLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
});

// Legacy rollback skin: the survey directly, in the premium shell.
function RlssLegacy() {
  return (
    <PremiumAppShell>
      <RlssSurvey onComplete={() => router.replace("/persona")} onCancel={() => router.back()} />
    </PremiumAppShell>
  );
}

// Canon: the same survey inside the deep-space dock. On completion we return to
// the persona screen where the saved RLSS record surfaces with the other tools.
function RlssDeepSpace() {
  return (
    <DeepSpaceScreen active="lens">
      <RlssSurvey onComplete={() => router.replace("/persona")} onCancel={() => router.back()} />
    </DeepSpaceScreen>
  );
}

export default function Rlss() {
  if (isDeepSpaceUI()) return <RlssDeepSpace />;
  return <RlssLegacy />;
}
