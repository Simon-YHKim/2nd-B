// Brain Trinity — Simon's 4-area life-management system surfaced as a
// dashboard in the app. Per master blueprint reality-check §2:
//   "Brain Trinity 시스템: 본인 운영 중인 4영역 인생 관리 (건강/앱/뇌/재정)"
//
// Each domain is a tag filter over records. The dashboard aggregates:
//   - record count in this domain
//   - last entry date
//   - top conclusions / topics
//
// Pure derived view — no new schema. Tags `health`, `app`, `brain`,
// `finance` (canonical) are the four domains; users can also use
// `건강`, `앱`, `뇌`, `재정` and the trinity classifier normalizes.

import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, ActivityIndicator, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing, typography } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { VILLAGE_UI } from "@/lib/village-ui";

export type TrinityDomain = "health" | "app" | "brain" | "finance";

export const DOMAIN_TAGS: Record<TrinityDomain, string[]> = {
  health: ["health", "건강", "fitness", "sleep", "운동", "수면"],
  app: ["app", "앱", "project", "프로젝트", "side-project"],
  brain: ["brain", "뇌", "learning", "study", "study-log", "학습", "공부"],
  finance: ["finance", "재정", "money", "돈", "budget", "savings"],
};

export const DOMAIN_LABEL: Record<"en" | "ko", Record<TrinityDomain, string>> = {
  en: { health: "Health", app: "App", brain: "Brain", finance: "Finance" },
  ko: { health: "건강", app: "앱", brain: "뇌", finance: "재정" },
};

export const DOMAIN_ACCENT: Record<TrinityDomain, keyof typeof semantic> = {
  health: "zoneGreen",
  app: "brand",
  brain: "info",
  finance: "warning",
};

interface RecordLite {
  id: string;
  created_at: string;
  topic: string | null;
  conclusion: string | null;
  tags: string[];
}

interface DomainStats {
  count: number;
  lastEntry: string | null;
  topConclusions: string[];
  topTopics: string[];
}

function classifyDomain(tags: string[]): TrinityDomain | null {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    for (const domain of Object.keys(DOMAIN_TAGS) as TrinityDomain[]) {
      if (DOMAIN_TAGS[domain].some((t) => t.toLowerCase() === lower)) return domain;
    }
  }
  return null;
}

function computeStats(records: RecordLite[]): Record<TrinityDomain, DomainStats> {
  const stats: Record<TrinityDomain, DomainStats> = {
    health: { count: 0, lastEntry: null, topConclusions: [], topTopics: [] },
    app: { count: 0, lastEntry: null, topConclusions: [], topTopics: [] },
    brain: { count: 0, lastEntry: null, topConclusions: [], topTopics: [] },
    finance: { count: 0, lastEntry: null, topConclusions: [], topTopics: [] },
  };

  const conclusionsByDomain: Record<TrinityDomain, { conclusion: string; created_at: string }[]> = {
    health: [], app: [], brain: [], finance: [],
  };
  const topicsByDomain: Record<TrinityDomain, Map<string, number>> = {
    health: new Map(), app: new Map(), brain: new Map(), finance: new Map(),
  };

  for (const r of records) {
    const domain = classifyDomain(r.tags);
    if (!domain) continue;
    const s = stats[domain];
    s.count += 1;
    if (!s.lastEntry || r.created_at > s.lastEntry) s.lastEntry = r.created_at;
    if (r.conclusion && r.conclusion.length > 0) {
      conclusionsByDomain[domain].push({ conclusion: r.conclusion, created_at: r.created_at });
    }
    if (r.topic && r.topic.length > 0) {
      topicsByDomain[domain].set(r.topic, (topicsByDomain[domain].get(r.topic) ?? 0) + 1);
    }
  }

  for (const d of Object.keys(stats) as TrinityDomain[]) {
    stats[d].topConclusions = conclusionsByDomain[d]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 3)
      .map((c) => c.conclusion);
    stats[d].topTopics = [...topicsByDomain[d].entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
  }

  return stats;
}

