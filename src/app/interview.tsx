// Twenty-questions life-period interview. Separate from /audit (which
// is a fixed framework-anchored screener) — this is a free-form,
// LLM-driven progressive probe that goes deeper each turn.
//
// Per user directive: '라이프 오딧 너무 빈약해. 연령별 속마음을 드러내게
// 하는 스무고개 같은 질문을 계속 던지라고 했었을텐데?'

import { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import {
  PERIOD_LABEL,
  nextProbe,
  seedQuestion,
  type InterviewTurn,
  type LifePeriod,
} from "@/lib/interview/probe";

const MAX_TURNS = 20;

export default function Interview() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [period, setPeriod] = useState<LifePeriod | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (turns.length > 0) {
      // scroll-to-bottom on new turn
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [turns.length]);

  if (loading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  function startInterview(p: LifePeriod) {
    setPeriod(p);
    setTurns([{ role: "interviewer", text: seedQuestion(p, locale) }]);
  }

  async function handleAnswer() {
    if (!userId || !period || !draft.trim() || thinking) return;
    const userTurn: InterviewTurn = { role: "user", text: draft.trim() };
    const updated = [...turns, userTurn];
    setTurns(updated);
    setDraft("");
    const userCount = updated.filter((t) => t.role === "user").length;
    if (userCount >= MAX_TURNS) {
      setDone(true);
      return;
    }
    setThinking(true);
    try {
      const probe = await nextProbe(userId, locale, period, updated);
      setTurns((prev) => [...prev, { role: "interviewer", text: probe.question }]);
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "다음 질문 실패" : "Next probe failed",
        (e as Error).message,
      );
    } finally {
      setThinking(false);
    }
  }

  async function handleSave() {
    if (!userId || !period || turns.length === 0) return;
    setSaving(true);
    try {
      const transcript = turns
        .map((t) => (t.role === "interviewer" ? `Q: ${t.text}` : `A: ${t.text}`))
        .join("\n\n");
      const userCount = turns.filter((t) => t.role === "user").length;
      await createRecord({
        userId,
        locale,
        kind: "audit_response",
        body: transcript,
        topic: locale === "ko"
          ? `스무고개 인터뷰 · ${PERIOD_LABEL.ko[period]}`
          : `Interview · ${PERIOD_LABEL.en[period]}`,
        summary: locale === "ko"
          ? `${userCount}개의 답변을 통한 ${PERIOD_LABEL.ko[period]} 깊이 탐색`
          : `${userCount}-answer depth probe of ${PERIOD_LABEL.en[period]}`,
        tags: ["interview", "life_audit", `period-${period}`],
        auditPeriod: period === "current" ? "current" : "past",
        withFollowup: false,
      });
      Alert.alert(locale === "ko" ? "저장됐어요" : "Saved", locale === "ko" ? "/persona 에서 다른 기록과 함께 합산됩니다." : "Combined with other records on /persona.");
      router.replace("/persona");
    } catch (e) {
      Alert.alert(locale === "ko" ? "저장 실패" : "Save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const userAnswers = turns.filter((t) => t.role === "user").length;

  if (period === null) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text variant="caption" color="brand">2nd-Brain · Interview</Text>
            <Text variant="heading">
              {locale === "ko" ? "스무고개 인터뷰" : "Twenty-questions interview"}
            </Text>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "한 시기를 골라 인터뷰를 시작합니다. AI 인터뷰어가 한 번에 한 질문씩, 답변에 직접 이어붙여 점점 깊이 들어갑니다. 진단·해석은 하지 않고, 듣는 데만 집중해요. 최대 20개의 답까지."
                : "Pick a life period. The AI interviewer asks one question at a time, anchored on your last answer, going gradually deeper. It doesn't diagnose or interpret — just listens. Up to 20 of your answers."}
            </Text>
          </View>
          <View style={styles.periodGrid}>
            {(["childhood", "teens", "twenties", "thirties", "current"] as LifePeriod[]).map((p) => (
              <Pressable key={p} onPress={() => startInterview(p)} style={styles.periodCard} hitSlop={4}>
                <Text variant="caption" color="brand" style={{ letterSpacing: 1 }}>
                  {PERIOD_LABEL[locale][p]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button
            label={locale === "ko" ? "뒤로" : "Back"}
            variant="secondary"
            onPress={() => router.back()}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.topBar}>
          <Text variant="caption" color="brand" style={{ letterSpacing: 1 }}>
            {PERIOD_LABEL[locale][period]}
          </Text>
          <Text variant="subtle" color="textSubtle">
            {locale === "ko" ? `${userAnswers}/${MAX_TURNS}` : `${userAnswers}/${MAX_TURNS}`}
          </Text>
        </View>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.chatScroll}>
          {turns.map((t, i) => (
            <View key={i} style={[styles.bubble, t.role === "interviewer" ? styles.qBubble : styles.aBubble]}>
              <Text variant="subtle" color={t.role === "interviewer" ? "brand" : "textSubtle"} style={{ letterSpacing: 1 }}>
                {t.role === "interviewer" ? (locale === "ko" ? "질문" : "Q") : (locale === "ko" ? "답변" : "A")}
              </Text>
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

        {done ? (
          <View style={styles.footer}>
            <Text variant="caption" color="brand">
              {locale === "ko" ? "20개 답변 모두 수집됨" : "Reached 20 answers"}
            </Text>
            <Button
              label={locale === "ko" ? "저장하고 페르소나에 반영" : "Save & feed Persona"}
              variant="primary"
              onPress={handleSave}
              loading={saving}
            />
          </View>
        ) : (
          <View style={styles.footer}>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder={locale === "ko" ? "솔직하게 답해 주세요." : "Be honest with yourself."}
              multiline
              numberOfLines={3}
            />
            <View style={styles.footerActions}>
              <Button
                label={locale === "ko" ? "답변" : "Answer"}
                variant="primary"
                onPress={handleAnswer}
                disabled={!draft.trim() || thinking}
                loading={thinking}
              />
              <Button
                label={locale === "ko" ? "여기서 마무리" : "End here"}
                variant="secondary"
                onPress={() => setDone(true)}
                disabled={userAnswers === 0 || thinking}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs },
  periodGrid: { gap: spacing.sm },
  periodCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomColor: semantic.border,
    borderBottomWidth: 1,
    marginBottom: spacing.sm,
  },
  chatScroll: { paddingBottom: spacing.lg, gap: spacing.sm },
  bubble: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  qBubble: { borderLeftColor: semantic.brand, borderLeftWidth: 3 },
  aBubble: { backgroundColor: semantic.surfaceAlt, alignSelf: "flex-end", maxWidth: "92%" },
  thinkingRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", padding: spacing.sm },
  footer: { gap: spacing.sm, paddingTop: spacing.sm, borderTopColor: semantic.border, borderTopWidth: 1 },
  footerActions: { flexDirection: "row", gap: spacing.sm },
});
