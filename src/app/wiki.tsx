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
import { getBacklinks, listWikiPages } from "@/lib/wiki/queries";
import { exportUserWiki } from "@/lib/wiki/export";
import { readPhase1, runPhase1 } from "@/lib/wiki/phase1";
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
          <Link href="/journal" asChild>
            <Button label={t("back")} variant="secondary" />
          </Link>
        </View>

        {exportText !== null ? (
          <View style={styles.exportCard}>
            <View style={styles.exportHeader}>
              <Text variant="caption" color="textMuted">
                {t("exportTitle")} ({exportText.length.toLocaleString()} {locale === "ko" ? "자" : "chars"})
              </Text>
              <Pressable onPress={() => setExportText(null)} hitSlop={6}>
                <Text variant="caption" color="brand">
                  {locale === "ko" ? "닫기" : "Close"}
                </Text>
              </Pressable>
            </View>
            <ScrollView style={styles.exportScroll} nestedScrollEnabled>
              <Text variant="subtle" color="text" selectable>
                {exportText}
              </Text>
            </ScrollView>
            <Text variant="subtle" color="textSubtle" style={styles.exportHelper}>
              {locale === "ko"
                ? "위 텍스트를 길게 눌러 전체 선택 후 복사하세요. Claude · ChatGPT 새 대화에 붙여 넣으면 자비스와 같은 컨텍스트로 사용됩니다."
                : "Long-press the text above to select all, then paste into a new Claude / ChatGPT chat for the same context as Jarvis."}
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
            <Text variant="body" color="textMuted">
              {activeTags.length > 0 ? t("emptyForTags") : t("empty")}
            </Text>
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
                    <Text variant="subtle" color="textSubtle" numberOfLines={1}>
                      #{p.tags.join(" #")}
                    </Text>
                  ) : null}
                  {expanded ? (
                    <View style={styles.expandedSection}>
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
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
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
  emptyCard: { padding: spacing.lg, backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, alignItems: "center" },
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
});
