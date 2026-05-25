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
          <Text variant="body" color="textMuted">
            {locale === "ko" ? "데이터가 부족합니다." : "Not enough data yet."}
          </Text>
          <Button
            label={locale === "ko" ? "오딧 시작" : "Start audit"}
            variant="primary"
            onPress={() => router.replace("/audit")}
          />
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
          {Object.entries(persona.traits).map(([k, v]) => (
            <View key={k} style={styles.traitRow}>
              <Text variant="body" style={{ width: 160 }}>{k}</Text>
              <View style={styles.barOuter}>
                <View style={[styles.barInner, { width: `${v * 100}%` }]} />
              </View>
              <Text variant="subtle" color="textMuted" style={{ width: 40, textAlign: "right" }}>
                {Math.round(v * 100)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.narrativeCard}>
          <Text variant="caption" color="textMuted">
            {locale === "ko" ? "AI 요약" : "AI summary"}
          </Text>
          <Text variant="body" style={{ marginTop: spacing.xs }}>{persona.patterns.summary}</Text>
        </View>

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
  actions: { gap: spacing.md, marginTop: spacing.md },
});
