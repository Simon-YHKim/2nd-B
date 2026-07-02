/**
 * Axis-scoped reflective check screen (rev2 P3b): the shared body for
 * /motivation (동기, SDT) and /strengths (강점). A focused, dedicated version of
 * the life-audit flow: one free-text prompt per step, saved as an
 * audit_response record tagged with the shared framework vocabulary + the
 * axis_check tag. Self-check framing, no scores, propose->ratify untouched
 * (records are the user's own words).
 *
 * Chrome: DeepSpaceScreen active="lens" (canon sub-screen pattern, like
 * /ipip-neo). Android hardware back is intercepted mid-session so a written
 * answer is never lost silently (PremiumModal confirm, the attachment/audit
 * survey pattern).
 */
import { useEffect, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { PremiumLoadingState, PremiumModal, PremiumToast } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, ProgressLinear } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { getSupabaseClient } from "@/lib/supabase/client";
import { AXIS_CHECKS, type AxisCheckId } from "@/lib/audit/axis-checks";
import { proposeAxisEstimate } from "@/lib/audit/axis-estimate";
import { labelFramework } from "@/lib/audit/frameworkLabels";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";

/**
 * Accumulated signal counts per framework for one axis check (Screen-Spec
 * 16/19/20 display side, honesty-shaped): the "spectrum" bars show HOW MUCH
 * the user has written per anchor — record counts, never invented scores.
 */
async function fetchAxisSignals(userId: string, tag: string): Promise<Record<string, number>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("tags")
    .eq("user_id", userId)
    .contains("tags", [tag]);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    for (const t of (row as { tags: string[] | null }).tags ?? []) {
      if (t.includes(":") && t !== tag) counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return counts;
}

// rev2 TITLES verbatim for the windowed top app bar (sb-app: 동기/강점/가치관 —
// the bar carries the axis name; the check framing stays in the body copy).
const BAR_TITLE: Record<AxisCheckId, { ko: string; en: string }> = {
  motivation: { ko: "동기", en: "Motivation" },
  strengths: { ko: "강점", en: "Strengths" },
  values: { ko: "가치관", en: "Values" },
};

// rev2 report cross-links (sb-surfaces bottom buttons): each axis screen links
// the sibling checks. Routes are the real app screens.
const CROSS_LINKS: Record<AxisCheckId, { label: { ko: string; en: string }; route: string; tonal?: boolean }[]> = {
  motivation: [
    { label: { ko: "강점 보기", en: "See strengths" }, route: "/strengths", tonal: true },
    { label: { ko: "다른 검증틀", en: "Other checks" }, route: "/big-five" },
  ],
  strengths: [
    { label: { ko: "동기 보기", en: "See motivation" }, route: "/motivation", tonal: true },
    { label: { ko: "다른 검증틀", en: "Other checks" }, route: "/big-five" },
  ],
  values: [
    { label: { ko: "동기 보기", en: "See motivation" }, route: "/motivation", tonal: true },
    { label: { ko: "강점 보기", en: "See strengths" }, route: "/strengths" },
  ],
};