export default function Trinity() {
  const { i18n } = useTranslation();
  const { userId, loading: authLoading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [records, setRecords] = useState<RecordLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadErrorOpen, setLoadErrorOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    void (async () => {
      // Trinity is tag-driven, but non-journal Capture saves tagged pieces into
      // `sources` — counting only `records` contradicts the screen's own "tag
      // #health in Capture" guidance (source-tag false-empty/undercount gate).
      const [recRes, srcRes] = await Promise.all([
        supabase
          .from("records")
          .select("id, created_at, topic, conclusion, tags")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("sources")
          .select("id, captured_at, title, tags")
          .eq("user_id", userId)
          .order("captured_at", { ascending: false })
          .limit(500),
      ]);
      if (recRes.error) {
        console.warn("[trinity] load records failed", recRes.error.message);
        setLoadErrorOpen(true);
      }
      const recRows = (recRes.data ?? []) as RecordLite[];
      // Sources best-effort: map tagged captured pieces into the classifier shape.
      let srcRows: RecordLite[] = [];
      if (srcRes.error) {
        console.warn("[trinity] load sources failed; records only", srcRes.error.message);
      } else {
        srcRows = ((srcRes.data ?? []) as { id: string; captured_at: string; title: string | null; tags: string[] | null }[]).map(
          (s) => ({ id: s.id, created_at: s.captured_at, topic: s.title, conclusion: null, tags: s.tags ?? [] }),
        );
      }
      setRecords([...recRows, ...srcRows]);
      setLoading(false);
    })();
  }, [userId, locale, reloadKey]);

  const stats = useMemo(() => computeStats(records), [records]);

  if (authLoading) {
    return (
      <PremiumAppShell>
        <View style={styles.shellCenter}>
          <PremiumLoadingState message={locale === "ko" ? "4영역을 불러오는 중이에요…" : "Loading trinity…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }

  const labels = DOMAIN_LABEL[locale];
  const total = Object.values(stats).reduce((s, d) => s + d.count, 0);

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={locale === "ko" ? "09. 4영역 관리" : "09. Brain Trinity"}
          title={locale === "ko" ? "생활의 네 영역을 밝히기" : "Light up four life areas"}
          subtitle={locale === "ko" ? "건강 · 앱 · 뇌 · 재정" : "Health · app · brain · finance"}
          island={VILLAGE_UI.work.island}
          worker={VILLAGE_UI.work.worker}
          accent={VILLAGE_UI.work.accent}
          speech={
            locale === "ko"
              ? "태그가 붙은 기록을 네 영역으로 나눴어요. 비어 있는 영역부터 살펴볼까요?"
              : "I grouped tagged records into four areas. Want to inspect the quietest one?"
          }
          primaryAction={{
            label: locale === "ko" ? "오늘의 조각 남기기" : "Leave today's piece",
            onPress: () => router.push("/capture"),
          }}        />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : total === 0 ? (
          <View style={styles.emptyCard}>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "이 4개 태그(health · app · brain · finance 또는 건강·앱·뇌·재정)가 붙은 기록이 없어요."
                : "No records tagged with the four domains (health · app · brain · finance) yet."}
            </Text>
            <Link href="/capture" asChild>
              <Pressable
                hitSlop={6}
                style={styles.emptyLink}
                accessibilityRole="link"
                accessibilityLabel={
                  locale === "ko" ? "캡처에서 도메인 태그 추가하기" : "Add domain tags in capture"
                }
              >
                <Text variant="caption" color="brand">
                  {locale === "ko" ? "조각 담기에서 #건강 같은 태그를 달아 보세요" : "Try adding tags like #health in capture"}
                </Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <View style={styles.grid}>
            {(["health", "app", "brain", "finance"] as TrinityDomain[]).map((d) => {
              const s = stats[d];
              const accent = DOMAIN_ACCENT[d];
              return (
                <View key={d} style={[styles.card, { borderLeftColor: semantic[accent] }]}>
                  <View style={styles.cardHead}>
                    <Text variant="caption" color={accent} style={styles.cardEyebrow}>
                      {labels[d]}
                    </Text>
                    <Text variant="heading" style={{ fontSize: typography.sizes.xl }}>
                      {s.count}
                    </Text>
                  </View>
                  <Text variant="subtle" color="textSubtle">
                    {s.lastEntry
                      ? locale === "ko"
                        ? `마지막 ${new Date(s.lastEntry).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}`
                        : `Last ${new Date(s.lastEntry).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : locale === "ko"
                        ? "기록 없음"
                        : "No entries"}
                  </Text>
                  {s.topTopics.length > 0 ? (
                    <View style={styles.cardSection}>
                      <Text variant="subtle" color="textSubtle">
                        {locale === "ko" ? "자주 다룬 주제" : "Recurring topics"}
                      </Text>
                      {s.topTopics.map((t, i) => (
                        <Text key={i} variant="subtle" color="textMuted" numberOfLines={1}>
                          · {t}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {s.topConclusions.length > 0 ? (
                    <View style={styles.cardSection}>
                      <Text variant="subtle" color="textSubtle">
                        {locale === "ko" ? "최근 결론" : "Recent conclusions"}
                      </Text>
                      {s.topConclusions.map((c, i) => (
                        <Text key={i} variant="subtle" color="textMuted" numberOfLines={2}>
                          · {c}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.tagGuide}>
          <Text variant="caption" color="textMuted" style={{ letterSpacing: 0 }}>
            {locale === "ko" ? "인식하는 태그" : "Recognized tags"}
          </Text>
          {(["health", "app", "brain", "finance"] as TrinityDomain[]).map((d) => (
            <Text key={d} variant="subtle" color="textSubtle">
              {labels[d]}: {DOMAIN_TAGS[d].map((t) => `#${t}`).join("  ")}
            </Text>
          ))}
        </View>

      </ScrollView>
      <PremiumModal
        visible={loadErrorOpen}
        onClose={() => setLoadErrorOpen(false)}
        accessibilityLabel={locale === "ko" ? "4영역 다시 불러오기 안내" : "Four-area reload notice"}
      >
        <Text variant="heading">
          {locale === "ko" ? "기록을 못 불러왔어요" : "Couldn't load records"}
        </Text>
        <Text variant="body" color="textMuted" style={styles.modalBody}>
          {locale === "ko"
            ? "잠시 연결이 흔들렸어요. 다시 시도하면 4영역을 새로 불러올게요."
            : "The connection hiccuped for a moment. Try again to reload your four areas."}
        </Text>
        <View style={styles.modalActions}>
          <Button
            label={locale === "ko" ? "닫기" : "Dismiss"}
            variant="secondary"
            onPress={() => setLoadErrorOpen(false)}
            style={styles.modalButton}
            accessibilityHint={locale === "ko" ? "안내를 닫습니다." : "Dismisses this notice."}
          />
          <Button
            label={locale === "ko" ? "다시 시도" : "Retry"}
            variant="primary"
            onPress={() => {
              setLoadErrorOpen(false);
              setReloadKey((k) => k + 1);
            }}
            style={styles.modalButton}
            accessibilityHint={locale === "ko" ? "4영역 기록을 다시 불러옵니다." : "Reloads the four-area records."}
          />
        </View>
      </PremiumModal>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs },
  shellCenter: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  center: { paddingVertical: spacing.xl, alignItems: "center" },
  emptyCard: { padding: spacing.lg, backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, alignItems: "center", gap: spacing.sm },
  emptyLink: { minHeight: 44, minWidth: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
  grid: { gap: spacing.sm },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  cardEyebrow: { letterSpacing: 0, fontWeight: "700" },
  cardSection: { marginTop: spacing.xs, gap: 2 },
  tagGuide: { backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  actions: { gap: spacing.sm },
  modalBody: { lineHeight: 21 },
  modalActions: { flexDirection: "row", gap: spacing.sm },
  modalButton: { flex: 1 },
});
