// Aggregate insights from the user's records. A "what have I been writing
// about lately?" panopticon that surfaces patterns without re-running the
// LLM each time.

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, ActivityIndicator, RefreshControl } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumErrorState, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { computeInsights, sourceToInsightRecord, type InsightRecord, type InsightSource, type InsightsResult } from "@/lib/journal/insights";
import { VILLAGE_UI } from "@/lib/village-ui";

export default function Insights() {
  const { i18n } = useTranslation();
  const { userId, loading: authLoading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<InsightsResult | null>(null);

  async function load() {
    if (!userId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const supabase = getSupabaseClient();
      // Insights must cover ALL saved evidence the user sees in /records, not
      // just journal `records`: non-journal Capture (memo/link/OCR/file) lands
      // in `sources`. Counting only records shows a false-empty state to a
      // source-only user (data-truth gate).
      const [recRes, srcRes] = await Promise.all([
        supabase
          .from("records")
          .select("id, created_at, topic, conclusion, tags, body")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase
          .from("sources")
          .select("id, captured_at, title, tags")
          .eq("user_id", userId)
          .order("captured_at", { ascending: true }),
      ]);
      if (recRes.error) throw recRes.error;
      const recordRows = (recRes.data ?? []) as InsightRecord[];
      // Sources are best-effort: a sources-query failure should degrade to a
      // records-only view, never blank the whole screen.
      let sourceRows: InsightRecord[] = [];
      if (srcRes.error) {
        if (typeof console !== "undefined") console.warn("[insights] sources load failed; records only", srcRes.error.message);
      } else {
        sourceRows = ((srcRes.data ?? []) as InsightSource[]).map(sourceToInsightRecord);
      }
      setInsights(computeInsights([...recordRows, ...sourceRows]));
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[insights] load failed", (e as Error).message);
      setInsights(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    void load();
  }, [userId]);

  if (authLoading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "인사이트를 불러오는 중이에요…" : "Loading insights…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      </PremiumAppShell>
    );
  }

  if (loadError) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumErrorState
            title={locale === "ko" ? "인사이트를 불러오지 못했어요" : "Couldn't load insights"}
            body={
              locale === "ko"
                ? "잠시 연결이 흔들렸어요. 다시 시도하면 기록 흐름을 새로 계산할게요."
                : "The connection hiccuped for a moment. Try again to recompute your record flow."
            }
            retryLabel={locale === "ko" ? "다시 시도" : "Try again"}
            onRetry={() => { void load(); }}
          />
        </View>
      </PremiumAppShell>
    );
  }

  if (!insights || insights.recordCount === 0) {
    return (
      <PremiumAppShell>
        <ScrollView contentContainerStyle={styles.scroll}>
          <SceneHero
            eyebrow={locale === "ko" ? "11. 인사이트" : "11. Insights"}
            title={locale === "ko" ? "아직 뽑아낼 패턴이 작아요" : "Patterns are still small"}
            subtitle={locale === "ko" ? "며칠 치 기록이 쌓이면 흐름이 보여요" : "A few days of records will reveal the flow"}
            island={VILLAGE_UI.taste.island}
            worker={VILLAGE_UI.taste.worker}
            accent={VILLAGE_UI.taste.accent}
            speech={
              locale === "ko"
                ? "취향과 반복을 보려면 조각이 조금 더 필요해요. 오늘 하나 남겨볼까요?"
                : "I need a few more pieces to see taste and repetition. Leave one today?"
            }
            primaryAction={{
              label: locale === "ko" ? "조각 담기" : "Go to capture",
              onPress: () => router.push("/capture"),
            }}          />
        </ScrollView>
      </PremiumAppShell>
    );
  }

  const i = insights;

  return (
    <PremiumAppShell>
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
        <SceneHero
          eyebrow={locale === "ko" ? "11. 인사이트" : "11. Insights"}
          title={locale === "ko" ? "최근 기록의 흐름 보기" : "See the flow in recent records"}
          subtitle={locale === "ko" ? "기록에서 바로 계산" : "Computed directly from records"}
          island={VILLAGE_UI.taste.island}
          worker={VILLAGE_UI.taste.worker}
          accent={VILLAGE_UI.taste.accent}
          speech={
            locale === "ko"
              ? "반복되는 주제와 최근 결론을 모았어요. 끌리는 흐름을 같이 볼까요?"
              : "I gathered recurring topics and recent conclusions. Shall we trace the pattern?"
          }
          primaryAction={{
            label: locale === "ko" ? "오늘의 조각 남기기" : "Leave today's piece",
            onPress: () => router.push("/capture"),
          }}        />

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

      </ScrollView>
    </PremiumAppShell>
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
  cardEyebrow: { letterSpacing: 0 },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barOuter: { flex: 1, height: 12, backgroundColor: semantic.surfaceAlt, borderRadius: 6, overflow: "hidden" },
  barInner: { height: 12, backgroundColor: semantic.brand },
  kvRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  conclusionRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  actions: { gap: spacing.sm },
});
