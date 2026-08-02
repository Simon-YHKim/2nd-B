// 강점 (rev2 P3b): strengths self-report + populated read.
//
// Flow: on mount, load the latest strengths self-report. If there is NONE, the
// screen offers a short strengths survey (10 items, 6-point Likert) whose result
// is saved as a ["strengths","assessment"] record. If there IS a result, the
// shared AxisCheckScreen renders the populated SIGNATURE strengths top-3 + 강점
// 스펙트럼.
//
// HONESTY: this is a self-report ESTIMATE of the user's OWN strengths — not a
// medical assessment. Confidence is shown and capped well under 100%; the
// populated layout only ever shows the user's real answers (strengths-survey.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, BackHandler } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumLoadingState, PremiumToast, PremiumModal } from "@/components/premium";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { MdButton } from "@/components/m3";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { AxisCheckScreen } from "@/components/deep-space/AxisCheck";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { loadLatestStrengths, type LoadedStrengths } from "@/lib/persona/build";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  STRENGTH_ITEMS,
  STRENGTH_LABEL_EN,
  STRENGTH_LABEL_KO,
  scoreStrengths,
  type StrengthsResponses,
} from "@/lib/persona/strengths-survey";
import { QuantIntroModal } from "@/components/quant/QuantIntroModal";
import { LikertChoiceGroup } from "@/components/quant/LikertChoiceGroup";
import { QuantPager } from "@/components/quant/QuantPager";
import { QuantSaveCelebration } from "@/components/quant/QuantSaveCelebration";
import { consumeFirstStarChatNudge } from "@/lib/onboarding/state";
import { systemLocaleFor, type AvailableUiLocale } from "@/lib/i18n/locales";

// 6-point self-report scale: 1 전혀 나 같지 않다 … 6 매우 나 같다.
const SHIPPED_DISPLAY_LOCALES = ["en", "ko", "es", "pt", "id"] as const;

function displayLocaleFor(localeTag: string | null | undefined): AvailableUiLocale {
  const base = localeTag?.split("-")[0];
  return SHIPPED_DISPLAY_LOCALES.includes(base as AvailableUiLocale) ? (base as AvailableUiLocale) : "en";
}

const SCALE: { value: number; label: Record<AvailableUiLocale, string> }[] = [
  {
    value: 1,
    label: {
      en: "Not like me at all",
      ko: "전혀 나 같지 않다",
      es: "No se parece nada a mi",
      pt: "Nada parecido comigo",
      id: "Sama sekali bukan saya",
    },
  },
  {
    value: 2,
    label: { en: "Unlike me", ko: "나 같지 않다", es: "No se parece a mi", pt: "Pouco parecido comigo", id: "Kurang seperti saya" },
  },
  {
    value: 3,
    label: {
      en: "Somewhat unlike me",
      ko: "별로 나 같지 않다",
      es: "Se parece poco a mi",
      pt: "Um pouco diferente de mim",
      id: "Agak kurang seperti saya",
    },
  },
  {
    value: 4,
    label: {
      en: "Somewhat like me",
      ko: "조금 나 같다",
      es: "Se parece algo a mi",
      pt: "Um pouco parecido comigo",
      id: "Agak seperti saya",
    },
  },
  {
    value: 5,
    label: { en: "Like me", ko: "나 같다", es: "Se parece a mi", pt: "Parecido comigo", id: "Seperti saya" },
  },
  {
    value: 6,
    label: {
      en: "Very much like me",
      ko: "매우 나 같다",
      es: "Se parece mucho a mi",
      pt: "Muito parecido comigo",
      id: "Sangat seperti saya",
    },
  },
];

type Toast = { message: string; tone: "danger" | "info" | "success" };

const STRENGTHS_COPY: Record<
  AvailableUiLocale,
  {
    loading: string;
    topic: string;
    conclusion: string;
    saveError: string;
    title: string;
    description: string;
    citation: string;
    prompt: string;
    saved: string;
    exitLabel: string;
    exitTitle: string;
    exitBody: string;
    keepGoing: string;
    exit: string;
  }
