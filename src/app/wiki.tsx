// Wiki browser — list all wiki_pages for the user, filter by tag chips,
// expand a row to read its body and see what links to it (backlinks).
//
// This is the read side of the RAG track. Pages get populated by Phase 2
// (source-page generation) and later by Phase 1 entity/concept extraction;
// for now the list is sourced from any pages generated via the inbox's
// "Generate page" path (PR follow-up wires that button).

import { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppNav } from "@/components/ui/AppNav";
import { deleteWikiPage, getBacklinks, listAllWikiLinks, listWikiPages } from "@/lib/wiki/queries";
import { exportUserWiki } from "@/lib/wiki/export";
import { readPhase1, runPhase1 } from "@/lib/wiki/phase1";
import { computeGraphStats, type GraphStats } from "@/lib/wiki/graph-stats";
import type { WikiPageKind, WikiPageRow } from "@/lib/wiki/types";

const KIND_LABEL: Record<WikiPageKind, { en: string; ko: string }> = {
  source: { en: "Source", ko: "소스" },
  entity: { en: "Entity", ko: "엔티티" },
  concept: { en: "Concept", ko: "개념" },
};

const KIND_BORDER: Record<WikiPageKind, keyof typeof semantic> = {
  source: "info",
  entity: "success",
  concept: "warning",
};

