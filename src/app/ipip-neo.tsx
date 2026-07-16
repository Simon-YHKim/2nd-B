// IPIP-NEO-120 personality questionnaire — Johnson (2014). 120 items, 5-point
// Likert (Very inaccurate -> Very accurate). Public domain (IPIP). Measures the
// same 5 Big Five DOMAINS as BFI-44 PLUS 30 facets; coexists with /big-five (the
// quick 44-item screener). Result is saved as a record tagged "ipip_neo" so the
// canon domain lens (and Phase 3's facet lens) can read it. EN items are the
// validated channel; the KO translation is a reference, NOT validated (disclosed
// in the intro).

import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, BackHandler } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, PremiumToast } from "@/components/premium";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { LensView } from "@/components/deep-space/DeepSpaceViews";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { loadLatestIpip } from "@/lib/persona/build";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TRAIT_LABEL_EN, TRAIT_LABEL_KO } from "@/lib/persona/bfi";
import {
  IPIP_NEO_120_ITEMS,
  scoreIpipNeo,
  type IpipResponses,
} from "@/lib/persona/ipip-neo";
import { FacetBreakdown } from "@/components/persona/FacetBreakdown";
import { QuantIntroModal } from "@/components/quant/QuantIntroModal";
import { LikertChoiceGroup } from "@/components/quant/LikertChoiceGroup";
import { QuantPager } from "@/components/quant/QuantPager";
import { QuantSaveCelebration } from "@/components/quant/QuantSaveCelebration";
import { consumeFirstStarChatNudge } from "@/lib/onboarding/state";

// IPIP accuracy anchors (Very inaccurate -> Very accurate), not BFI agreement.
const SCALE: { value: number; en: string; ko: string }[] = [
  { value: 1, en: "Very inaccurate", ko: "전혀 아니다" },
  { value: 2, en: "Moderately inaccurate", ko: "대체로 아니다" },
  { value: 3, en: "Neither", ko: "보통" },
  { value: 4, en: "Moderately accurate", ko: "대체로 그렇다" },
  { value: 5, en: "Very accurate", ko: "매우 그렇다" },
];

type Toast = { message: string; tone: "danger" | "info" | "success" };

