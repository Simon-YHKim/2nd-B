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
import { AppNav } from "@/components/ui/AppNav";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DrillProgress } from "@/components/ui/DrillProgress";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
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

const SOFT_CAP = 50;

export default function Interview() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [period, setPeriod] = useState<LifePeriod | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [coverage, setCoverage] = useState<Coverage>(emptyCoverage());
  const [pendingLayer, setPendingLayer] = useState<DrillLayer>("fact");
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);
  const [completionAcknowledged, setCompletionAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (turns.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [turns.length]);

  if (loading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

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
    if (userCount >= SOFT_CAP) {
      setDone(true);
      return;
    }

    setThinking(true);
    try {
      const probe = await nextProbe(userId, locale, period, updatedTurns, updatedCoverage);
      setTurns((prev) => [
        ...prev,
        { role: "interviewer", text: probe.question, period, layer: probe.layer },
      ]);
      setPendingLayer(probe.layer);
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
      Alert.alert(
        locale === "ko" ? "저장됐어요" : "Saved",
        locale === "ko" ? "/persona 에서 다른 기록과 함께 합산됩니다." : "Combined with other records on /persona.",
      );
      router.replace("/persona");
    } catch (e) {
      Alert.alert(locale === "ko" ? "저장 실패" : "Save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const userAnswers = turns.filter((t) => t.role === "user").length;
  const periodComplete = period !== null && isPeriodComplete(coverage, period);
  const shouldSuggestWrap = periodComplete && !completionAcknowledged && !done;

  if (period === null) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text variant="caption" color="brand">2nd-Brain · Interview</Text>
            <Text variant="heading">
              {locale === "ko" ? "드릴 인터뷰" : "Drill interview"}
            </Text>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "한 시기를 골라서 깊게 들어갑니다. 인터뷰어가 사실 → 감정 → 의미 → 믿음 → 울림 다섯 층을 한 단계씩 안내해요. 진단·해석은 하지 않고, 듣는 데만 집중합니다. 20턴 제한 없이, 충분한 깊이에 도달하면 마무리 신호를 드려요."
                : "Pick a life period and drill in. The interviewer guides you across five layers: fact → feeling → meaning → belief → echo. It doesn't diagnose or interpret — just listens. No 20-turn hard cap; we'll flag when you've reached sufficient depth."}
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
          <AppNav locale={locale} />
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
            {locale === "ko" ? `${userAnswers}턴 · 다음: ${LAYER_LABEL.ko[pendingLayer]}` : `${userAnswers} turns · next: ${LAYER_LABEL.en[pendingLayer]}`}
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

        {shouldSuggestWrap ? (
          <View style={styles.completionBanner}>
            <Text variant="caption" color="brand" style={{ letterSpacing: 1 }}>
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
                variant="secondary"
                onPress={() => setCompletionAcknowledged(true)}
              />
            </View>
          </View>
        ) : null}

        <ScrollView ref={scrollRef} contentContainerStyle={styles.chatScroll}>
          {turns.map((t, i) => (
            <View key={i} style={[styles.bubble, t.role === "interviewer" ? styles.qBubble : styles.aBubble]}>
              <View style={styles.bubbleHeader}>
                <Text variant="subtle" color={t.role === "interviewer" ? "brand" : "textSubtle"} style={{ letterSpacing: 1 }}>
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

        {done ? (
          <View style={styles.footer}>
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
                label={locale === "ko" ? "그만하기" : "Stop"}
                variant="secondary"
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.sm },
  periodGrid: { gap: spacing.sm, marginVertical: spacing.md },
  periodCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
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
  layerTag: { fontFamily: "Menlo", fontSize: 10, letterSpacing: 0.5 },
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
});
