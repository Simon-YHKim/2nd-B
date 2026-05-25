import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert, Share } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { buildPersona, type PersonaCard } from "@/lib/persona/build";

export default function Persona() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const [persona, setPersona] = useState<PersonaCard | null>(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setBuilding(true);
    buildPersona(userId, locale)
      .then(setPersona)
      .catch((e) => Alert.alert("Persona failed", (e as Error).message))
      .finally(() => setBuilding(false));
  }, [userId, locale]);

  if (loading || building) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={semantic.brand} />
          <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.md }}>
            {locale === "ko" ? "당신의 페르소나를 합성하는 중..." : "Synthesizing your persona..."}
          </Text>
        </View>
      </Screen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (!persona) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text variant="caption" color="brand" style={{ letterSpacing: 1.5 }}>
            {locale === "ko" ? "페르소나 V1" : "PERSONA V1"}
          </Text>
          <Text variant="heading" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            {locale === "ko" ? "아직 합성할 데이터가 부족해요" : "Not enough data to synthesize yet"}
          </Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            {locale === "ko"
              ? "5문항 라이프 오딧을 마치면 자기 모델 v1이 만들어집니다."
              : "Complete the 5-question life audit to generate self-model v1."}
          </Text>
          <View style={styles.emptyActions}>
            <Button
              label={locale === "ko" ? "오딧 시작" : "Start the audit"}
              variant="primary"
              onPress={() => router.replace("/audit")}
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

  async function handleExport() {
    if (!persona) return;
    try {
      await Share.share({ message: persona.markdownExport, title: "2nd-Brain Persona" });
    } catch (e) {
      Alert.alert("Export failed", (e as Error).message);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <Text variant="caption" color="brand">
            {locale === "ko" ? "페르소나 v1" : "Persona v1"}
          </Text>
          <Text variant="heading">
            {locale === "ko" ? "자기 모델 (Big Five 근사)" : "Self-model (Big Five proxy)"}
          </Text>
        </View>

        <View style={styles.traitsCard}>
          {Object.entries(persona.traits).map(([k, v]) => {
            const label = TRAIT_LABELS[locale][k as keyof typeof TRAIT_LABELS["en"]] ?? k;
            return (
              <View key={k} style={styles.traitRow}>
                <Text variant="body" style={{ width: 160 }}>{label}</Text>
                <View style={styles.barOuter}>
                  <View style={[styles.barInner, { width: `${v * 100}%` }]} />
                </View>
                <Text variant="subtle" color="textMuted" style={{ width: 40, textAlign: "right" }}>
                  {Math.round(v * 100)}
                </Text>
              </View>
            );
          })}
          <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.sm }}>
            {locale === "ko"
              ? "Big Five 근사치 (v1). 진단이 아니며, 패턴 관찰입니다."
              : "Big Five proxy (v1). Not a diagnosis — observed patterns only."}
          </Text>
        </View>

        <View style={styles.narrativeCard}>
          <Text variant="caption" color="textMuted">
            {locale === "ko" ? "AI 요약" : "AI summary"}
          </Text>
          <Text variant="body" style={{ marginTop: spacing.xs }}>{persona.patterns.summary}</Text>
        </View>

        {Object.entries(persona.patterns).filter(([k]) => k.startsWith("top_")).length > 0 ? (
          <View style={styles.patternsCard}>
            <Text variant="caption" color="textMuted">
              {locale === "ko" ? "관찰된 패턴 (최근)" : "Observed patterns (recent)"}
            </Text>
            {Object.entries(persona.patterns)
              .filter(([k]) => k.startsWith("top_"))
              .map(([k, count]) => {
                const kind = k.replace(/^top_/, "");
                return (
                  <View key={k} style={styles.patternRow}>
                    <View style={styles.patternDot} />
                    <Text variant="body" style={{ flex: 1 }}>{kind}</Text>
                    <Text variant="subtle" color="textMuted">
                      {locale === "ko" ? `${count}회` : `${count}×`}
                    </Text>
                  </View>
                );
              })}
            <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
              {locale === "ko"
                ? "최근 기록에서 가장 자주 다룬 주제예요. 단정이 아닌 관찰입니다."
                : "Themes you've returned to most often in recent entries. Observation, not verdict."}
            </Text>
          </View>
        ) : null}

        {persona.values.length > 0 ? (
          <View style={styles.valuesCard}>
            <Text variant="caption" color="textMuted">
              {locale === "ko" ? "관련 프레임워크" : "Relevant frameworks"}
            </Text>
            <Text variant="body" style={{ marginTop: spacing.xs }}>{persona.values.join(" · ")}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={locale === "ko" ? "Markdown으로 내보내기" : "Export as Markdown"}
            variant="primary"
            onPress={handleExport}
          />
          <Button
            label={locale === "ko" ? "일기로 돌아가기" : "Back to journal"}
            variant="secondary"
            onPress={() => router.replace("/journal")}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

// Big Five trait labels translated for the persona card. Keys match
// the PersonaTraits TypeScript shape from lib/persona/build.ts.
const TRAIT_LABELS: Record<"en" | "ko", Record<"openness" | "conscientiousness" | "extraversion" | "agreeableness" | "neuroticism", string>> = {
  en: {
    openness: "Openness",
    conscientiousness: "Conscientiousness",
    extraversion: "Extraversion",
    agreeableness: "Agreeableness",
    neuroticism: "Neuroticism",
  },
  ko: {
    openness: "개방성",
    conscientiousness: "성실성",
    extraversion: "외향성",
    agreeableness: "친화성",
    neuroticism: "신경성",
  },
};

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  traitsCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  traitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barOuter: {
    flex: 1,
    height: 8,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  barInner: { height: "100%", backgroundColor: semantic.brand },
  narrativeCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  valuesCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  patternsCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  patternRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 2 },
  patternDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.brand },
  actions: { gap: spacing.md, marginTop: spacing.md },
  emptyActions: { gap: spacing.md, marginTop: spacing.xl, width: "100%", maxWidth: 320 },
});
