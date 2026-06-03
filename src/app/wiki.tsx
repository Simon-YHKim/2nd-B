// Wiki browser — list all wiki_pages for the user, filter by tag chips,
// expand a row to read its body and see what links to it (backlinks).
//
// This is the read side of the RAG track. Pages get populated by Phase 2
// (source-page generation) and later by Phase 1 entity/concept extraction;
// for now the list is sourced from any pages generated via the inbox's
// "Generate page" path (PR follow-up wires that button).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Link, Redirect, router, type Href } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { deleteWikiPage, getBacklinks, listAllWikiLinks, listWikiPages } from "@/lib/wiki/queries";
import { exportUserWiki } from "@/lib/wiki/export";
import { readPhase1, runPhase1 } from "@/lib/wiki/phase1";
import { computeGraphStats } from "@/lib/wiki/graph-stats";
import type { WikiPageKind, WikiPageRow } from "@/lib/wiki/types";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { WikiCardThumb, type WikiCardThumbId } from "@/components/art/WikiCardThumb";
import { VILLAGE_UI } from "@/lib/village-ui";
import { VILLAGE_IDS, type VillageId } from "@/lib/graph/relatedness";

// listAllWikiLinks projects only the two endpoint columns — all the
// living-brain summary and per-row connection counts need.
type WikiEdge = { from_page: string; to_page: string };

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

// The three knowledge facets at the top of the store (premium wiki card
// thumbnails, asset audit P2). Core + Imagine open their own screens; Library
// is the store itself, so its card stays put and reads "지금 여기 / You're here".
const FACETS: ReadonlyArray<{
  id: WikiCardThumbId;
  route: "/core-brain" | null;
  label: { en: string; ko: string };
  desc: { en: string; ko: string };
}> = [
  {
    id: "core_brain",
    route: "/core-brain",
    label: { en: "Core", ko: "코어" },
    desc: { en: "Know yourself", ko: "나를 알기" },
  },
  {
    id: "library",
    route: null,
    label: { en: "Library", ko: "서재" },
    desc: { en: "You're here", ko: "지금 여기" },
  },
];

function villageHref(village: VillageId): Href {
  if (village === "knowledge") return "/wiki";
  return { pathname: "/records", params: { domain: village } };
}