export default function Wiki() {
  const { t, i18n } = useTranslation("wiki");
  const { userId, loading: authLoading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [pages, setPages] = useState<WikiPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [backlinksById, setBacklinksById] = useState<Record<string, WikiPageRow[]>>({});
  const [exporting, setExporting] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const [phase1RunningId, setPhase1RunningId] = useState<string | null>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  const [stats, setStats] = useState<GraphStats | null>(null);

  const load = useCallback(
    async (uid: string, tagsFilter: string[]) => {
      const data = await listWikiPages(uid, {
        anyOfTags: tagsFilter.length > 0 ? tagsFilter : undefined,
        limit: 200,
      });
      setPages(data);
    },
    [],
  );

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void load(userId, activeTags).finally(() => setLoading(false));
  }, [userId, activeTags, load]);

  // Every tag that appears on at least one currently-visible page.
  // Sorted by frequency descending so the most useful filters surface first.
  const visibleTags = useMemo(() => {
    const freq = new Map<string, number>();
    for (const p of pages) for (const t of p.tags) freq.set(t, (freq.get(t) ?? 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [pages]);

  if (authLoading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function toggleExpand(page: WikiPageRow) {
    if (expandedId === page.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(page.id);
    if (!userId) return;
    if (backlinksById[page.id] === undefined) {
      try {
        const back = await getBacklinks(userId, page.id);
        setBacklinksById((prev) => ({ ...prev, [page.id]: back }));
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[wiki] backlinks load failed", (e as Error).message);
        setBacklinksById((prev) => ({ ...prev, [page.id]: [] }));
      }
    }
  }

  async function handleRefresh(): Promise<void> {
    if (!userId) return;
    setRefreshing(true);
    await load(userId, activeTags);
    setRefreshing(false);
  }

  async function handleToggleStats(): Promise<void> {
    if (!userId) return;
    if (statsVisible) {
      setStatsVisible(false);
      return;
    }
    try {
      const edges = await listAllWikiLinks(userId);
      const computed = computeGraphStats({ pages, edges });
      setStats(computed);
      setStatsVisible(true);
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "통계 로드 실패" : "Stats load failed",
        (e as Error).message,
      );
    }
  }

  async function handleDeletePage(p: WikiPageRow): Promise<void> {
    if (!userId) return;
    Alert.alert(
      locale === "ko" ? "이 위키 페이지를 삭제할까요?" : "Delete this wiki page?",
      locale === "ko"
        ? "연결된 [[wikilink]]도 자동으로 정리돼요. 되돌릴 수 없습니다."
        : "All [[wikilink]] edges to this page are cascaded. This cannot be undone.",
      [
        { text: locale === "ko" ? "취소" : "Cancel", style: "cancel" },
        {
          text: locale === "ko" ? "삭제" : "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteWikiPage(userId, p.id);
              await load(userId, activeTags);
            } catch (e) {
              Alert.alert(
                locale === "ko" ? "삭제 실패" : "Delete failed",
                (e as Error).message,
              );
            }
          },
        },
      ],
    );
  }

  async function handleRunPhase1OnPage(page: WikiPageRow): Promise<void> {
    if (!userId || !page.source_id) return;
    setPhase1RunningId(page.id);
    try {
      await runPhase1({ userId, sourceId: page.source_id, locale });
      // Reload to pick up the updated frontmatter on the source AND the
      // wiki page (the wiki page's frontmatter was copied at source-page
      // generation time, so we re-promote to refresh it).
      await load(userId, activeTags);
      Alert.alert(locale === "ko" ? "Phase 1 완료" : "Phase 1 done");
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "Phase 1 실패" : "Phase 1 failed",
        (e as Error).message,
      );
    } finally {
      setPhase1RunningId(null);
    }
  }

  async function handleExport(): Promise<void> {
    if (!userId) return;
    setExporting(true);
    try {
      const result = await exportUserWiki(userId, { locale, bodyCharLimit: 4000 });
      setExportText(result.prompt);
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "익스포트 실패" : "Export failed",
        (e as Error).message,
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={semantic.brand} />}
      >
        <View style={styles.header}>
          <Text variant="caption" color="brand">
            2nd-Brain
          </Text>
          <Text variant="heading">{t("title")}</Text>
          <Text variant="body" color="textMuted">
            {t("subtitle")}
          </Text>
        </View>

        <View style={styles.actions}>
          <Link href="/capture" asChild>
            <Button label={t("capture")} variant="primary" />
          </Link>
          <Button
            label={t("export")}
            variant="secondary"
            onPress={handleExport}
            loading={exporting}
            disabled={exporting || pages.length === 0}
          />
          <Button
            label={statsVisible ? (locale === "ko" ? "통계 닫기" : "Hide stats") : (locale === "ko" ? "그래프 통계" : "Graph stats")}
            variant="secondary"
            onPress={handleToggleStats}
            disabled={pages.length === 0}
          />
          <Link href="/journal" asChild>
            <Button label={t("back")} variant="secondary" />
          </Link>
        </View>

        {statsVisible && stats !== null ? (
          <View style={styles.statsCard}>
            <Text variant="caption" color="brand">
              {locale === "ko" ? "지식 그래프 — 한눈에" : "Knowledge graph — at a glance"}
            </Text>
            <View style={styles.statsTopRow}>
              <View style={styles.statsBlock}>
                <Text variant="caption" color="textSubtle">
                  {locale === "ko" ? "페이지" : "Pages"}
                </Text>
                <Text variant="heading">{stats.pageCount}</Text>
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko"
                    ? `소스 ${stats.countByKind.source} · 엔티티 ${stats.countByKind.entity} · 개념 ${stats.countByKind.concept}`
                    : `${stats.countByKind.source} src · ${stats.countByKind.entity} ent · ${stats.countByKind.concept} cpt`}
                </Text>
              </View>
              <View style={styles.statsBlock}>
                <Text variant="caption" color="textSubtle">
                  {locale === "ko" ? "연결" : "Edges"}
                </Text>
                <Text variant="heading">{stats.edgeCount}</Text>
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko"
                    ? `고립 페이지 ${stats.orphans.length}`
                    : `${stats.orphans.length} orphan${stats.orphans.length === 1 ? "" : "s"}`}
                </Text>
              </View>
            </View>
            {stats.topHubs.length > 0 ? (
              <View>
                <Text variant="caption" color="textSubtle" style={styles.statsSectionHead}>
                  {locale === "ko" ? "가장 많이 인용된 페이지" : "Most-cited pages"}
                </Text>
                {stats.topHubs.map((h) => (
                  <Text key={h.id} variant="subtle" color="textMuted">
                    [[{h.slug}]] · ← {h.inDegree}
                  </Text>
                ))}
              </View>
            ) : null}
            {stats.topTags.length > 0 ? (
              <View>
                <Text variant="caption" color="textSubtle" style={styles.statsSectionHead}>
                  {locale === "ko" ? "자주 쓰인 태그" : "Top tags"}
                </Text>
                <Text variant="subtle" color="textMuted">
                  {stats.topTags.map((t) => `#${t.tag} (${t.count})`).join("  ")}
                </Text>
              </View>
            ) : null}
            {stats.orphans.length > 0 ? (
              <View>
                <Text variant="caption" color="textSubtle" style={styles.statsSectionHead}>
                  {locale === "ko" ? "연결 없는 페이지" : "Orphan pages"}
                </Text>
                <Text variant="subtle" color="textMuted" numberOfLines={3}>
                  {stats.orphans.slice(0, 8).map((o) => `[[${o.slug}]]`).join(", ")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {exportText !== null ? (
          <View style={styles.exportCard}>
            <View style={styles.exportHeader}>
              <Text variant="caption" color="textMuted">
                {t("exportTitle")} ({exportText.length.toLocaleString()} {locale === "ko" ? "자" : "chars"})
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <Pressable
                  onPress={async () => {
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      try {
                        await navigator.clipboard.writeText(exportText);
                        Alert.alert(locale === "ko" ? "클립보드에 복사됨" : "Copied to clipboard");
                      } catch {
                        Alert.alert(
                          locale === "ko" ? "복사 실패 — 아래 텍스트를 직접 선택해 주세요" : "Copy failed — please select the text below manually",
                        );
                      }
                    } else {
                      Alert.alert(
                        locale === "ko" ? "이 환경에서는 자동 복사가 지원되지 않아요" : "Auto-copy not supported in this environment",
                      );
                    }
                  }}
                  hitSlop={6}
                >
                  <Text variant="caption" color="brand">
                    {locale === "ko" ? "복사" : "Copy"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setExportText(null)} hitSlop={6}>
                  <Text variant="caption" color="brand">
                    {locale === "ko" ? "닫기" : "Close"}
                  </Text>
                </Pressable>
              </View>
            </View>
            <ScrollView style={styles.exportScroll} nestedScrollEnabled>
              <Text variant="subtle" color="text" selectable>
                {exportText}
              </Text>
            </ScrollView>
            <Text variant="subtle" color="textSubtle" style={styles.exportHelper}>
              {locale === "ko"
                ? "위 복사 버튼으로 한 번에 클립보드로 옮기거나, 텍스트를 길게 눌러 직접 선택해도 됩니다. Claude · ChatGPT 새 대화에 붙여 넣으면 우리가 세컨비에서 보던 것과 같은 컨텍스트로 이어서 쓸 수 있어요."
                : "Tap Copy to send everything to your clipboard, or long-press the text to select manually. Paste it into a new Claude / ChatGPT chat and you'll pick up with the same context we use in SecondB."}
            </Text>
          </View>
        ) : null}

        {visibleTags.length > 0 ? (
          <View style={styles.tagFilterCard}>
            <Text variant="caption" color="textMuted">
              {t("filterByTag")}
            </Text>
            <View style={styles.tagChipRow}>
              {visibleTags.map((tag) => {
                const active = activeTags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    style={[styles.tagChip, active && styles.tagChipActive]}
                    hitSlop={4}
                  >
                    <Text variant="subtle" color={active ? "background" : "textMuted"}>
                      #{tag}
                    </Text>
                  </Pressable>
                );
              })}
              {activeTags.length > 0 ? (
                <Pressable onPress={() => setActiveTags([])} style={styles.clearChip} hitSlop={4}>
                  <Text variant="subtle" color="textMuted">
                    {t("clear")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : pages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text variant="body" color="textMuted" style={styles.emptyText}>
              {activeTags.length > 0 ? t("emptyForTags") : t("empty")}
            </Text>
            {activeTags.length === 0 ? (
              <>
                <Text variant="subtle" color="textSubtle" style={{ textAlign: "center", lineHeight: 18, marginTop: spacing.sm }}>
                  {locale === "ko"
                    ? "캡처 → 받은편지함 → '위키 페이지 생성' 순서로 페이지가 쌓여요. 페이지들은 [[wikilink]]로 자동 연결됩니다."
                    : "Captures land in your inbox, then 'Generate wiki page' promotes them here. Pages link to each other via [[wikilinks]] automatically."}
                </Text>
                <Link href="/inbox" asChild>
                  <Pressable hitSlop={6}>
                    <Text variant="caption" color="brand">
                      {locale === "ko" ? "→ 받은편지함 열기" : "→ Open inbox"}
                    </Text>
                  </Pressable>
                </Link>
              </>
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {pages.map((p) => {
              const expanded = expandedId === p.id;
              return (
                <Pressable key={p.id} onPress={() => toggleExpand(p)} style={styles.row}>
                  <View style={styles.rowHeader}>
                    <View style={[styles.kindChip, { borderColor: semantic[KIND_BORDER[p.kind]] }]}>
                      <Text variant="caption" color="textMuted">
                        {KIND_LABEL[p.kind][locale]}
                      </Text>
                    </View>
                    <Text variant="subtle" color="textSubtle" style={styles.flexSpacer}>
                      [[{p.slug}]]
                    </Text>
                  </View>
                  <Text variant="body" style={styles.rowTitle} numberOfLines={expanded ? undefined : 2}>
                    {p.title}
                  </Text>
                  {p.tags.length > 0 ? (
                    <View style={styles.inlineTagRow}>
                      {p.tags.map((tag) => (
                        <Pressable
                          key={tag}
                          onPress={(e) => {
                            e.stopPropagation();
                            if (!activeTags.includes(tag)) setActiveTags([...activeTags, tag]);
                          }}
                          hitSlop={2}
                        >
                          <Text variant="subtle" color="textSubtle">
                            #{tag}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {expanded ? (
                    <View style={styles.expandedSection}>
                      {typeof p.frontmatter.url === "string" && p.frontmatter.url.length > 0 ? (
                        <Text variant="subtle" color="textSubtle" numberOfLines={1}>
                          {locale === "ko" ? "원본: " : "Source: "}
                          {p.frontmatter.url}
                        </Text>
                      ) : null}
                      {(() => {
                        const p1 = readPhase1(p.frontmatter);
                        if (p1 === null) {
                          // source-kind pages can re-run Phase 1; entity/concept can't
                          if (p.kind !== "source" || !p.source_id) return null;
                          return (
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation();
                                void handleRunPhase1OnPage(p);
                              }}
                              disabled={phase1RunningId === p.id}
                              style={styles.phase1Trigger}
                              hitSlop={4}
                            >
                              <Text variant="caption" color="brand">
                                {phase1RunningId === p.id
                                  ? locale === "ko"
                                    ? "요약 중…"
                                    : "Summarizing…"
                                  : locale === "ko"
                                    ? "→ Phase 1 실행 (요약 + 4질문)"
                                    : "→ Run Phase 1 (summary + 4 questions)"}
                              </Text>
                            </Pressable>
                          );
                        }
                        return (
                          <View style={styles.phase1Card}>
                            <View style={styles.phase1Header}>
                              <Text variant="caption" color="brand">
                                {locale === "ko" ? "Phase 1 — 요약" : "Phase 1 — summary"}
                              </Text>
                              <Text variant="subtle" color="textSubtle">
                                {new Date(p1.generated_at).toLocaleDateString(
                                  locale === "ko" ? "ko-KR" : "en-US",
                                  { month: "short", day: "numeric" },
                                )}
                                {" · "}
                                {p1.model.startsWith("mock:") ? "MOCK" : p1.model.split("-").slice(-2, -1)[0] ?? p1.model}
                              </Text>
                            </View>
                            <Text variant="body" color="textMuted" style={styles.body}>
                              {p1.summary}
                            </Text>
                            {p1.entities.length > 0 || p1.concepts.length > 0 ? (
                              <View style={styles.phase1Meta}>
                                {p1.entities.length > 0 ? (
                                  <Text variant="subtle" color="textSubtle" numberOfLines={2}>
                                    <Text variant="subtle" color="textMuted">
                                      {locale === "ko" ? "엔티티: " : "Entities: "}
                                    </Text>
                                    {p1.entities.join(", ")}
                                  </Text>
                                ) : null}
                                {p1.concepts.length > 0 ? (
                                  <Text variant="subtle" color="textSubtle" numberOfLines={2}>
                                    <Text variant="subtle" color="textMuted">
                                      {locale === "ko" ? "개념: " : "Concepts: "}
                                    </Text>
                                    {p1.concepts.join(", ")}
                                  </Text>
                                ) : null}
                              </View>
                            ) : null}
                            {p1.questions.length > 0 ? (
                              <>
                                <Text variant="caption" color="brand" style={styles.phase1QHeader}>
                                  {locale === "ko" ? "성찰 질문" : "Reflection questions"}
                                </Text>
                                {p1.questions.map((q, i) => (
                                  <Text key={i} variant="subtle" color="textMuted">
                                    {i + 1}. {q}
                                  </Text>
                                ))}
                              </>
                            ) : null}
                          </View>
                        );
                      })()}
                      {p.body_md.length > 0 ? (
                        <Text variant="body" color="textMuted" style={styles.body}>
                          {p.body_md}
                        </Text>
                      ) : (
                        <Text variant="subtle" color="textSubtle">
                          {t("emptyBody")}
                        </Text>
                      )}
                      <View style={styles.backlinksHeader}>
                        <Text variant="caption" color="textMuted">
                          {t("backlinks")} ({backlinksById[p.id]?.length ?? "…"})
                        </Text>
                      </View>
                      {(backlinksById[p.id] ?? []).map((b) => (
                        <Text key={b.id} variant="subtle" color="textMuted">
                          ← [[{b.slug}]] {b.title}
                        </Text>
                      ))}
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          void handleDeletePage(p);
                        }}
                        hitSlop={6}
                        style={{ alignSelf: "flex-end", marginTop: spacing.sm }}
                      >
                        <Text variant="caption" color="textSubtle">
                          {locale === "ko" ? "이 페이지 삭제" : "Delete page"}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
        <AppNav locale={locale} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm },
  tagFilterCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tagChipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  tagChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
  },
  tagChipActive: {
    backgroundColor: semantic.brand,
    borderColor: semantic.brand,
  },
  clearChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  center: { paddingVertical: spacing.xl, alignItems: "center" },
  emptyCard: { padding: spacing.lg, backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, alignItems: "center", gap: spacing.sm },
  emptyText: { textAlign: "center" },
  inlineTagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  list: { gap: spacing.sm },
  row: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flexSpacer: { marginLeft: "auto" },
  rowTitle: { fontWeight: "600" },
  kindChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    backgroundColor: semantic.surfaceAlt,
  },
  expandedSection: { marginTop: spacing.sm, gap: spacing.xs, paddingTop: spacing.sm, borderTopColor: semantic.border, borderTopWidth: 1 },
  body: { lineHeight: 22 },
  backlinksHeader: { marginTop: spacing.sm },
  phase1Card: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.brand,
    borderLeftWidth: 3,
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  phase1Header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  phase1QHeader: { marginTop: spacing.xs },
  phase1Meta: { marginTop: spacing.xs, gap: 2 },
  phase1Trigger: { paddingVertical: spacing.xs, marginBottom: spacing.sm },
  exportCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  exportHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  exportScroll: { maxHeight: 320, backgroundColor: semantic.surfaceAlt, borderRadius: radii.sm, padding: spacing.sm },
  exportHelper: { marginTop: spacing.xs },
  statsCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statsTopRow: { flexDirection: "row", gap: spacing.lg },
  statsBlock: { flex: 1, gap: 2 },
  statsSectionHead: { letterSpacing: 1, marginTop: spacing.xs },
});
