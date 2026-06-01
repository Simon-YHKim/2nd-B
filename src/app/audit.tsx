import { useState } from "react";
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { semantic, spacing, radii } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { questionsForPeriod, type AuditPeriod } from "@/lib/audit/questions";
import { createRecord } from "@/lib/records/create";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";

const PERIOD_OPTIONS: { id: AuditPeriod; label: { en: string; ko: string } }[] = [
  { id: "current", label: { en: "Right now", ko: "지금 이 시기" } },
  { id: "20s", label: { en: "Your 20s", ko: "20대" } },
  { id: "teens", label: { en: "Your teens", ko: "10대" } },
];

export default function Audit() {
  const { i18n } = useTranslation();
  const { userId, loading, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [period, setPeriod] = useState<AuditPeriod | null>(null);
  const questions = period ? questionsForPeriod(period) : [];

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const companion = useCompanionMoment();

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

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
      Alert.alert("Save failed", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (period === null) {
    return (
      <PremiumAppShell>
        <ScrollView contentContainerStyle={styles.scroll}>
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
              label={locale === "ko" ? "일기로 돌아가기" : "Back to journal"}
              variant="secondary"
              onPress={() => router.replace("/journal")}
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
      <ScrollView contentContainerStyle={styles.scroll}>
        {index === 0 ? (
          <View style={styles.introCard}>
            <Text variant="caption" color="brand" style={{ letterSpacing: 0 }}>
              {locale === "ko" ? "과거의 나: 자기 인터뷰" : "Past me: self interview"}
            </Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: 4, lineHeight: 18 }}>
              {locale === "ko"
                ? "Big Five · 애착이론 · 자기결정성 이론에 기반한 질문들. 정답은 없고, 솔직하게 적은 만큼 페르소나가 정확해집니다."
                : "Questions grounded in Big Five, Attachment Theory, and Self-Determination Theory. No right answer; the more honest you are, the sharper your Persona becomes."}
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
          onPress={() => router.replace("/journal")}
        />
      </ScrollView>
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
    borderLeftColor: semantic.brand,
    borderLeftWidth: 3,
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
    fontSize: 10,
  },
});
