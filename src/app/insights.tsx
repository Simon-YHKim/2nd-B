// Aggregate insights from the user's records. A "what have I been writing
// about lately?" panopticon that surfaces patterns without re-running the
// LLM each time.

import { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { PremiumAppShell, PremiumErrorState, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { computeInsights, getWeekComparison, sourceToInsightRecord, type InsightRecord, type InsightSource, type InsightsResult } from "@/lib/journal/insights";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import { getSupabaseClient } from "@/lib/supabase/client";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { VILLAGE_UI } from "@/lib/village-ui";

export default function Insights() {
  const { t, i18n } = useTranslation("insights");
  const { userId, loading: authLoading } = useAuth();
  const dateLocale = i18n.language === "ko" ? "ko-KR" : "en-US";

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
  useFocusRefetch(() => {
    void load();
  }, Boolean(userId));

  if (authLoading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
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
            title={t("error.title")}
            body={t("error.body")}
            retryLabel={t("error.retry")}
            onRetry={() => {
              void load();
            }}
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
            eyebrow={t("empty.hero.eyebrow")}
            title={t("empty.hero.title")}
            subtitle={t("empty.hero.subtitle")}
            island={VILLAGE_UI.taste.island}
            worker={VILLAGE_UI.taste.worker}
            accent={VILLAGE_UI.taste.accent}
            speech={t("empty.hero.speech")}
            primaryAction={{
              label: t("empty.hero.action"),
              onPress: () => router.push("/capture"),
            }}
          />
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
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={VILLAGE_UI.taste.island}
          worker={VILLAGE_UI.taste.worker}
          accent={VILLAGE_UI.taste.accent}
          speech={t("hero.speech")}
          primaryAction={{
            label: t("hero.action"),
            onPress: () => router.push("/capture"),
          }}
        />

        <View style={styles.topRow}>
          <View style={styles.statBlock}>
            <Text variant="caption" color="textSubtle">
              {t("stats.total.label")}
            </Text>
            <Text variant="heading">{i.recordCount}</Text>
            <Text variant="subtle" color="textSubtle">
              {t("stats.total.daySpan", { count: i.daySpan, plural: i.daySpan === 1 ? "" : "s" })}
            </Text>
          </View>
          <View style={styles.statBlock}>
            <Text variant="caption" color="textSubtle">
              {t("stats.average.label")}
            </Text>
            <Text variant="heading">{i.avgBodyChars}</Text>
            <Text variant="subtle" color="textSubtle">
              {t("stats.average.unit")}
            </Text>
          </View>
        </View>

        {/* M4 retention: weekly report anchored to the CURRENT KST week, so
            a quiet week reads as an honest 0 (the nudge), never as last
            month relabeled. Pure aggregation — no model call. */}
        {(() => {
          const wc = getWeekComparison(i.byWeek);
          if (!wc) return null;
          return (
            <View style={styles.card}>
              <Text variant="caption" color="brand" style={styles.cardEyebrow}>
                {t("weeklyReport.eyebrow")}
              </Text>
              <View style={styles.weeklyRow}>
                <View style={styles.statBlock}>
                  <Text variant="caption" color="textSubtle">
                    {t("weeklyReport.thisWeekLabel")}
                  </Text>
                  <Text variant="heading">{wc.thisWeekCount}</Text>
                </View>
                <View style={styles.statBlock}>
                  <Text variant="caption" color="textSubtle">
                    {t("weeklyReport.lastWeekLabel")}
                  </Text>
                  <Text variant="heading">{wc.lastWeekCount}</Text>
                </View>
              </View>
              <Text variant="subtle" color={wc.delta > 0 ? "brand" : "textMuted"}>
                {wc.firstWeek
                  ? t("weeklyReport.firstWeek")
                  : wc.delta > 0
                    ? t("weeklyReport.deltaUp", { count: wc.delta })
                    : wc.delta < 0
                      ? t("weeklyReport.deltaDown", { count: Math.abs(wc.delta) })
                      : t("weeklyReport.deltaFlat")}
              </Text>
            </View>
          );
        })()}

        {i.byWeek.length > 0 ? (
          <View style={styles.card}>
            <Text variant="caption" color="brand" style={styles.cardEyebrow}>
              {t("sections.weekly")}
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
              {t("sections.topics")}
            </Text>
            {i.topTopics.map((topic) => (
              <View key={topic.topic} style={styles.kvRow}>
                <Text variant="body">{topic.topic}</Text>
                <Text variant="subtle" color="textMuted">
                  {t("topics.count", { count: topic.count })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {i.topTags.length > 0 ? (
          <View style={styles.card}>
            <Text variant="caption" color="brand" style={styles.cardEyebrow}>
              {t("sections.tags")}
            </Text>
            <Text variant="body" color="textMuted">
              {i.topTags.map((tag) => `#${tag.tag} (${tag.count})`).join("  ")}
            </Text>
          </View>
        ) : null}

        {i.recentConclusions.length > 0 ? (
          <View style={styles.card}>
            <Text variant="caption" color="brand" style={styles.cardEyebrow}>
              {t("sections.conclusions")}
            </Text>
            {i.recentConclusions.map((conclusion, idx) => (
              <View key={idx} style={styles.conclusionRow}>
                <Text variant="subtle" color="textSubtle">
                  {new Date(conclusion.created_at).toLocaleDateString(dateLocale, {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
                <Text variant="body" color="textMuted" style={{ flex: 1 }} selectable>
                  {conclusion.conclusion}
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
  weeklyRow: { flexDirection: "row", gap: spacing.md },
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
    borderStartColor: semantic.brand,
    borderStartWidth: 3,
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
