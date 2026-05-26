// Aggregate insights from the user's records. A "what have I been writing
// about lately?" panopticon that surfaces patterns without re-running the
// LLM each time.

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { computeInsights, type InsightsResult } from "@/lib/journal/insights";
import { AppNav } from "@/components/ui/AppNav";

export default function Insights() {
  const { i18n } = useTranslation();
  const { userId, loading: authLoading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<InsightsResult | null>(null);

  async function load() {
    if (!userId) return;
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("records")
        .select("id, created_at, topic, conclusion, tags, body")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setInsights(computeInsights(data ?? []));
    } catch (e) {
      Alert.alert(locale === "ko" ? "로드 실패" : "Load failed", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    void load();
  }, [userId]);

  if (authLoading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      </Screen>
    );
  }

  if (!insights || insights.recordCount === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text variant="heading">
            {locale === "ko" ? "아직 인사이트가 없어요" : "No insights yet"}
          </Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            {locale === "ko"
              ? "몇 일치 일기가 쌓이면 패턴이 보이기 시작해요."
              : "Patterns emerge after a few days of journaling."}
          </Text>
          <Link href="/journal" asChild>
            <Button label={locale === "ko" ? "일기 쓰러 가기" : "Go to journal"} variant="primary" />
          </Link>
        </View>
      </Screen>
    );
  }

  const i = insights;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={semantic.brand}
          />
        }
      >
        <View style={styles.header}>
          <Text variant="caption" color="brand">
            2nd-Brain
          </Text>
          <Text variant="heading">{locale === "ko" ? "인사이트" : "Insights"}</Text>
          <Text variant="body" color="textMuted">
            {locale === "ko"
              ? "최근 기록에서 자동으로 추출한 패턴이에요. AI 없이 즉시 계산됩니다."
              : "Auto-extracted patterns across your recent entries. Computed instantly, no LLM call."}
          </Text>
        </View>

        <View style={styles.topRow}>
          <View style={styles.statBlock}>
            <Text variant="caption" color="textSubtle">
              {locale === "ko" ? "총 기록" : "Total entries"}
            </Text>
            <Text variant="heading">{i.recordCount}</Text>
            <Text variant="subtle" color="textSubtle">
              {locale === "ko" ? `${i.daySpan}일에 걸쳐` : `over ${i.daySpan} day${i.daySpan === 1 ? "" : "s"}`}
            </Text>
          </View>
          <View style={styles.statBlock}>
            <Text variant="caption" color="textSubtle">
              {locale === "ko" ? "평균 길이" : "Avg length"}
            </Text>
            <Text variant="heading">{i.avgBodyChars}</Text>
            <Text variant="subtle" color="textSubtle">
              {locale === "ko" ? "자 / 기록" : "chars/entry"}
            </Text>
          </View>
        </View>

        {i.byWeek.length > 0 ? (
          <View style={styles.card}>
            <Text variant="caption" color="brand" style={styles.cardEyebrow}>
              {locale === "ko" ? "주간 활동" : "Weekly activity"}
            </Text>
            {i.byWeek.map((w) => (
              <View key={w.week} style={styles.barRow}>
                <Text variant="subtle" color="textSubtle" style={{ width: 86 }}>
                  {w.week}
                </Text>
                <View style={styles.barOuter}>
                  <View
                    style={[
                      styles.barInner,
                      { width: `${Math.min(100, (w.count / Math.max(...i.byWeek.map((x) => x.count))) * 100)}%` },
                    ]}
                  />
                </View>
                <Text variant="subtle" color="textMuted" style={{ width: 30, textAlign: "right" }}>
                  {w.count}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {i.topTopics.length > 0 ? (
          <View style={styles.card}>
            <Text variant="caption" color="brand" style={styles.cardEyebrow}>
              {locale === "ko" ? "자주 다룬 주제" : "Recurring topics"}
            </Text>
            {i.topTopics.map((t) => (
              <View key={t.topic} style={styles.kvRow}>
                <Text variant="body">{t.topic}</Text>
                <Text variant="subtle" color="textMuted">
                  {locale === "ko" ? `${t.count}회` : `${t.count}×`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {i.topTags.length > 0 ? (
          <View style={styles.card}>
            <Text variant="caption" color="brand" style={styles.cardEyebrow}>
              {locale === "ko" ? "자주 쓰인 태그" : "Top tags"}
            </Text>
            <Text variant="body" color="textMuted">
              {i.topTags.map((t) => `#${t.tag} (${t.count})`).join("  ")}
            </Text>
          </View>
        ) : null}

        {i.recentConclusions.length > 0 ? (
          <View style={styles.card}>
            <Text variant="caption" color="brand" style={styles.cardEyebrow}>
              {locale === "ko" ? "최근 결론" : "Recent conclusions"}
            </Text>
            {i.recentConclusions.map((c, idx) => (
              <View key={idx} style={styles.conclusionRow}>
                <Text variant="subtle" color="textSubtle">
                  {new Date(c.created_at).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
                <Text variant="body" color="textMuted" style={{ flex: 1 }} selectable>
                  {c.conclusion}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <AppNav locale={locale} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.xs },
  topRow: { flexDirection: "row", gap: spacing.md },
  statBlock: {
    flex: 1,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
  },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftColor: semantic.brand,
    borderLeftWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardEyebrow: { letterSpacing: 1 },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barOuter: { flex: 1, height: 12, backgroundColor: semantic.surfaceAlt, borderRadius: 6, overflow: "hidden" },
  barInner: { height: 12, backgroundColor: semantic.brand },
  kvRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  conclusionRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  actions: { gap: spacing.sm },
});
