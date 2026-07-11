// 심층 인터뷰 — fixed 5-question 회상 인터뷰 Likert screener (clone-audit 13).
//
// Cloned 1:1 from the reference InterviewScreen (sb-screens-know.jsx): a
// windowed M3 screen over the shared deep-space sky (DeepSpaceScreen active
// "lens"). Per step: a linear progress bar, one 세컨비-asked headline question,
// a subtitle, and five tappable outlined answer cards. After the 5th answer a
// ratify ("이렇게 반영할까요?") view proposes the change and only reflects it on
// approval (propose→ratify). All colors route through m3.* tokens.
//
// The reference screener has no free-text LLM turn, so C9 is not in this
// screen's path (the classifier stays enforced in gemini.ts). The ratify
// approval persists the answers through createRecord and hands off to /big-five;
// its success/failure surfaces use the premium toast + modal (never a native alert).

import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, ProgressLinear, m3TextStyle } from "@/components/m3";
import { SecondbHead } from "@/components/deepspace/SecondbHead";
import { PremiumModal, PremiumToast, PremiumLoadingState } from "@/components/premium";
import { m3 } from "@/lib/theme/m3";
import { spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { canonKnow } from "@/lib/canon";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { createRecord } from "@/lib/records/create";

const TOTAL = 5;

// Material-symbol stroke idiom (2dp currentColor, round caps), matching the
// shell's icon set. Only the glyphs this screen needs are kept local.
const ICON: Record<string, string> = {
  radio_button_unchecked: '<circle cx="12" cy="12" r="9"/>',
  task_alt: '<circle cx="12" cy="12" r="8.4"/><path d="m8.4 12 2.5 2.6 4.7-5.2"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  arrow_forward: '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
};

function Glyph({ name, color, size = 20 }: { name: keyof typeof ICON; color: string; size?: number }) {
  const xml =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${ICON[name]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

// Fixed question set + answers: ko comes from the canon 1:1, with a faithful
// en mirror kept in code (locale-inline copy keeps EN↔KO parity without new
// i18n keys). The capture is Korean, so ko renders verbatim.
// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
const QS: Record<"ko" | "en", string[]> = {
  ko: canonKnow.questions,
  en: [
    "Lately, when you're with people, does your energy fill up or drain away?",
    "An evening alone or an evening with plans — which is more you?",
    "At a first meeting, are you the one who speaks up first?",
    "At the end of a tiring day, do you want to reach out to someone?",
    "Looking back, was the moment you felt most alive spent alone or together?",
  ],
};

// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
const ANSWERS: Record<"ko" | "en", string[]> = {
  ko: canonKnow.likertOptions,
  en: ["Yes", "Somewhat", "Neutral", "Not really", "No"],
};

// The interview saves each answer as a record; it does NOT compute tier deltas
// yet, so the ratify block below shows an honest "saved" note instead of the
// prototype's fabricated "+6 · 근거 4건 · L2→L3" proposal cards.

function InterviewScreen() {
  const { t, i18n } = useTranslation("interview");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "ko" | "en";
  // Period-scoped recall: the audit era card passes ?period=teens|20s (else this
  // is the general "current" screener). Filed on the record so the recall lands
  // under the era the user tapped, not always "current".
  const { period: periodParam } = useLocalSearchParams<{ period?: string }>();
  const auditPeriod: "current" | "20s" | "teens" =
    periodParam === "teens" || periodParam === "20s" ? periodParam : "current";
  const { userId, loading, isMinor, hasProfile } = useAuth();
  const kbHeight = useKeyboard();

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const [feedbackModal, setFeedbackModal] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  function Frame({ children }: { children: ReactNode }) {
    return (
      <DeepSpaceScreen
        active="lens"
        header="none"
        variant="windowed"
        title={t("title")}
        onBack={() => router.back()}
      >
        {children}
      </DeepSpaceScreen>
    );
  }

  if (loading) {
    return (
      <Frame>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </Frame>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  function pickAnswer(a: string) {
    setAnswers((prev) => [...prev, a]);
    setStep((s) => s + 1);
  }

  function restart() {
    setAnswers([]);
    setStep(0);
  }

  async function approveAndReflect() {
    if (!userId || saving) return;
    setSaving(true);
    let navigating = false;
    try {
      const qLabel = locale === "ko" ? "질문" : "Q";
      const aLabel = locale === "ko" ? "답변" : "A";
      const transcript = QS[locale]
        .map((q, i) => `${qLabel}: ${q}\n${aLabel}: ${answers[i] ?? ""}`)
        .join("\n\n");
      await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "audit_response",
        body: transcript,
        topic: locale === "ko" ? "회상 인터뷰" : "Recall interview",
        summary: locale === "ko" ? "5문항 회상 인터뷰 응답" : "5-item recall interview",
        tags: ["interview", "recall", "screener"],
        auditPeriod,
        withFollowup: false,
      });
      setToast({
        tone: "success",
        message: t("reflected"),
      });
      navigating = true;
      setTimeout(() => router.replace("/big-five"), 700);
    } catch (e) {
      console.warn("[interview] reflect save failed", (e as Error).message);
      setFeedbackModal(true);
    } finally {
      if (!navigating) setSaving(false);
    }
  }

  const feedbackRetryHint =
    t("retryHint");
  const ratify = step >= TOTAL;
  const scrollStyle = [styles.body, { paddingBottom: kbHeight + spacing.sm }];

  return (
    <Frame>
      <ScrollView contentContainerStyle={scrollStyle}>
        {ratify ? (
          <>
            <View style={styles.ratifyHead}>
              <Glyph name="task_alt" color={m3.color.primary} size={22} />
              <Text style={[m3TextStyle("titleLarge"), styles.ratifyTitle]}>
                {t("ratifyTitle")}
              </Text>
            </View>
            <Text style={[m3TextStyle("bodyMedium"), styles.ratifyBody]}>
              {t("ratifyBody1")}
              <Text style={styles.ratifyBodyStrong}>{t("ratifyBodyStrong")}</Text>
              {t("ratifyBody2")}
            </Text>

            <MdCard variant="outlined" style={styles.deltaCard}>
              <Text style={[m3TextStyle("bodySmall"), styles.deltaNote]}>
                {t("ratifyDeltaNote")}
              </Text>
            </MdCard>

            <View style={styles.ratifyActions}>
              <MdButton
                label={t("again")}
                variant="outlined"
                onPress={restart}
                style={styles.ratifyRestart}
              />
              <MdButton
                label={t("approve")}
                variant="filled"
                loading={saving}
                onPress={approveAndReflect}
                icon={<Glyph name="check" color={m3.color.onPrimary} size={18} />}
                style={styles.ratifyApprove}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.progressBlock}>
              <ProgressLinear
                value={step / TOTAL}
                style={styles.progressBar}
                accessibilityLabel={
                  t("question", { n: step + 1, total: TOTAL })
                }
              />
              <Text style={[m3TextStyle("labelMedium"), styles.progressLabel]}>
                {t("progressLabel", { n: step + 1, total: TOTAL })}
              </Text>
            </View>

            <View style={styles.questionRow}>
              <SecondbHead size={36} track={false} />
              <Text style={[m3TextStyle("headlineSmall"), styles.question]}>{QS[locale][step]}</Text>
            </View>

            <Text style={[m3TextStyle("bodySmall"), styles.subtitle]}>
              {t("screenerSubtitle")}
            </Text>

            <View style={styles.answers}>
              {ANSWERS[locale].map((a) => (
                <MdCard
                  key={a}
                  variant="outlined"
                  onPress={() => pickAnswer(a)}
                  accessibilityLabel={a}
                  style={styles.answerCard}
                >
                  <View style={styles.answerRow}>
                    <Text style={[m3TextStyle("bodyLarge"), styles.answerText]}>{a}</Text>
                    <Glyph name="radio_button_unchecked" color={m3.color.outline} size={20} />
                  </View>
                </MdCard>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}

      <PremiumModal
        visible={feedbackModal}
        onClose={() => setFeedbackModal(false)}
        accessibilityLabel={t("notice")}
      >
        <Text style={[m3TextStyle("titleMedium"), styles.modalTitle]}>
          {t("reflectError")}
        </Text>
        <Text style={[m3TextStyle("bodyMedium"), styles.modalBody]}>
          {t("reflectErrorBody")}
        </Text>
        <View style={styles.modalActions}>
          <MdButton
            label={t("dismiss")}
            variant="outlined"
            onPress={() => setFeedbackModal(false)}
            style={styles.modalButton}
          />
          <MdButton
            label={t("tryAgain")}
            variant="filled"
            loading={saving}
            onPress={() => {
              setFeedbackModal(false);
              void approveAndReflect();
            }}
            accessibilityHint={feedbackRetryHint}
            style={styles.modalButton}
          />
        </View>
      </PremiumModal>
    </Frame>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },

  // question state
  progressBlock: { marginTop: 6, marginBottom: 4 },
  progressBar: { height: 6, borderRadius: 3 },
  progressLabel: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 8 },
  questionRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 20, marginBottom: 8 },
  question: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand, lineHeight: 34 },
  subtitle: { color: m3.color.tertiary, fontFamily: m3.font.brand, marginTop: 10, marginBottom: 18 },
  answers: { gap: 10 },
  answerCard: { minHeight: 48, paddingVertical: 14, paddingHorizontal: 16, justifyContent: "center" },
  answerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  answerText: { color: m3.color.onSurface, fontFamily: m3.font.brand, flexShrink: 1 },

  // ratify state
  ratifyHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 16 },
  ratifyTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, flexShrink: 1 },
  ratifyBody: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginBottom: 14 },
  ratifyBodyStrong: { color: m3.color.onSurface, fontWeight: "700" },
  deltaCard: { marginBottom: 10 },
  deltaNote: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4 },
  ratifyActions: { flexDirection: "row", gap: 8, marginTop: 18 },
  ratifyRestart: { flex: 1 },
  ratifyApprove: { flex: 2 },

  // feedback surfaces
  toastWrap: { position: "absolute", left: 16, right: 16, bottom: 32, alignItems: "stretch" },
  modalTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginBottom: 8 },
  modalBody: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, lineHeight: 21 },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  modalButton: { flex: 1 },
});

export default function Interview() {
  return <InterviewScreen />;
}
