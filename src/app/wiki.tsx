// Wiki browser — list all wiki_pages for the user, filter by tag chips,
// expand a row to read its body and see what links to it (backlinks).
//
// This is the read side of the RAG track. Pages get populated by Phase 2
// (source-page generation) and later by Phase 1 entity/concept extraction;
// for now the list is sourced from any pages generated via the inbox's
// "Generate page" path (PR follow-up wires that button).

import { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getBacklinks, listWikiPages } from "@/lib/wiki/queries";
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
          <Link href="/journal" asChild>
            <Button label={t("back")} variant="secondary" />
          </Link>
        </View>

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
});