export function AxisCheckScreen({ axis }: { axis: AxisCheckId }) {
  const check = AXIS_CHECKS[axis];
  const { i18n } = useTranslation();
  const { userId, loading, isMinor, hasProfile } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [errorToast, setErrorToast] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [signals, setSignals] = useState<Record<string, number> | null>(null);

  // Signal summary for the start screen (and refresh after a finished run).
  useEffect(() => {
    if (loading || !userId || started) return;
    let alive = true;
    fetchAxisSignals(userId, check.tag)
      .then((c) => {
        if (alive) setSignals(c);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loading, userId, started, done, check.tag]);

  // rev2 RatifyBlock estimate (sb-surfaces B6): a user-initiated Gemini
  // proposal grounded ONLY in this axis's answers. It reaches nothing until
  // the user keeps it as their own record (propose→ratify, 불변식 #2).
  const [estimate, setEstimate] = useState<{ sentence: string; evidence: number } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateThin, setEstimateThin] = useState(false);
  const [estimateSaved, setEstimateSaved] = useState(false);

  async function handleEstimate() {
    if (!userId || estimating) return;
    setEstimating(true);
    setEstimateThin(false);
    setEstimateSaved(false);
    try {
      const out = await proposeAxisEstimate({
        userId,
        tag: check.tag,
        axisName: BAR_TITLE[axis][locale],
        locale,
        minor: isMinor === true,
      });
      setEstimate(out);
      if (!out) setEstimateThin(true);
    } catch {
      setEstimate(null);
      setEstimateThin(true);
    } finally {
      setEstimating(false);
    }
  }

  async function handleKeepEstimate() {
    if (!userId || !estimate || estimateSaved) return;
    try {
      await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "audit_response",
        body: estimate.sentence,
        prompt: locale === "ko" ? "세컨비의 추정" : "SecondB estimate",
        auditPeriod: "current",
        topic: estimate.sentence.slice(0, 80),
        tags: ["life_audit", check.tag, "estimate"],
      });
      setEstimateSaved(true);
    } catch (e) {
      console.warn(`[${axis}] estimate save failed`, (e as Error).message);
      setErrorToast(true);
    }
  }

  // Android hardware back mid-session: confirm before losing a written answer.
  useEffect(() => {
    if (!started || done) return;
    const onBackPress = () => {
      if (index > 0 || answer.trim().length > 0) {
        setExitConfirmOpen(true);
        return true;
      }
      setStarted(false);
      return true;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [started, done, index, answer]);

  useEffect(() => {
    if (!errorToast) return;
    const timeout = setTimeout(() => setErrorToast(false), 2800);
    return () => clearTimeout(timeout);
  }, [errorToast]);

  const barTitle = BAR_TITLE[axis][locale];

  // Top-app-bar back mirrors the hardware-back guard: confirm mid-session so a
  // written answer is never lost; otherwise pop the screen.
  const requestExit = () => {
    if (started && !done) {
      if (index > 0 || answer.trim().length > 0) {
        setExitConfirmOpen(true);
        return;
      }
      setStarted(false);
      return;
    }
    router.back();
  };

  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "불러오는 중이에요…" : "Loading…"} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const questions = check.questions;
  const current = questions[index];
  const title = check.title[locale];

  async function handleNext() {
    if (!current || !userId || !answer.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "audit_response",
        body: answer.trim(),
        prompt: current.prompt[locale],
        auditPeriod: "current",
        topic: current.prompt[locale].slice(0, 80),
        tags: ["life_audit", check.tag, current.framework],
      });
      setAnswer("");
      setSavedCount((n) => n + 1);
      if (index + 1 >= questions.length) {
        setDone(true);
      } else {
        setIndex(index + 1);
      }
    } catch (e) {
      console.warn(`[${axis}] save failed`, (e as Error).message);
      setErrorToast(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={requestExit}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {!started && !done ? (
          <View style={styles.block}>
            <Text variant="heading">{title}</Text>
            <Text variant="body" color="textMuted" style={styles.intro}>
              {check.intro[locale]}
            </Text>
            <Text variant="caption" color="textSubtle" style={styles.intro}>
              {locale === "ko"
                ? "자기 점검이에요. 답은 내 기록으로만 저장돼요."
                : "A self-check. Answers are saved only as your own records."}
            </Text>
            {(() => {
              // Signal spectrum (Screen-Spec 16/19/20 display side): per-anchor
              // record counts as relative bars — the honest version of the
              // prototype's ranked spectrum (amount written, not scores).
              if (!signals) return null;
              const anchors = [...new Set(questions.map((q) => q.framework))];
              const rows = anchors
                .map((f) => ({ f, n: signals[f] ?? 0 }))
                .sort((a, b) => b.n - a.n);
              const total = rows.reduce((s, r) => s + r.n, 0);
              if (total === 0) return null;
              const max = Math.max(...rows.map((r) => r.n), 1);
              const top = rows.filter((r) => r.n > 0).slice(0, 3);
              return (
                <View style={styles.signalBlock}>
                  <Text style={styles.signalLabel}>
                    {locale === "ko" ? `지금까지의 신호 · 기록 ${total}개` : `Signals so far · ${total} records`}
                  </Text>
                  {anchors.length >= 4 && top.length >= 3 ? (
                    <View style={styles.topRow}>
                      {top.map((r, i) => (
                        <View key={r.f} style={[styles.topCard, i === 0 && styles.topCardFirst]}>
                          <Text style={[styles.topRank, i === 0 && styles.topRankFirst]}>{i + 1}</Text>
                          <Text style={[styles.topName, i === 0 && styles.topNameFirst]} numberOfLines={1}>
                            {labelFramework(r.f, locale).split("·").pop()?.trim()}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {rows.map((r) => (
                    <View key={r.f} style={styles.signalRow}>
                      <View style={styles.signalHead}>
                        <Text style={styles.signalName}>{labelFramework(r.f, locale).split("·").pop()?.trim()}</Text>
                        <Text style={styles.signalCount}>{`×${r.n}`}</Text>
                      </View>
                      <ProgressLinear value={r.n / max} color={m3.color.tertiary} />
                    </View>
                  ))}
                  <Text style={styles.signalFootnote}>
                    {locale === "ko"
                      ? "막대는 확신이 아니라 적어 주신 양이에요."
                      : "Bars show how much you've written, not scores."}
                  </Text>
                  {/* rev2 RatifyBlock, honest half: real evidence count + the
                      propose→ratify framing. The prototype's LLM estimate
                      sentence and confidence% wait on the estimate pipe —
                      never fabricated here. */}
                  <View style={styles.evidenceCard}>
                    {estimate ? (
                      <>
                        <Text style={styles.estimateTag}>
                          {locale === "ko" ? "세컨비의 추정 · 아직 반영 안 됨" : "SecondB's estimate · not applied yet"}
                        </Text>
                        <Text style={styles.estimateLine}>{estimate.sentence}</Text>
                      </>
                    ) : null}
                    {estimateThin ? (
                      <Text style={styles.evidenceLine}>
                        {locale === "ko"
                          ? "아직 추정할 만큼 답이 모이지 않았어요. 점검을 몇 번 더 해봐요."
                          : "Not enough answers to estimate yet. A few more checks will do it."}
                      </Text>
                    ) : null}
                    <Text style={styles.evidenceLine}>
                      {locale === "ko"
                        ? `담긴 기록 ${total}건 근거 · 비준하기 전엔 북극성에 반영되지 않아요.`
                        : `${total} records as evidence. Nothing reaches your North Star until you ratify it.`}
                    </Text>
                    <View style={styles.evidenceActions}>
                      <MdButton
                        variant="text"
                        disabled={estimating}
                        label={
                          estimating
                            ? locale === "ko" ? "생각 중…" : "Thinking…"
                            : estimate
                              ? locale === "ko" ? "재생성" : "Regenerate"
                              : locale === "ko" ? "추정 제안 받기" : "Get an estimate"
                        }
                        onPress={() => void handleEstimate()}
                      />
                      {estimate && !estimateSaved ? (
                        <MdButton
                          variant="text"
                          label={locale === "ko" ? "이 추정 담기" : "Keep this estimate"}
                          onPress={() => void handleKeepEstimate()}
                        />
                      ) : null}
                      {estimateSaved ? (
                        <MdButton variant="text" disabled label={locale === "ko" ? "담았어요" : "Kept"} onPress={() => {}} />
                      ) : null}
                      <MdButton
                        variant="text"
                        label={locale === "ko" ? "승인 이력 보기" : "Ratification log"}
                        onPress={() => router.push("/ratifications")}
                      />
                      <MdButton
                        variant="text"
                        label={locale === "ko" ? "인터뷰로 다듬기" : "Refine in interview"}
                        onPress={() => router.push("/interview")}
                      />
                    </View>
                  </View>
                </View>
              );
            })()}
            <MdButton
              variant="filled"
              label={locale === "ko" ? `시작하기 · ${questions.length}문항` : `Start · ${questions.length} prompts`}
              onPress={() => setStarted(true)}
            />
            <View style={styles.crossRow}>
              {CROSS_LINKS[axis].map((l) => (
                <MdButton
                  key={l.route}
                  variant={l.tonal ? "tonal" : "outlined"}
                  style={styles.crossBtn}
                  label={l.label[locale]}
                  onPress={() => router.push(l.route as never)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {started && !done && current ? (
          <View style={styles.block}>
            <View style={styles.progressRow}>
              <Text variant="caption" color="textMuted">
                {index + 1}/{questions.length}
              </Text>
              <View style={styles.progressBar}>
                <ProgressLinear
                  value={index / questions.length}
                  accessibilityLabel={
                    locale === "ko"
                      ? `진행 ${index}/${questions.length}`
                      : `Progress ${index} of ${questions.length}`
                  }
                />
              </View>
            </View>
            <Text variant="heading" style={styles.prompt}>
              {current.prompt[locale]}
            </Text>
            <Field
              multiline
              value={answer}
              onChangeText={setAnswer}
              placeholder={locale === "ko" ? "떠오르는 대로 적어 주세요" : "Write whatever comes to mind"}
              accessibilityLabel={current.prompt[locale]}
              containerStyle={styles.field}
            />
            <MdButton
              variant="filled"
              disabled={!answer.trim() || submitting}
              label={
                submitting
                  ? locale === "ko" ? "저장 중…" : "Saving…"
                  : index + 1 >= questions.length
                    ? locale === "ko" ? "마치기" : "Finish"
                    : locale === "ko" ? "다음" : "Next"
              }
              onPress={handleNext}
            />
          </View>
        ) : null}

        {done ? (
          <View style={styles.block}>
            <Text variant="heading">
              {locale === "ko" ? "다 적었어요" : "All written down"}
            </Text>
            <Text variant="body" color="textMuted" style={styles.intro}>
              {locale === "ko"
                ? `${title} 답변 ${savedCount}개가 내 기록으로 저장됐어요. 북극성이 이 조각들을 참고해요.`
                : `${savedCount} answers are saved as your records. Your Polaris draws on these pieces.`}
            </Text>
            <MdButton
              variant="filled"
              label={locale === "ko" ? "북극성에서 보기" : "See it in Polaris"}
              onPress={() => router.replace("/core-brain")}
            />
            <MdButton
              variant="text"
              label={locale === "ko" ? "기록으로 가기" : "Go to records"}
              onPress={() => router.replace("/records")}
            />
          </View>
        ) : null}
      </ScrollView>

      {errorToast ? (
        <PremiumToast
          tone="danger"
          message={
            locale === "ko"
              ? "답변을 저장하지 못했어요. 답변은 그대로 남아 있으니 다시 시도해 주세요."
              : "Couldn't save your answer. Your answer is still here, so try again."
          }
        />
      ) : null}

      <PremiumModal
        visible={exitConfirmOpen}
        onClose={() => setExitConfirmOpen(false)}
        accessibilityLabel={locale === "ko" ? "점검 종료 안내" : "Exit check notice"}
      >
        <Text variant="heading">{locale === "ko" ? "점검을 종료할까요?" : "Exit the check?"}</Text>
        <Text variant="body" color="textMuted" style={{ marginVertical: spacing.sm, lineHeight: 21 }}>
          {locale === "ko"
            ? "작성 중이던 답변이 저장되지 않고 사라집니다. 이미 저장한 답변은 기록에 남아 있어요."
            : "Your current answer will be lost. Answers you already saved stay in your records."}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={locale === "ko" ? "계속 쓰기" : "Keep writing"}
            variant="secondary"
            onPress={() => setExitConfirmOpen(false)}
            style={{ flex: 1 }}
          />
          <Button
            label={locale === "ko" ? "종료하기" : "Exit"}
            variant="primary"
            onPress={() => {
              setExitConfirmOpen(false);
              router.back();
            }}
            style={{ flex: 1 }}
          />
        </View>
      </PremiumModal>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  block: { gap: spacing.md },
  intro: { lineHeight: 21 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  progressBar: { flex: 1 },
  prompt: { lineHeight: 26 },
  field: { minHeight: 120 },
  signalBlock: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accent, 0.25),
    borderRadius: 16,
    padding: spacing.md,
    backgroundColor: withAlpha(deepSpace.accent, 0.05),
  },
  signalLabel: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.1, color: withAlpha(deepSpace.accentSoft, 0.75) },
  topRow: { flexDirection: "row", gap: 8 },
  topCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    backgroundColor: m3.color.surface,
    gap: 2,
  },
  topCardFirst: { backgroundColor: m3.color.primary, borderColor: m3.color.primary },
  topRank: { fontFamily: m3.font.mono, fontSize: 11, color: m3.color.onSurfaceVariant },
  topRankFirst: { color: m3.color.onPrimary },
  topName: { fontSize: 13.5, fontWeight: "700", color: m3.color.onSurface },
  topNameFirst: { color: m3.color.onPrimary },
  signalRow: { gap: 4 },
  signalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  signalName: { fontSize: 13, fontWeight: "600", color: "#EAF2FF" },
  signalCount: { fontFamily: m3.font.mono, fontSize: 11, color: withAlpha(deepSpace.accentSoft, 0.7) },
  signalFootnote: { fontSize: 11.5, color: withAlpha(deepSpace.accentSoft, 0.7) },
  evidenceCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: m3.shape.medium,
    backgroundColor: m3.color.surfaceContainerHigh,
    gap: 4,
  },
  evidenceLine: { fontSize: 12.5, lineHeight: 18, color: m3.color.onSurfaceVariant },
  estimateTag: {
    fontFamily: m3.font.mono,
    fontSize: 9.5,
    letterSpacing: 0.8,
    color: withAlpha(m3.color.tertiary, 0.9),
  },
  estimateLine: { fontSize: 14, lineHeight: 21, color: m3.color.onSurface },
  evidenceActions: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  crossRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  crossBtn: { flex: 1 },
});
