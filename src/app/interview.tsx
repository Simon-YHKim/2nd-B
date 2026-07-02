// Drill-down interview. Separate from /audit (which is a fixed
// framework-anchored screener) — this is a free-form, LLM-driven
// probe that descends through 5 narrative layers (FACT → ECHO) within
// a chosen life period.
//
// v0.3 (2026-05-27, docs/ux/2026-05-27-interview-drilldown.html):
//   - 25-cell live progress matrix (5 layers × 5 periods)
//   - Per-turn layer label so the user sees what depth a probe is at
//   - 20-turn hard cap replaced with a "sufficient depth" soft signal
//     once the active period's 5 layers are each covered once
//   - Soft cap at 50 turns to protect memory + LLM context

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, PremiumToast, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DrillProgress } from "@/components/ui/DrillProgress";
import { radii, semantic, spacing, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import {
  PERIOD_LABEL,
  LAYER_LABEL,
  emptyCoverage,
  incrementCoverage,
  isPeriodComplete,
  nextLayerSuggestion,
  nextProbe,
  seedQuestion,
  type Coverage,
  type DrillLayer,
  type InterviewTurn,
  type LifePeriod,
} from "@/lib/interview/probe";
import { shouldStopDrilling } from "@/lib/interview/drill-stop";
import { narrativeStarLevel } from "@/lib/interview/narrative-level";
import { VILLAGE_UI } from "@/lib/village-ui";

const SOFT_CAP = 50;
type InterviewToast = { message: string; tone: "info" | "success" | "danger" };
type InterviewFeedbackModal =
  | { kind: "probe"; turnsSoFar: InterviewTurn[]; coverageSoFar: Coverage }
  | { kind: "save" }
  | { kind: "exit" }
  | null;

// Single interview engine shared by BOTH the legacy and deep-space branches —
// no logic fork. `variant` only swaps the outer frame: legacy uses
// PremiumAppShell, deep-space re-hosts the SAME body inside <DeepSpaceScreen>.
// All data/LLM/safety logic below (startInterview, requestNextProbe,
// handleAnswer, handleSave, the C9 path inside nextProbe) is identical for both.
type InterviewVariant = "legacy" | "deepSpace";

function InterviewBody({ variant }: { variant: InterviewVariant }) {
  const isDeepSpace = variant === "deepSpace";

  // Frame swaps the chrome without touching the body. Deep-space wraps in the
  // rev2 windowed shell (TopAppBar carries TITLES verbatim: 심층 인터뷰);
  // legacy keeps PremiumAppShell.
  function Frame({ children }: { children: ReactNode }) {
    const { i18n: frameI18n } = useTranslation();
    if (isDeepSpace) {
      return (
        <DeepSpaceScreen
          active="lens"
          header="none"
          variant="windowed"
          title={frameI18n.language === "ko" ? "심층 인터뷰" : "Deep interview"}
          onBack={() => router.back()}
        >
          {children}
        </DeepSpaceScreen>
      );
    }
    return <PremiumAppShell>{children}</PremiumAppShell>;
  }

  const { i18n } = useTranslation();
  const { userId, loading, isMinor, hasProfile } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const kbHeight = useKeyboard();

  const [period, setPeriod] = useState<LifePeriod | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [coverage, setCoverage] = useState<Coverage>(emptyCoverage());
  const [pendingLayer, setPendingLayer] = useState<DrillLayer>("fact");
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);
  const [completionAcknowledged, setCompletionAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<InterviewToast | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<InterviewFeedbackModal>(null);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (turns.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [turns.length]);

  // Android hardware back handler: intercept navigation back requests while the
  // interview session is in progress (turns.length > 0) and not finished yet to
  // prevent accidental loss of multi-turn conversational answers.
  useEffect(() => {
    if (turns.length === 0 || done) return;

    const onBackPress = () => {
      setFeedbackModal({ kind: "exit" });
      return true; // Consume the event, preventing immediate navigation back
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [turns.length, done]);

  if (loading) {
    return (
      <Frame>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "인터뷰를 준비하는 중이에요…" : "Loading interview…"} />
        </View>
      </Frame>
    );
  }
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }
  // No-profile OAuth session must not reach the interview LLM surface (the probe
  // calls Gemini on the user's answers) — route to /complete-profile (C10 + consent).
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  function startInterview(p: LifePeriod) {
    const initialCoverage = emptyCoverage();
    setPeriod(p);
    setCoverage(initialCoverage);
    setPendingLayer(nextLayerSuggestion(initialCoverage, p));
    setTurns([
      {
        role: "interviewer",
        text: seedQuestion(p, locale),
        period: p,
        layer: "fact",
      },
    ]);
  }

  // Runs the LLM probe against the turns/coverage already committed to state.
  // Split out so a failed probe can be retried without re-submitting the draft
  // (the user's answer is already in `turns` by the time this runs).
  async function requestNextProbe(turnsSoFar: InterviewTurn[], coverageSoFar: Coverage) {
    if (!userId || !period) return;
    setThinking(true);
    try {
      const probe = await nextProbe(userId, locale, period, turnsSoFar, coverageSoFar, isMinor === true);
      setTurns((prev) => [
        ...prev,
        { role: "interviewer", text: probe.question, period, layer: probe.layer },
      ]);
      setPendingLayer(probe.layer);
    } catch (e) {
      console.warn("[interview] next probe failed", (e as Error).message);
      setFeedbackModal({ kind: "probe", turnsSoFar, coverageSoFar });
    } finally {
      setThinking(false);
    }
  }

  async function handleAnswer() {
    if (!userId || !period || !draft.trim() || thinking) return;

    // The pending layer is what the *current* probe was trying to elicit —
    // when the user answers, that's the cell that gets credited. This stays
    // a deterministic mapping (LLM-agnostic).
    const answeredLayer = pendingLayer;
    const userTurn: InterviewTurn = {
      role: "user",
      text: draft.trim(),
      period,
      layer: answeredLayer,
    };
    const updatedTurns = [...turns, userTurn];
    const updatedCoverage = incrementCoverage(coverage, period, answeredLayer);
    setTurns(updatedTurns);
    setCoverage(updatedCoverage);
    setDraft("");

    const userCount = updatedTurns.filter((t) => t.role === "user").length;
    // Memo §3d: stop when the narrative axis reaches its target ladder level
    // (sufficient cross-period/layer coverage), with SOFT_CAP as the hard safety
    // net - replaces the turn-count-only soft cap.
    if (
      shouldStopDrilling({
        currentLevel: narrativeStarLevel(updatedCoverage),
        turnsSpent: userCount,
        hardTurnCap: SOFT_CAP,
      })
    ) {
      setDone(true);
      return;
    }

    await requestNextProbe(updatedTurns, updatedCoverage);
  }

  async function handleSave() {
    if (!userId || !period || turns.length === 0) return;
    setSaving(true);
    let navigatingAfterSave = false;
    try {
      const transcript = turns
        .map((t) => {
          const tag = t.role === "interviewer"
            ? (locale === "ko" ? "질문" : "Q")
            : (locale === "ko" ? "답변" : "A");
          const layer = t.layer ? ` [${LAYER_LABEL[locale][t.layer]}]` : "";
          return `${tag}${layer}: ${t.text}`;
        })
        .join("\n\n");
      const userCount = turns.filter((t) => t.role === "user").length;
      const layersCovered = (["fact", "feeling", "meaning", "belief", "echo"] as DrillLayer[])
        .filter((l) => coverage[period][l] > 0).length;
      await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "audit_response",
        body: transcript,
        topic: locale === "ko"
          ? `드릴 인터뷰 · ${PERIOD_LABEL.ko[period]}`
          : `Drill interview · ${PERIOD_LABEL.en[period]}`,
        summary: locale === "ko"
          ? `${userCount}개 답변, ${layersCovered}/5 깊이 층 탐색`
          : `${userCount} answers · ${layersCovered}/5 layers covered`,
        tags: ["interview", "life_audit", `period-${period}`, `layers-${layersCovered}`],
        auditPeriod: period === "current" ? "current" : "past",
        withFollowup: false,
      });
      setToast({
        tone: "success",
        message:
          locale === "ko"
            ? "저장됐어요. 페르소나 화면에 함께 반영할게요."
            : "Saved. We'll fold this in on the Persona screen.",
      });
      navigatingAfterSave = true;
      setTimeout(() => router.replace("/persona"), 900);
      return;
    } catch (e) {
      console.warn("[interview] save failed", (e as Error).message);
      setFeedbackModal({ kind: "save" });
    } finally {
      if (!navigatingAfterSave) setSaving(false);
    }
  }

  const userAnswers = turns.filter((t) => t.role === "user").length;
  const periodComplete = period !== null && isPeriodComplete(coverage, period);
  const shouldSuggestWrap = periodComplete && !completionAcknowledged && !done;
  const feedbackModalTitle = feedbackModal?.kind === "probe"
    ? (locale === "ko" ? "다음 질문을 못 불러왔어요" : "Couldn't load the next question")
    : feedbackModal?.kind === "save"
      ? (locale === "ko" ? "저장하지 못했어요" : "Couldn't save")
      : (locale === "ko" ? "인터뷰를 종료할까요?" : "Exit interview?");
  const feedbackModalBody = feedbackModal?.kind === "probe"
    ? (
        locale === "ko"
          ? "잠시 연결이 흔들렸어요. 방금 답변은 그대로 남아 있어요. 다시 시도하면 이어서 물어볼게요."
          : "The connection hiccuped for a moment. Your answer is safe. Try again and we'll pick up where we left off."
      )
    : feedbackModal?.kind === "save"
      ? (
          locale === "ko"
            ? "인터뷰 내용은 화면에 그대로 남아 있어요. 잠시 후 다시 저장해 주세요."
            : "Your interview is still here on the screen. Give it another try in a moment."
        )
      : (
          locale === "ko"
            ? "정말 인터뷰를 종료하시겠습니까? 작성 중이던 대화 답변 내용이 저장되지 않고 사라집니다."
            : "Are you sure you want to exit? Your conversational responses will not be saved."
        );
  const feedbackRetryLabel = feedbackModal?.kind === "probe"
    ? (locale === "ko" ? "다시 시도" : "Retry")
    : feedbackModal?.kind === "save"
      ? (locale === "ko" ? "다시 저장" : "Try again")
      : (locale === "ko" ? "종료하기" : "Exit");
  const feedbackRetryHint = feedbackModal?.kind === "probe"
    ? (locale === "ko" ? "다음 질문을 다시 불러옵니다." : "Retry interview feedback by loading the next question.")
    : feedbackModal?.kind === "save"
      ? (locale === "ko" ? "인터뷰 저장을 다시 시도합니다." : "Retry interview feedback by saving again.")
      : (locale === "ko" ? "인터뷰를 종료하고 이전 화면으로 돌아갑니다." : "Exit the interview and return to the previous screen.");
  const keyboardBehavior = Platform.OS === "ios" ? "padding" : undefined;
  const footerStyle = Platform.OS === "android" && kbHeight > 0
    ? [styles.footer, { paddingBottom: kbHeight + spacing.sm }]
    : styles.footer;

  function retryFeedbackModal() {
    const current = feedbackModal;
    setFeedbackModal(null);
    if (current?.kind === "probe") {
      void requestNextProbe(current.turnsSoFar, current.coverageSoFar);
      return;
    }
    if (current?.kind === "save") {
      void handleSave();
      return;
    }
    if (current?.kind === "exit") {
      router.back();
    }
  }

  if (period === null) {
    return (
      <Frame>
        <ScrollView contentContainerStyle={styles.scroll}>
          <SceneHero
            eyebrow={locale === "ko" ? "10. 드릴 인터뷰" : "10. Drill interview"}
            title={locale === "ko" ? "한 시기를 깊게 들어가기" : "Drill into one life period"}
            subtitle={locale === "ko" ? "사실 · 감정 · 의미 · 믿음 · 울림" : "Fact · feeling · meaning · belief · echo"}
            island={VILLAGE_UI.relation.island}
            worker={VILLAGE_UI.relation.worker}
            accent={VILLAGE_UI.relation.accent}
            speech={
              locale === "ko"
                ? "해석보다 먼저 듣겠습니다. 어느 시기부터 살펴볼까요?"
                : "I'll listen before interpreting. Which period should we start with?"
            }
          />
          <View style={styles.periodGrid}>
            {(["childhood", "teens", "twenties", "thirties", "current"] as LifePeriod[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => startInterview(p)}
                // O-R1.2 (Hick): five identical cards gave no entry point —
                // "current" is the recommended start (most recall, least
                // friction), so it carries the brand accent and a hint line.
                style={[styles.periodCard, p === "current" && styles.periodCardRecommended]}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel={
                  locale === "ko"
                    ? `${PERIOD_LABEL[locale][p]} 시기 인터뷰 시작`
                    : `Start interview for ${PERIOD_LABEL[locale][p]}`
                }
                accessibilityHint={locale === "ko" ? "선택한 시기의 질문을 시작합니다" : "Starts questions for the selected life period"}
              >
                <Text variant="caption" color="brand" style={{ letterSpacing: 0 }}>
                  {PERIOD_LABEL[locale][p]}
                </Text>
                {p === "current" ? (
                  <Text variant="subtle" color="textSubtle" style={{ marginTop: 2 }}>
                    {locale === "ko" ? "여기서 시작하면 좋아요" : "A good place to start"}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Frame>
    );
  }

  return (
    <Frame>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardBehavior}>
        <View style={styles.topBar}>
          <Text variant="caption" color="brand" style={{ letterSpacing: 0 }}>
            {PERIOD_LABEL[locale][period]}
          </Text>
          <Text variant="subtle" color="textSubtle">
            {/* O-R1.2: next-layer text removed — DrillProgress already shows
                the active layer; two indicators saying the same thing was
                the audit's triple-progress finding. */}
            {locale === "ko" ? `${userAnswers}턴` : `${userAnswers} turns`}
          </Text>
        </View>

        <View style={styles.progressWrap}>
          <DrillProgress
            coverage={coverage}
            locale={locale}
            activePeriod={period}
            activeLayer={pendingLayer}
          />
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.chatScroll} keyboardShouldPersistTaps="handled">
          {turns.map((t, i) => (
            <View key={i} style={[styles.bubble, t.role === "interviewer" ? styles.qBubble : styles.aBubble]}>
              <View style={styles.bubbleHeader}>
                <Text variant="subtle" color={t.role === "interviewer" ? "brand" : "textSubtle"} style={{ letterSpacing: 0 }}>
                  {t.role === "interviewer" ? (locale === "ko" ? "질문" : "Q") : (locale === "ko" ? "답변" : "A")}
                </Text>
                {t.layer ? (
                  <Text variant="subtle" color="textSubtle" style={styles.layerTag}>
                    {LAYER_LABEL[locale][t.layer]}
                  </Text>
                ) : null}
              </View>
              <Text variant="body" selectable style={{ marginTop: 4, lineHeight: 22 }}>
                {t.text}
              </Text>
            </View>
          ))}
          {thinking ? (
            <View style={styles.thinkingRow}>
              <ActivityIndicator color={semantic.brand} size="small" />
              <Text variant="subtle" color="textSubtle">
                {locale === "ko" ? "다음 질문 준비 중…" : "Preparing next question…"}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* O-R1.2: the depth-reached decision moved from a banner wedged
            between progress and chat (mid-flow interruption, layout shift)
            to the end of the scan, directly above the composer — the
            canonical decision position. Keep-going is the escape hatch. */}
        {shouldSuggestWrap ? (
          <View style={styles.completionBanner}>
            <Text variant="caption" color="brand" style={{ letterSpacing: 0 }}>
              {locale === "ko" ? "충분한 깊이 도달" : "Sufficient depth reached"}
            </Text>
            <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>
              {locale === "ko"
                ? "5개 층 모두 들었어요. 여기서 마무리해도 좋고, 더 가도 좋아요."
                : "All five layers covered. You can wrap up now or keep going."}
            </Text>
            <View style={styles.completionActions}>
              <Button
                label={locale === "ko" ? "마무리하기" : "Wrap up"}
                variant="primary"
                onPress={() => setDone(true)}
              />
              <Button
                label={locale === "ko" ? "더 갈게요" : "Keep going"}
                variant="ghost"
                onPress={() => setCompletionAcknowledged(true)}
              />
            </View>
          </View>
        ) : null}

        {done ? (
          <View style={footerStyle}>
            <Text variant="caption" color="brand">
              {locale === "ko"
                ? (userAnswers >= SOFT_CAP ? "긴 인터뷰가 끝났어요" : "인터뷰 마무리")
                : (userAnswers >= SOFT_CAP ? "Long interview complete" : "Interview wrap-up")}
            </Text>
            <Button
              label={locale === "ko" ? "저장하고 페르소나에 반영" : "Save & feed Persona"}
              variant="primary"
              onPress={handleSave}
              loading={saving}
            />
          </View>
        ) : (
          <View style={footerStyle}>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder={locale === "ko" ? "솔직하게 답해 주세요." : "Be honest with yourself."}
              multiline
              numberOfLines={3}
            />
            <View style={styles.footerActions}>
              <Button
                label={locale === "ko" ? "그만하기" : "Stop"}
                // O-R1 escape-hatch pattern: Stop must read quieter than Send.
                variant="ghost"
                onPress={() => setDone(true)}
              />
              <Button
                label={locale === "ko" ? "보내기" : "Send"}
                variant="primary"
                onPress={handleAnswer}
                disabled={!draft.trim() || thinking}
                loading={thinking}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
      <PremiumModal
        visible={feedbackModal !== null}
        onClose={() => setFeedbackModal(null)}
        accessibilityLabel={locale === "ko" ? "인터뷰 피드백 안내" : "Interview feedback notice"}
      >
        <Text variant="heading">{feedbackModalTitle}</Text>
        <Text variant="body" color="textMuted" style={styles.modalBody}>
          {feedbackModalBody}
        </Text>
        <View style={styles.modalActions}>
          <Button
            label={feedbackModal?.kind === "exit" ? (locale === "ko" ? "취소" : "Cancel") : (locale === "ko" ? "닫기" : "Dismiss")}
            variant="secondary"
            onPress={() => setFeedbackModal(null)}
            style={styles.modalButton}
            accessibilityHint={feedbackModal?.kind === "exit" ? (locale === "ko" ? "인터뷰를 계속 진행합니다." : "Continue the interview.") : (locale === "ko" ? "안내를 닫습니다." : "Dismisses this notice.")}
          />
          <Button
            label={feedbackRetryLabel}
            variant="primary"
            onPress={retryFeedbackModal}
            loading={thinking || saving}
            style={styles.modalButton}
            accessibilityHint={feedbackRetryHint}
          />
        </View>
      </PremiumModal>
    </Frame>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  header: { gap: spacing.sm },
  periodGrid: { gap: spacing.sm, marginVertical: spacing.md },
  periodCard: {
    minHeight: 48,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  // Recommended entry point (O-R1.2 Hick fix) — brand accent edge, same
  // pattern as gateCard accents elsewhere.
  periodCardRecommended: {
    borderColor: semantic.brand,
    borderStartWidth: 3,
    borderStartColor: semantic.brand,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.border,
  },
  progressWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  completionBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.success,
    backgroundColor: semantic.surface,
  },
  completionActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  chatScroll: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  bubble: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
  },
  bubbleHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  layerTag: { fontFamily: fontFamilies.mono, fontSize: typography.sizes.xs, letterSpacing: 0 },
  qBubble: { backgroundColor: semantic.surface },
  aBubble: { backgroundColor: semantic.surfaceAlt },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    gap: spacing.sm,
  },
  footerActions: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
  modalBody: { lineHeight: 21 },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
});

export default function Interview() {
  // Both branches run the SAME interview engine (InterviewBody) — the only
  // difference is the chrome: deep-space re-hosts the real AI interview inside
  // DeepSpaceScreen instead of the old static RecallLensView placeholder.
  // No logic fork: data/LLM/safety paths are shared.
  return <InterviewBody variant={isDeepSpaceUI() ? "deepSpace" : "legacy"} />;
}
