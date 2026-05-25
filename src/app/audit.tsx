import { useState } from "react";
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { semantic, spacing, radii } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { questionsForPeriod } from "@/lib/audit/questions";
import { createRecord } from "@/lib/records/create";

export default function Audit() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const questions = questionsForPeriod("current");

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      </Screen>
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
        kind: "audit_response",
        body: answer.trim(),
        prompt: current.prompt[locale],
        auditPeriod: "current",
      });
      setAnswer("");
      if (index + 1 >= questions.length) {
        setDone(true);
      } else {
        setIndex(index + 1);
      }
    } catch (e) {
      Alert.alert("Save failed", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text variant="heading">
            {locale === "ko" ? "라이프 오딧 완료" : "Audit complete"}
          </Text>
          <Text variant="body" color="textMuted" style={{ textAlign: "center", marginTop: spacing.md }}>
            {locale === "ko"
              ? "이제 페르소나 카드를 생성할 수 있어요."
              : "You can now generate your persona card."}
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
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="caption" color="brand">
          {locale === "ko" ? `질문 ${index + 1} / ${questions.length}` : `Question ${index + 1} / ${questions.length}`}
        </Text>
        <View style={styles.questionCard}>
          <Text variant="heading">{current?.prompt[locale]}</Text>
          <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
            {locale === "ko" ? `프레임워크: ${current?.framework}` : `Framework: ${current?.framework}`}
          </Text>
        </View>
        <Input
          value={answer}
          onChangeText={setAnswer}
          placeholder={locale === "ko" ? "솔직하게 적어주세요." : "Be honest with yourself."}
          multiline
          numberOfLines={6}
          style={styles.textarea}
        />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
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
});