export default function Wiki() {
  const { t, i18n } = useTranslation("wiki");
  const { userId, loading: authLoading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [pages, setPages] = useState<WikiPageRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [backlinksById, setBacklinksById] = useState<Record<string, WikiPageRow[]>>({});
  const [exporting, setExporting] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const [phase1RunningId, setPhase1RunningId] = useState<string | null>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  const [edges, setEdges] = useState<WikiEdge[] | null>(null);
  const companion = useCompanionMoment();

  const load = useCallback(async (uid: string, tagsFilter: string[]) => {
    // Pull pages + the full link set together so the "living brain" summary
    // and per-row connection counts are ready without a separate tap. Links
    // are global (not tag-filtered); a failure degrades to a zero-edge graph.
    const [data, links] = await Promise.all([
      listWikiPages(uid, {
        anyOfTags: tagsFilter.length > 0 ? tagsFilter : undefined,
        limit: 200,
      }),
      listAllWikiLinks(uid).catch(() => [] as WikiEdge[]),
    ]);
    setPages(data);
    setEdges(links);
  }, []);

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

  // Local search filter (wiki pack §8) — title/slug contains. Backend /
  // RAG search can replace this later behind the same `query` input.
  const visiblePages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
    );
  }, [pages, query]);

  // The living-brain summary + per-row connection counts are all derived from
  // the one edge set we loaded above — no extra fetch. `stats` is null only
  // until the first load resolves; a hub is a page cited twice or more.
  const stats = useMemo(
    () => (edges === null ? null : computeGraphStats({ pages, edges })),
    [pages, edges],
  );
  const inDegreeById = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of edges ?? []) m.set(e.to_page, (m.get(e.to_page) ?? 0) + 1);
    return m;
  }, [edges]);
  const hubIds = useMemo(
    () => new Set((stats?.topHubs ?? []).filter((h) => h.inDegree >= 2).map((h) => h.id)),
    [stats],
  );

  const swipeVillage = useCallback((step: 1 | -1) => {
    const currentIndex = VILLAGE_IDS.indexOf("knowledge");
    const nextIndex = (currentIndex + step + VILLAGE_IDS.length) % VILLAGE_IDS.length;
    router.replace(villageHref(VILLAGE_IDS[nextIndex]));
  }, []);

  if (authLoading) return null;
  if (!userId) {
    return <Redirect href="/sign-in" />;
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
        if (typeof console !== "undefined")
          console.warn("[wiki] backlinks load failed", (e as Error).message);
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

  function handleToggleStats(): void {
    // The headline numbers live in the always-on pulse strip now; this just
    // reveals the fuller breakdown (hubs, tags, orphans) already in `stats`.
    setStatsVisible((v) => !v);
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
              Alert.alert(locale === "ko" ? "삭제 실패" : "Delete failed", (e as Error).message);
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
      // 모모 labels the freshly organized page (companion pack §3).
      companion.fire("wikiSaved");
      Alert.alert(locale === "ko" ? "Phase 1 완료" : "Phase 1 done");
    } catch (e) {
      Alert.alert(locale === "ko" ? "Phase 1 실패" : "Phase 1 failed", (e as Error).message);
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
      Alert.alert(locale === "ko" ? "익스포트 실패" : "Export failed", (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <PremiumAppShell>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={semantic.brand}
          />
        }
      >
        <SceneHero
          eyebrow={locale === "ko" ? "04. 지식 창고" : "04. Knowledge store"}
          title={locale === "ko" ? "저장한 조각들이 서재가 돼요" : "Saved pieces become a library"}
          subtitle={
            locale === "ko"
              ? "마을에 저장한 조각을 다시 찾아보는 곳"
              : "Find the pieces you saved to the village"
          }
          island={VILLAGE_UI.knowledge.island}
          worker={VILLAGE_UI.knowledge.worker}
          accent={VILLAGE_UI.knowledge.accent}
          speech={
            locale === "ko"
              ? "조각들을 정리해뒀어요. 새 조각을 담거나 세컨비에게 물어볼 수 있어요."
              : "I've kept the pieces in order. Capture a new one or ask SecondB."
          }
          primaryAction={{
            label: t("capture"),
            onPress: () => router.push("/capture"),
          }}
          onSwipeLeft={() => swipeVillage(1)}
          onSwipeRight={() => swipeVillage(-1)}
        />

        {/* Three knowledge facets (premium wiki card thumbnails, asset audit P2):
            Core / Library / Imagine. Core + Imagine open their own screens. */}
        <View style={styles.facetRow}>
          {FACETS.map((f) => {
            const body = (
              <>
                <WikiCardThumb id={f.id} size={56} />
                <Text variant="caption" color="text" style={styles.facetLabel}>
                  {f.label[locale]}
                </Text>
                <Text variant="subtle" color="textSubtle" numberOfLines={1}>
                  {f.desc[locale]}
                </Text>
              </>
            );
            if (!f.route) {
              return (
                <View key={f.id} style={styles.facetCard}>
                  {body}
                </View>
              );
            }
            const route = f.route;
            return (
              <Pressable
                key={f.id}
                onPress={() => router.push(route)}
                style={styles.facetCard}
                accessibilityRole="button"
                accessibilityLabel={f.label[locale]}
                accessibilityHint={f.desc[locale]}
                hitSlop={4}
              >
                {body}
              </Pressable>
            );
          })}
        </View>

        {/* Living-brain pulse (wiki deep restyle): an always-on headline of the
            knowledge graph so the store feels alive before any tap. */}
        {stats !== null && pages.length > 0 ? (
          <View style={styles.pulseStrip}>
            <PulseStat label={locale === "ko" ? "조각" : "Pieces"} value={stats.pageCount} />
            <View style={styles.pulseDivider} />
            <PulseStat label={locale === "ko" ? "연결" : "Links"} value={stats.edgeCount} accent />
            <View style={styles.pulseDivider} />
            <PulseStat
              label={locale === "ko" ? "외딴 조각" : "Orphans"}
              value={stats.orphans.length}
            />
          </View>
        ) : null}

        {/* Search (wiki pack §4/§8) — local filter over saved pages. */}
        {pages.length > 0 ? (
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={
              locale === "ko" ? "조각 검색: 제목이나 슬러그" : "Search pieces: title or slug"
            }
            accessibilityLabel={locale === "ko" ? "지식 창고 검색" : "Search the knowledge store"}
          />
        ) : null}

        {/* Utility row: lower-frequency tools sit a step down the hierarchy. */}
        <View style={styles.actionsUtility}>
          <Button
            label={t("export")}
            variant="secondary"
            style={styles.actionBtn}
            onPress={handleExport}
            loading={exporting}
            disabled={exporting || pages.length === 0}
          />
          <Button
            label={
              statsVisible
                ? locale === "ko"
                  ? "통계 접기"
                  : "Hide detail"
                : locale === "ko"
                  ? "통계 자세히"
                  : "Graph detail"
            }
            variant="secondary"
            style={styles.actionBtn}
            onPress={handleToggleStats}
            disabled={pages.length === 0}
          />
          <Link href="/journal" asChild>
            <Button label={t("back")} variant="secondary" style={styles.actionBtn} />
          </Link>
        </View>

        {statsVisible && stats !== null ? (
          <View style={styles.statsCard}>
            <Text variant="caption" color="brand">
              {locale === "ko" ? "지식 그래프 한눈에" : "Knowledge graph at a glance"}
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
                  {stats.orphans
                    .slice(0, 8)
                    .map((o) => `[[${o.slug}]]`)
                    .join(", ")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {exportText !== null ? (
          <View style={styles.exportCard}>
            <View style={styles.exportHeader}>
              <Text variant="caption" color="textMuted">
                {t("exportTitle")} ({exportText.length.toLocaleString()}{" "}
                {locale === "ko" ? "자" : "chars"})
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
                          locale === "ko"
                            ? "복사 실패: 아래 텍스트를 직접 선택해 주세요"
                            : "Copy failed: please select the text below manually",
                        );
                      }
                    } else {
                      Alert.alert(
                        locale === "ko"
                          ? "이 환경에서는 자동 복사가 지원되지 않아요"
                          : "Auto-copy not supported in this environment",
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
            <WikiCardThumb id="library" size={88} />
            <Text variant="body" color="textMuted" style={styles.emptyText}>
              {activeTags.length > 0
                ? t("emptyForTags")
                : locale === "ko"
                  ? "아직 창고가 조용해요. 오늘의 조각이나 링크를 저장하면 여기서 다시 찾아볼 수 있어요."
                  : "The store is quiet for now. Save a piece or a link and you'll find it here again."}
            </Text>
            {activeTags.length === 0 ? (
              <View style={styles.emptyCtaRow}>
                <Link href="/journal" asChild>
                  <Button
                    label={locale === "ko" ? "오늘의 조각 남기기" : "Leave today's piece"}
                    variant="primary"
                  />
                </Link>
                <Link href="/capture" asChild>
                  <Button
                    label={locale === "ko" ? "조각 담기" : "Capture a piece"}
                    variant="secondary"
                  />
                </Link>
              </View>
            ) : null}
          </View>
        ) : visiblePages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text variant="body" color="textMuted" style={styles.emptyText}>
              {locale === "ko"
                ? `'${query.trim()}'에 맞는 조각이 없어요.`
                : `No pieces match '${query.trim()}'.`}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {visiblePages.map((p) => {
              const expanded = expandedId === p.id;
              const inDeg = inDegreeById.get(p.id) ?? 0;
              const isHub = hubIds.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => toggleExpand(p)}
                  style={[
                    styles.row,
                    { borderLeftColor: semantic[KIND_BORDER[p.kind]], borderLeftWidth: 3 },
                  ]}
                >
                  <View style={styles.rowHeader}>
                    <View style={[styles.kindChip, { borderColor: semantic[KIND_BORDER[p.kind]] }]}>
                      <Text variant="caption" color="textMuted">
                        {KIND_LABEL[p.kind][locale]}
                      </Text>
                    </View>
                    <Text
                      variant="subtle"
                      color="textSubtle"
                      numberOfLines={1}
                      style={styles.rowSlug}
                    >
                      [[{p.slug}]]
                    </Text>
                    {inDeg > 0 ? (
                      <Text
                        variant="subtle"
                        color={isHub ? "brand" : "textSubtle"}
                        style={styles.rowInDeg}
                      >
                        ← {inDeg}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    variant="body"
                    style={styles.rowTitle}
                    numberOfLines={expanded ? undefined : 2}
                  >
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
                                    ? "Phase 1 실행 (요약 + 4질문)"
                                    : "Run Phase 1 (summary + 4 questions)"}
                              </Text>
                            </Pressable>
                          );
                        }
                        return (
                          <View style={styles.phase1Card}>
                            <View style={styles.phase1Header}>
                              <Text variant="caption" color="brand">
                                {locale === "ko" ? "Phase 1 요약" : "Phase 1 summary"}
                              </Text>
                              <Text variant="subtle" color="textSubtle">
                                {new Date(p1.generated_at).toLocaleDateString(
                                  locale === "ko" ? "ko-KR" : "en-US",
                                  { month: "short", day: "numeric" },
                                )}
                                {" · "}
                                {p1.model.startsWith("mock:")
                                  ? "MOCK"
                                  : (p1.model.split("-").slice(-2, -1)[0] ?? p1.model)}
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
                      {/* Handoffs (wiki-records §6/§7): jump to this page on
                          the graph, or ask SecondB about it. */}
                      <View style={styles.pageHandoffs}>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push({ pathname: "/", params: { highlightWikiPageId: p.id } });
                          }}
                          hitSlop={6}
                          style={styles.pageHandoffBtn}
                          accessibilityRole="button"
                        >
                          <Text variant="caption" color="brand">
                            {locale === "ko" ? "그래프에서 보기" : "See in graph"}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push({ pathname: "/jarvis", params: { fromNode: p.title } });
                          }}
                          hitSlop={6}
                          style={styles.pageHandoffBtn}
                          accessibilityRole="button"
                        >
                          <Text variant="caption" color="brand">
                            {locale === "ko" ? "세컨비에게 묻기" : "Ask SecondB"}
                          </Text>
                        </Pressable>
                      </View>
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
      </ScrollView>
      {/* 모모 appears briefly to label the organized page (companion pack §3) */}
      {companion.moment ? (
        <CompanionMoment moment={companion.moment} style={styles.companionFlash} />
      ) : null}
    </PremiumAppShell>
  );
}

// One cell of the living-brain pulse strip: a big number over a quiet label.
// `accent` paints the number mint to mark the "connection" signal.
function PulseStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={styles.pulseStat}>
      <Text variant="heading" color={accent ? "brand" : "text"}>
        {value}
      </Text>
      <Text variant="subtle" color="textSubtle">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 110, gap: spacing.lg },
  companionFlash: { position: "absolute", bottom: 40, right: 20 },
  pageHandoffs: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  pageHandoffBtn: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  facetRow: { flexDirection: "row", gap: spacing.sm },
  facetCard: {
    flex: 1,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  facetLabel: { fontWeight: "600" },
  pulseStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pulseStat: { flex: 1, alignItems: "center", gap: 2 },
  pulseDivider: { width: 1, alignSelf: "stretch", backgroundColor: semantic.border, opacity: 0.5 },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionsUtility: { flexDirection: "row", gap: spacing.sm },
  actionBtn: { flex: 1 },
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
  emptyCard: {
    padding: spacing.lg,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyText: { textAlign: "center" },
  emptyCtaRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },
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
  rowSlug: { flex: 1 },
  rowInDeg: { marginLeft: spacing.sm },
  rowTitle: { fontWeight: "600" },
  kindChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    backgroundColor: semantic.surfaceAlt,
  },
  expandedSection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopColor: semantic.border,
    borderTopWidth: 1,
  },
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
  exportScroll: {
    maxHeight: 320,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
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
  statsSectionHead: { letterSpacing: 0, marginTop: spacing.xs },
});
