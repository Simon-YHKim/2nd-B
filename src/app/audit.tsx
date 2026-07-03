import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, BackHandler } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumToast, PremiumModal } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { semantic, spacing, radii } from "@/lib/theme/tokens";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { ValuesLensView, type ValuesDomain } from "@/components/deep-space/DeepSpaceViews";
import { useAuth } from "@/lib/auth/AuthContext";
import { questionsForPeriod, type AuditPeriod } from "@/lib/audit/questions";
import { createRecord } from "@/lib/records/create";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";

// Domain = the framework family a life-audit answer was tagged with (the part
// before ":"). Friendly bilingual labels so raw enum prefixes never leak (cf.
// frameworkLabels.ts). Order here is the display order when counts tie.
const DOMAIN_LABELS: Record<string, { en: string; ko: string }> = {
  big_five: { en: "Personality", ko: "성격" },
  sdt: { en: "Motivation", ko: "동기" },
  via: { en: "Strengths", ko: "강점" },
  attachment: { en: "Relationships", ko: "관계" },
};

const PERIOD_OPTIONS: { id: AuditPeriod; label: { en: string; ko: string } }[] = [
  { id: "current", label: { en: "Right now", ko: "지금 이 시기" } },
  { id: "20s", label: { en: "Your 20s", ko: "20대" } },
  { id: "teens", label: { en: "Your teens", ko: "10대" } },
];
type AuditToast = { message: string; tone: "info" | "success" | "danger" };