> = {
  en: {
    loading: "Loading...",
    topic: "Strengths self-report",
    conclusion: "Self-report estimate (not a medical assessment).",
    saveError: "Couldn't save. Your answers are still here; please try again.",
    title: "Strengths self-report",
    description:
      "A short self-report of which strengths feel like you. Rate how well each statement fits you from 1 (not like me at all) to 6 (very much like me). No right answers, and it's an estimate, not a medical assessment.",
    citation: "Anchored to a character-strengths view · self-report estimate",
    prompt: "How well does each statement fit you?",
    saved: "Your strengths self-report is saved.",
    exitLabel: "Exit confirmation",
    exitTitle: "Leave the survey?",
    exitBody: "Are you sure you want to exit? Your progress will not be saved.",
    keepGoing: "Keep going",
    exit: "Exit",
  },
  ko: {
    loading: "불러오는 중...",
    topic: "강점 자기보고",
    conclusion: "자기보고 추정 (진단 아님).",
    saveError: "저장하지 못했어요. 답변은 그대로 남아 있으니 다시 시도해 주세요.",
    title: "강점 자기보고",
    description:
      "어떤 강점이 나와 얼마나 맞는지 스스로 답하는 짧은 자기보고예요. 각 문장이 나와 얼마나 맞는지 1(전혀 나 같지 않다) ~ 6(매우 나 같다)로 답해 주세요. 정답은 없고, 진단이 아니라 추정이에요.",
    citation: "성격 강점 관점에서 착안 · 자기보고 추정",
    prompt: "다음 문장이 당신과 얼마나 맞는지 골라주세요.",
    saved: "강점 자기보고를 저장했어요.",
    exitLabel: "종료 확인",
    exitTitle: "그만두시겠어요?",
    exitBody: "정말 종료하시겠습니까? 작성 중이던 답변이 저장되지 않고 사라집니다.",
    keepGoing: "계속하기",
    exit: "종료",
  },
  es: {
    loading: "Cargando...",
    topic: "Autoinforme de fortalezas",
    conclusion: "Estimacion de autoinforme (no es una evaluacion medica).",
    saveError: "No se pudo guardar. Tus respuestas siguen aqui; intentalo de nuevo.",
    title: "Autoinforme de fortalezas",
    description:
      "Un autoinforme breve sobre que fortalezas se sienten propias. Valora cada frase del 1 (no se parece nada a mi) al 6 (se parece mucho a mi). No hay respuestas correctas; es una estimacion, no una evaluacion medica.",
    citation: "Basado en una mirada de fortalezas personales · estimacion de autoinforme",
    prompt: "¿Que tan bien encaja cada frase contigo?",
    saved: "Tu autoinforme de fortalezas se guardo.",
    exitLabel: "Confirmacion de salida",
    exitTitle: "¿Salir de la encuesta?",
    exitBody: "¿Seguro que quieres salir? Tu progreso no se guardara.",
    keepGoing: "Continuar",
    exit: "Salir",
  },
  pt: {
    loading: "Carregando...",
    topic: "Autorrelato de fortalezas",
    conclusion: "Estimativa de autorrelato (nao e uma avaliacao medica).",
    saveError: "Nao foi possivel salvar. Suas respostas ainda estao aqui; tente novamente.",
    title: "Autorrelato de fortalezas",
    description:
      "Um autorrelato curto sobre quais fortalezas parecem suas. Avalie cada frase de 1 (nada parecido comigo) a 6 (muito parecido comigo). Nao ha respostas certas; e uma estimativa, nao uma avaliacao medica.",
    citation: "Baseado em uma visao de fortalezas pessoais · estimativa de autorrelato",
    prompt: "Quanto cada frase combina com voce?",
    saved: "Seu autorrelato de fortalezas foi salvo.",
    exitLabel: "Confirmacao de saida",
    exitTitle: "Sair da pesquisa?",
    exitBody: "Tem certeza de que quer sair? Seu progresso nao sera salvo.",
    keepGoing: "Continuar",
    exit: "Sair",
  },
  id: {
    loading: "Memuat...",
    topic: "Laporan diri kekuatan",
    conclusion: "Perkiraan laporan diri (bukan penilaian medis).",
    saveError: "Tidak dapat menyimpan. Jawabanmu masih ada; coba lagi.",
    title: "Laporan diri kekuatan",
    description:
      "Laporan diri singkat tentang kekuatan yang terasa seperti dirimu. Nilai setiap pernyataan dari 1 (sama sekali bukan saya) sampai 6 (sangat seperti saya). Tidak ada jawaban benar; ini perkiraan, bukan penilaian medis.",
    citation: "Berpijak pada sudut pandang kekuatan karakter · perkiraan laporan diri",
    prompt: "Seberapa cocok setiap pernyataan dengan dirimu?",
    saved: "Laporan diri kekuatanmu tersimpan.",
    exitLabel: "Konfirmasi keluar",
    exitTitle: "Keluar dari survei?",
    exitBody: "Yakin ingin keluar? Progresmu tidak akan disimpan.",
    keepGoing: "Lanjutkan",
    exit: "Keluar",
  },
};