// Shell-agnostic survey body (canon wraps in DeepSpaceScreen, legacy in
// PremiumAppShell). The only writer of the "ipip_neo"-tagged record. Stores the
// 5 domain means + 30 facet means so the lenses can read either level.
function IpipNeoSurvey({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const { t, i18n } = useTranslation("ipip-neo");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [responses, setResponses] = useState<IpipResponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const result = useMemo(() => scoreIpipNeo(responses), [responses]);


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
      const labels = locale === "ko" ? TRAIT_LABEL_KO : TRAIT_LABEL_EN;
      const order = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"] as const;
      const summary = order
        .map((d) => `${labels[d]}: ${result.domains[d].toFixed(1)}/5`)
        .join("  ·  ");
      const top = [...order].sort((a, b) => result.domains[b] - result.domains[a])[0];
      const conclusion =
        locale === "ko"
          ? `오늘 가장 높은 축: ${labels[top]} (${result.domains[top].toFixed(1)}/5) · 30개 세부 특질도 함께 저장됐어요`
          : `Highest domain today: ${labels[top]} (${result.domains[top].toFixed(1)}/5) · all 30 facets saved too`;
      await createRecord({
        userId,
        locale,
        kind: "note",
        body: JSON.stringify({ ipip_responses: responses, domains: result.domains, facets: result.facets }),
        topic: locale === "ko" ? "성격 정밀검사 (IPIP-NEO-120)" : "Personality, in depth (IPIP-NEO-120)",
        summary,
        conclusion,
        tags: ["ipip_neo", "ipip-neo-120", "assessment", "big_five"],
        withFollowup: false,
      });
      setSaved(true);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[ipip-neo] save failed", (e as Error).message);
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
          toolKey="ipip"
          title={t("title")}
          itemCount={IPIP_NEO_120_ITEMS.length}
          estimatedMinutes={15}
          description={
            locale === "ko"
              ? "성격의 5가지 큰 축과 그 아래 30개 세부 특질(facet)까지 재는 검증된 공개 도구예요. 각 문장이 당신을 얼마나 정확히 묘사하는지 1(전혀 아니다) ~ 5(매우 그렇다)로 답해 주세요. 120문항이라 조금 길어요. ※ 한국어 문항은 아직 검증되지 않은 참고용 번역이에요(영문이 검증된 원본)."
              : "A validated public-domain measure of the five domains AND their 30 underlying facets. Rate how accurately each statement describes you from 1 (very inaccurate) to 5 (very accurate). 120 items, so it takes a bit longer."
          }
          citation={
            locale === "ko"
              ? "Johnson (2014) · IPIP · public domain"
              : "Johnson (2014) · IPIP · public domain"
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
              {t("counter")}
            </Text>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "이 문장이 당신을 얼마나 정확히 묘사하는지 골라주세요."
                : "How accurately does each statement describe you?"}
            </Text>
          </View>

          <QuantPager
            totalItems={IPIP_NEO_120_ITEMS.length}
            perPage={8}
            answered={result.answered}
            complete={result.complete}
            onSubmit={handleSubmit}
            submitDisabled={!result.complete || submitting}
            submitLoading={submitting}
            locale={locale}
            renderItem={(idx) => {
              const item = IPIP_NEO_120_ITEMS[idx];
              const value = responses[item.id];
              return (
                <View style={styles.itemCard}>
                  <Text variant="body" style={{ marginBottom: spacing.xs }}>
                    {item.id}. {locale === "ko" ? item.ko : item.en}
                  </Text>
                  <LikertChoiceGroup
                    choices={SCALE.map((s) => ({ value: s.value, label: s[locale] }))}
                    locale={locale}
                    onSelect={(next) => setResponse(item.id, next)}
                    question={`${item.id}. ${locale === "ko" ? item.ko : item.en}`}
                    value={value}
                  />
                  <View style={styles.scaleLegend}>
                    {/* textMuted, not textSubtle: Likert endpoint anchors must stay
                        readable or a low-vision taker answers all 120 items in the
                        wrong direction (#867 fixed the four sibling instruments;
                        this screen was missed). */}
                    <Text variant="subtle" color="textMuted">{locale === "ko" ? SCALE[0].ko : SCALE[0].en}</Text>
                    <Text variant="subtle" color="textMuted">{locale === "ko" ? SCALE[4].ko : SCALE[4].en}</Text>
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

function IpipNeoLegacy() {
  return (
    <PremiumAppShell>
      <IpipNeoSurvey onComplete={() => router.replace("/persona")} onCancel={() => router.back()} />
    </PremiumAppShell>
  );
}

function IpipNeoDeepSpace() {
  const { i18n } = useTranslation();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { userId, loading } = useAuth();
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadLatestIpip>>>(null);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [taking, setTaking] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setResult(null);
      setHasError(false);
      return;
    }
    let cancelled = false;
    setHasError(false);
    loadLatestIpip(getSupabaseClient(), userId)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled) {
          setResult(null);
          setHasError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading, reloadKey]);

  if (taking) {
    return (
      <DeepSpaceScreen active="lens">
        <IpipNeoSurvey
          onComplete={() => {
            setTaking(false);
            setReloadKey((k) => k + 1);
          }}
          onCancel={() => setTaking(false)}
        />
      </DeepSpaceScreen>
    );
  }

  // Data present -> the facet lens: the 5 domains expanded into their 30 facets
  // (the precision payoff over BFI's domain-only bars).
  if (result) {
    const domains = {
      openness: result.openness,
      conscientiousness: result.conscientiousness,
      extraversion: result.extraversion,
      agreeableness: result.agreeableness,
      neuroticism: result.neuroticism,
    };
    return (
      <DeepSpaceScreen active="lens">
        <FacetBreakdown facets={result.facets} domains={domains} locale={locale} onRetake={() => setTaking(true)} />
      </DeepSpaceScreen>
    );
  }

  // No result yet / error -> the shared empty / error / take-survey flow.
  return (
    <DeepSpaceScreen active="lens">
      <LensView
        traits={null}
        hasError={hasError}
        onStart={() => setTaking(true)}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    </DeepSpaceScreen>
  );
}

export default function IpipNeo() {
  if (isDeepSpaceUI()) return <IpipNeoDeepSpace />;
  return <IpipNeoLegacy />;
}