function AuditLegacy() {
  const { i18n } = useTranslation();
  const { userId, loading, isMinor, hasProfile } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [period, setPeriod] = useState<AuditPeriod | null>(null);
  const questions = period ? questionsForPeriod(period) : [];

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState<AuditToast | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const companion = useCompanionMoment();

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Android hardware back handler: intercept navigation back requests while the
  // life audit session is in progress to prevent accidental loss of written answers.
  useEffect(() => {
    if (period === null || done) return;

    const onBackPress = () => {
      if (index > 0 || answer.trim().length > 0) {
        setExitConfirmOpen(true);
        return true; // Consume the event, preventing immediate navigation back
      }
      // If they haven't written anything yet on the first question, just let them return to selector
      setPeriod(null);
      return true;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [period, index, answer, done]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "불러오는 중이에요…" : "Loading…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  // No-profile OAuth session (DOB/consent not yet collected) must not reach the
  // audit LLM surface — route to /complete-profile (C10 age gate + consent).
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const current = questions[index];

  async function handleNext() {
    if (!current || !userId || !answer.trim()) return;
    setSubmitting(true);
    try {
      await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "audit_response",
        body: answer.trim(),
        prompt: current.prompt[locale],
        auditPeriod: period ?? "current",
        topic: current.prompt[locale].slice(0, 80),
        tags: ["life_audit", current.framework],
      });
      setAnswer("");
      if (index + 1 >= questions.length) {
        setDone(true);
        // 모모 reads back the finished interview before it's filed (companion pack §3).
        companion.fire("auditCompleted");
      } else {
        setIndex(index + 1);
      }
    } catch (e) {
      // Raw error stays in logs only; users see product-tone copy + retry.
      console.warn("[audit] save failed", (e as Error).message);
      setToast({
        tone: "danger",
        message:
          locale === "ko"
            ? "답변을 저장하지 못했어요. 답변은 그대로 남아 있으니 다시 시도해 주세요."
            : "Couldn't save your answer. Your answer is still here, so try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (period === null) {
    return (
      <PremiumAppShell>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
<ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.introCard}>
            <Text variant="caption" color="brand" style={{ letterSpacing: 0 }}>
              {locale === "ko" ? "과거의 나: 시기 선택" : "Past me: choose a period"}
            </Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: 4, lineHeight: 18 }}>
              {locale === "ko"
                ? "Big Five · 애착이론 · 자기결정성 이론에 기반한 고정 질문 묶음입니다. 자유로운 깊이 탐색은 /스무고개에서."
                : "A fixed framework-anchored question set (Big Five · Attachment · SDT). For open-ended depth probing, use /interview."}
            </Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            {PERIOD_OPTIONS.map((p) => (
              <Button
                key={p.id}
                label={p.label[locale]}
                variant="secondary"
                onPress={() => {
                  setPeriod(p.id);
                  setIndex(0);
                  setAnswer("");
                  setDone(false);
                }}
              />
            ))}
            <Button
              label={locale === "ko" ? "뒤로" : "Back"}
              variant="secondary"
              onPress={() => router.push("/")}
            />
          </View>
        </ScrollView>
</KeyboardAvoidingView>
      </PremiumAppShell>
    );
  }

  if (done) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <View style={styles.completeBadge}>
            <Text variant="subtle" style={styles.completeBadgeText}>
              {locale === "ko" ? "완료" : "DONE"}
            </Text>
          </View>
          <Text variant="heading" style={{ marginTop: spacing.md, textAlign: "center" }}>
            {locale === "ko" ? "과거의 나 인터뷰를 마쳤어요" : "Past me complete"}
          </Text>
          <Text variant="body" color="textMuted" style={{ textAlign: "center", marginTop: spacing.sm }}>
            {locale === "ko"
              ? `${questions.length}개의 답변이 페르소나 모델을 합성할 준비가 됐어요.`
              : `${questions.length} answers are ready to synthesize your persona model.`}
          </Text>
          <View style={styles.actions}>
            <Button
              label={locale === "ko" ? "페르소나 보기" : "View persona"}
              variant="primary"
              onPress={() => router.replace("/persona")}
            />
            <Button
              label={locale === "ko" ? "별가루 담기로 돌아가기" : "Back to capture"}
              variant="secondary"
              onPress={() => router.replace("/capture")}
            />
          </View>
        </View>
        {/* 모모 appears briefly to file the finished interview (companion pack §3) */}
        {companion.moment ? (
          <CompanionMoment moment={companion.moment} style={styles.companionFlash} />
        ) : null}
      </PremiumAppShell>
    );
  }

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
<ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {index === 0 ? (
          <View style={styles.introCard}>
            <Text variant="caption" color="brand" style={{ letterSpacing: 0 }}>
              {locale === "ko" ? "과거의 나: 자기 인터뷰" : "Past me: self interview"}
            </Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: 4, lineHeight: 18 }}>
              {locale === "ko"
                ? "Big Five · 애착이론 · 자기결정성 이론에 기반한 질문들. 정답은 없어요. 답이 쌓일수록 자기 모델의 패턴이 더 또렷해집니다."
                : "Questions grounded in Big Five, Attachment Theory, and Self-Determination Theory. No right answer; the more you answer, the clearer the patterns in your self-model become."}
            </Text>
          </View>
        ) : null}
        <View style={styles.progressWrap}>
          <Text variant="caption" color="brand">
            {locale === "ko" ? `질문 ${index + 1} / ${questions.length}` : `Question ${index + 1} / ${questions.length}`}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((index + 1) / questions.length) * 100}%` }]} />
          </View>
          <View style={styles.progressDots}>
            {questions.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i < index && styles.progressDotDone,
                  i === index && styles.progressDotCurrent,
                ]}
              />
            ))}
          </View>
        </View>
        <View style={styles.questionCard}>
          {/* The internal framework id (e.g. big_five:openness) is intentionally
              NOT shown — it is analysis metadata the user doesn't care about
              (2026-06-02 directive). It still rides on the saved record's tags. */}
          <Text variant="heading">{current?.prompt[locale]}</Text>
        </View>
        <Input
          value={answer}
          onChangeText={setAnswer}
          placeholder={locale === "ko" ? "솔직하게 적어주세요." : "Be honest with yourself."}
          multiline
          numberOfLines={6}
          style={styles.textarea}
        />
        <View style={styles.charCountRow}>
          <Text variant="subtle" color="textSubtle">
            {locale === "ko"
              ? answer.trim().length < 40
                ? "조금만 더 길게 적어볼까요"
                : "충분해요"
              : answer.trim().length < 40
                ? "A few more words help"
                : "Looks good"}
          </Text>
          <Text variant="subtle" color="textSubtle">
            {answer.length} / 2000
          </Text>
        </View>
        <Button
          label={
            index + 1 >= questions.length
              ? locale === "ko"
                ? "마무리"
                : "Finish"
              : locale === "ko"
                ? "다음 질문"
                : "Next question"
          }
          variant="primary"
          onPress={handleNext}
          disabled={!answer.trim() || submitting}
          loading={submitting}
        />
        <Button
          label={locale === "ko" ? "나중에 하기" : "Continue later"}
          variant="secondary"
          onPress={() => router.replace("/capture")}
        />
      </ScrollView>
</KeyboardAvoidingView>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}

      <PremiumModal
        visible={exitConfirmOpen}
        onClose={() => setExitConfirmOpen(false)}
        accessibilityLabel={locale === "ko" ? "진단 종료 안내" : "Exit audit notice"}
      >
        <Text variant="heading">
          {locale === "ko" ? "진단을 종료할까요?" : "Exit audit?"}
        </Text>
        <Text variant="body" color="textMuted" style={{ marginVertical: spacing.sm, lineHeight: 21 }}>
          {locale === "ko"
            ? "정말 가치관 진단을 종료하시겠습니까? 작성 중이던 답변이 저장되지 않고 사라집니다."
            : "Are you sure you want to exit? Your progress will not be saved."}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={locale === "ko" ? "취소" : "Cancel"}
            variant="secondary"
            onPress={() => setExitConfirmOpen(false)}
            style={{ flex: 1 }}
            accessibilityHint={locale === "ko" ? "진단을 계속 진행합니다." : "Continue the audit."}
          />
          <Button
            label={locale === "ko" ? "종료하기" : "Exit"}
            variant="primary"
            onPress={() => {
              setExitConfirmOpen(false);
              setPeriod(null);
              setIndex(0);
              setAnswer("");
            }}
            style={{ flex: 1 }}
            accessibilityHint={locale === "ko" ? "진단을 종료하고 질문 선택 화면으로 돌아갑니다." : "Exit the audit and return to selection."}
          />
        </View>
      </PremiumModal>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  companionFlash: { position: "absolute", bottom: 40, right: 20 },
  actions: { width: "100%", gap: spacing.md, marginTop: spacing.xl },
  questionCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  textarea: { minHeight: 140, textAlignVertical: "top", paddingTop: spacing.md },
  charCountRow: { flexDirection: "row", justifyContent: "space-between", marginTop: -spacing.xs },
  introCard: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    borderStartColor: semantic.brand,
    borderStartWidth: 3,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  progressWrap: { gap: spacing.xs },
  progressTrack: {
    height: 4,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: semantic.brand },
  progressDots: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  progressDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.surfaceAlt },
  progressDotDone: { backgroundColor: semantic.brand, opacity: 0.5 },
  progressDotCurrent: { backgroundColor: semantic.brand, transform: [{ scale: 1.3 }] },
  toastWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    alignItems: "stretch",
  },
  completeBadge: {
    backgroundColor: semantic.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  completeBadgeText: {
    color: semantic.text,
    fontWeight: "700",
    letterSpacing: 0,
    fontSize: 12,
  },
});

// Deep-space 일·성장 (Values/Domain): counts the user's real life-audit answers
// by framework family and feeds ValuesLensView. Empty/loading/error are honest
// states — no hardcoded "142 pieces" mock survives here.
function AuditDeepSpace() {
  const { i18n } = useTranslation();
  const isKo = i18n.language === "ko";
  const { userId, loading } = useAuth();
  const [domains, setDomains] = useState<ValuesDomain[] | null | undefined>(undefined);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setDomains(null);
      setHasError(false);
      return;
    }
    let cancelled = false;
    setHasError(false);
    setDomains(undefined); // undefined drives the loading state in ValuesLensView
    getSupabaseClient()
      .from("records")
      .select("tags")
      .eq("user_id", userId)
      .eq("kind", "audit_response")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setDomains(null);
          setHasError(true);
          return;
        }
        // Each audit answer is tagged ["life_audit", "<family>:<facet>"]. Tally
        // by family prefix; only families with a friendly label are surfaced.
        const counts = new Map<string, number>();
        for (const row of (data ?? []) as { tags: string[] | null }[]) {
          for (const tag of row.tags ?? []) {
            const family = tag.includes(":") ? tag.split(":")[0] : "";
            if (DOMAIN_LABELS[family]) counts.set(family, (counts.get(family) ?? 0) + 1);
          }
        }
        const order = Object.keys(DOMAIN_LABELS);
        const next: ValuesDomain[] = [...counts.entries()]
          .map(([key, count]) => ({ key, label: DOMAIN_LABELS[key][isKo ? "ko" : "en"], count }))
          .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));
        setDomains(next);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading, isKo, reloadKey]);

  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={isKo ? "성장 · 과거의 나" : "Growth · Past me"}
      onBack={() => router.back()}
    >
      {/* "데이터 추가" opens the open-ended interview that feeds domain piece
          counts (the audit period-selector screener is the legacy-only flow;
          routing back to /audit here would loop the deep-space lens). */}
      <ValuesLensView
        domains={hasError ? [] : domains}
        loading={!hasError && domains === undefined}
        hasError={hasError}
        isKo={isKo}
        onAddData={() => router.push("/interview")}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    </DeepSpaceScreen>
  );
}

export default function Audit() {
  if (isDeepSpaceUI()) return <AuditDeepSpace />;
  return <AuditLegacy />;
}