// The strengths self-report body, mirroring ValuesSurvey: QuantIntroModal → paged
// Likert items → live scoring → createRecord. It is the only writer of the
// ["strengths","assessment"] record that loadLatestStrengths reads. onComplete
// fires after the save celebration so the caller reloads into the populated lens;
// onCancel backs out of the intro (caller shows the not-measured state).
function StrengthsSurvey({ onComplete, onCancel, registerBackGuard }: { onComplete: () => void; onCancel: () => void; registerBackGuard?: (fn: (() => boolean) | null) => void }) {
  const { i18n } = useTranslation("home");
  const { userId, loading } = useAuth();
  const displayLocale = displayLocaleFor(i18n.language);
  const systemLocale = systemLocaleFor(i18n.language);
  const copy = STRENGTHS_COPY[displayLocale];
  const systemCopy = STRENGTHS_COPY[systemLocale];

  const [responses, setResponses] = useState<StrengthsResponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  const result = useMemo(() => scoreStrengths(responses), [responses]);

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
        <PremiumLoadingState message={copy.loading} />
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
      const labels = systemLocale === "ko" ? STRENGTH_LABEL_KO : STRENGTH_LABEL_EN;
      const summary = result.scores
        .slice(0, 3)
        .map((s) => `${labels[s.strength]}: ${s.score}`)
        .join("  ·  ");
      await createRecord({
        userId,
        locale: systemLocale,
        kind: "note",
        body: JSON.stringify({
          strengths_responses: responses,
          scores: result.scores,
          confidence: result.confidence,
        }),
        topic: systemCopy.topic,
        summary,
        conclusion: systemCopy.conclusion,
        tags: ["strengths", "assessment"],
        withFollowup: false,
      });
      setSaved(true);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[strengths] save failed", (e as Error).message);
      setToast({
        tone: "danger",
        message: copy.saveError,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {!started ? (
        <QuantIntroModal
          toolKey="strengths"
          title={copy.title}
          itemCount={STRENGTH_ITEMS.length}
          estimatedMinutes={3}
          description={copy.description}
          citation={copy.citation}
          locale={systemLocale}
          onStart={() => setStarted(true)}
          onCancel={onCancel}
        />
      ) : null}

      {started ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <Text variant="caption" color="brand">
              {copy.title}
            </Text>
            <Text variant="body" color="textMuted">
              {copy.prompt}
            </Text>
          </View>

          <QuantPager
            totalItems={STRENGTH_ITEMS.length}
            perPage={4}
            answered={result.answered}
            complete={result.complete}
            onSubmit={handleSubmit}
            submitDisabled={!result.complete || submitting}
            submitLoading={submitting}
            locale={systemLocale}
            renderItem={(idx) => {
              const item = STRENGTH_ITEMS[idx];
              const value = responses[item.id];
              return (
                <View style={styles.itemCard}>
                  <Text variant="body" style={{ marginBottom: 2 }}>
                    {item.id}. {systemLocale === "ko" ? item.ko : item.en}
                  </Text>
                  <Text variant="subtle" color="textSubtle" style={{ marginBottom: spacing.xs }}>
                    {systemLocale === "ko" ? item.subtitleKo : item.subtitleEn}
                  </Text>
                  <LikertChoiceGroup
                    choices={SCALE.map((s) => ({ value: s.value, label: s.label[displayLocale] }))}
                    locale={systemLocale}
                    onSelect={(next) => setResponse(item.id, next)}
                    question={`${item.id}. ${systemLocale === "ko" ? item.ko : item.en}`}
                    value={value}
                  />
                  <View style={styles.scaleLegend}>
                    <Text variant="subtle" color="textMuted">
                      {SCALE[0].label[displayLocale]}
                    </Text>
                    <Text variant="subtle" color="textMuted">
                      {SCALE[5].label[displayLocale]}
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
          message={copy.saved}
          onDone={() => {
            // med#7: first star ever -> one SecondB chat (activation). This
            // nudge lived only on /attachment; now every instrument takes it.
            if (consumeFirstStarChatNudge()) {
              router.replace({ pathname: "/secondb", params: { fromNode: copy.topic } });
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
        accessibilityLabel={copy.exitLabel}
      >
        <Text variant="heading">{copy.exitTitle}</Text>
        <Text variant="body" color="textMuted" style={{ marginVertical: spacing.sm, lineHeight: 21 }}>
          {copy.exitBody}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={copy.keepGoing}
            variant="secondary"
            onPress={() => setExitConfirmOpen(false)}
            style={{ flex: 1 }}
          />
          <Button
            label={copy.exit}
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

export default function StrengthsCheck() {
  const { t } = useTranslation("home");
  const { userId, loading } = useAuth();
  // undefined = still loading; null = no stored result; object = has result.
  const [result, setResult] = useState<LoadedStrengths | null | undefined>(undefined);
  // A failed READ is not "no result yet". Collapsing the two is how the app told a
  // user who had taken the assessment that they had not, and offered it again.
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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
    loadLatestStrengths(getSupabaseClient(), userId)
      .then((r) => {
        if (cancelled) return;
        setHasError(false);
        setResult(r);
      })
      .catch(() => {
        // A read failure is NOT "no result yet". Saying so is what let the app hand a
        // completed user the survey again whenever the network hiccuped.
        if (cancelled) return;
        setHasError(true);
        setResult(null);
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
        title={t("ds.axisCheck.strengths.headline")}
        onBack={() => router.back()}
      >
        <View style={styles.center}>
          <PremiumLoadingState message={t("ds.axisCheck.strengths.headline")} />
        </View>
      </DeepSpaceScreen>
    );
  }

  // Read failed. Say so, and offer a retry -- never re-offer a survey they already took.
  if (hasError) {
    return (
      <DeepSpaceScreen
        active="lens"
        header="none"
        variant="windowed"
        title={t("ds.axisCheck.strengths.headline")}
        onBack={() => router.back()}
      >
        <View style={styles.center}>
          <Text variant="body" accessibilityRole="alert">{t("ds.axisCheck.loadError")}</Text>
          <MdButton
            variant="tonal"
            label={t("ds.axisCheck.retry")}
            onPress={() => setReloadKey((k) => k + 1)}
          />
        </View>
      </DeepSpaceScreen>
    );
  }

  // Has a real self-report → populated SIGNATURE strengths + 강점 스펙트럼.
  if (result) {
    return <AxisCheckScreen axis="strengths" strengthsResult={result} />;
  }

  // No stored result, user backed out of the survey → honest not-measured state.
  if (dismissed) {
    return <AxisCheckScreen axis="strengths" />;
  }

  // No stored result → offer the short strengths self-report.
  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={t("ds.axisCheck.strengths.headline")}
      onBack={() => {
        if (surveyBackGuard.current?.()) return;
        router.back();
      }}
    >
      <StrengthsSurvey
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
