// Wiki browser — list all wiki_pages for the user, filter by tag chips,
// expand a row to read its body and see what links to it (backlinks).
//
// This is the read side of the RAG track. Pages get populated by Phase 2
// (source-page generation) and later by Phase 1 entity/concept extraction;
// for now the list is sourced from any pages generated via the inbox's
// "Generate page" path (PR follow-up wires that button).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Link, Redirect, router, useLocalSearchParams, type Href } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, PremiumToast, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { deleteWikiPage, getBacklinks, listAllWikiLinks, listWikiPages } from "@/lib/wiki/queries";
import { exportContextPack } from "@/lib/wiki/context-pack";
import { readPhase1, runPhase1 } from "@/lib/wiki/phase1";
import { generateSourcePage } from "@/lib/wiki/phase2";
import { computeGraphStats } from "@/lib/wiki/graph-stats";
import type { WikiPageKind, WikiPageRow } from "@/lib/wiki/types";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { WikiCardThumb, type WikiCardThumbId } from "@/components/art/WikiCardThumb";
import { VILLAGE_UI } from "@/lib/village-ui";
import { VILLAGE_IDS, type VillageId } from "@/lib/graph/relatedness";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceWikiScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

// listAllWikiLinks projects only the two endpoint columns — all the
// living-brain summary and per-row connection counts need.
type WikiEdge = { from_page: string; to_page: string };
type WikiToast = { message: string; tone: "info" | "success" | "danger" };

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
    label: { en: "Soul Core", ko: "소울 코어" },
    desc: { en: "Trace your patterns", ko: "내 패턴 보기" },
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

function savedName(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || slug;
}

function displayPageName(page: { title: string; slug: string }): string {
  const title = page.title.trim();
  return title.length > 0 ? title : savedName(page.slug);
}

// Memory prune: backlinks are only needed for the page the user is currently
// reading, so cap the cache to the 5 most-recently-expanded pages. Re-setting
// an existing id refreshes its recency (delete then re-add at the tail), and
// when the map would exceed 5 we drop the oldest insertion. Keeps the cache
// from growing unbounded across a long browse of 200 pages.
const BACKLINKS_CACHE_LIMIT = 5;
function pruneBacklinks(
  prev: Record<string, WikiPageRow[]>,
  id: string,
  value: WikiPageRow[],
): Record<string, WikiPageRow[]> {
  const next: Record<string, WikiPageRow[]> = {};
  for (const key of Object.keys(prev)) {
    if (key !== id) next[key] = prev[key];
  }
  next[id] = value;
  const keys = Object.keys(next);
  if (keys.length > BACKLINKS_CACHE_LIMIT) {
    for (const stale of keys.slice(0, keys.length - BACKLINKS_CACHE_LIMIT)) delete next[stale];
  }
  return next;
}

function WikiLegacy() {
  const { t, i18n } = useTranslation("wiki");
  const { userId, loading: authLoading, hasProfile, isMinor } = useAuth();
  const routeParams = useLocalSearchParams();
  const focusSourceIdParam = routeParams.focusSourceId;
  const focusSourceId = Array.isArray(focusSourceIdParam) ? focusSourceIdParam[0] : focusSourceIdParam;
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
  const [toast, setToast] = useState<WikiToast | null>(null);
  const [pendingDeletePage, setPendingDeletePage] = useState<WikiPageRow | null>(null);
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);
  const [phase1RunningId, setPhase1RunningId] = useState<string | null>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  const [handledFocusSourceId, setHandledFocusSourceId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!focusSourceId || handledFocusSourceId === focusSourceId) return;
    if (activeTags.length > 0) {
      setActiveTags([]);
      return;
    }
    const page = pages.find((p) => p.source_id === focusSourceId);
    if (!page) return;
    const pageName = displayPageName(page);
    setQuery(pageName);
    setExpandedId(page.id);
    setHandledFocusSourceId(focusSourceId);
    setToast({
      tone: "success",
      message: locale === "ko" ? `${pageName} 페이지를 열었어요` : `Opened ${pageName}`,
    });
    if (userId && backlinksById[page.id] === undefined) {
      void getBacklinks(userId, page.id)
        .then((value) => setBacklinksById((prev) => pruneBacklinks(prev, page.id, value)))
        .catch(() => setBacklinksById((prev) => pruneBacklinks(prev, page.id, [])));
    }
  }, [activeTags.length, backlinksById, focusSourceId, handledFocusSourceId, locale, pages, userId]);

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

  // Auth/profile gate lives BELOW (after all hooks/useCallbacks) so an early
  // return never precedes a useCallback (react-hooks/rules-of-hooks).
  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const toggleExpand = useCallback(
    async (page: WikiPageRow) => {
      if (expandedId === page.id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(page.id);
      if (!userId) return;
      if (backlinksById[page.id] === undefined) {
        try {
          const back = await getBacklinks(userId, page.id);
          setBacklinksById((prev) => pruneBacklinks(prev, page.id, back));
        } catch (e) {
          if (typeof console !== "undefined")
            console.warn("[wiki] backlinks load failed", (e as Error).message);
          setBacklinksById((prev) => pruneBacklinks(prev, page.id, []));
        }
      }
    },
    [expandedId, userId, backlinksById],
  );

  async function handleRefresh(): Promise<void> {
    if (!userId) return;
    setRefreshing(true);
    try {
      await load(userId, activeTags);
    } catch (e) {
      // load() surfaces its own in-view error state; here we just make sure a
      // throw never leaves the pull-to-refresh spinner stuck on.
      if (typeof console !== "undefined") console.warn("[wiki] refresh failed", (e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  function handleToggleStats(): void {
    // The headline numbers live in the always-on pulse strip now; this just
    // reveals the fuller breakdown (hubs, tags, orphans) already in `stats`.
    setStatsVisible((v) => !v);
  }

  const handleDeletePage = useCallback((p: WikiPageRow): void => {
    setPendingDeletePage(p);
  }, []);

  const confirmDeletePage = useCallback(async (): Promise<void> => {
    if (!userId || !pendingDeletePage) return;
    const page = pendingDeletePage;
    setDeletingPageId(page.id);
    try {
      await deleteWikiPage(userId, page.id);
      setPendingDeletePage(null);
      setToast({
        tone: "success",
        message: locale === "ko" ? "위키 페이지를 삭제했어요." : "Wiki page deleted.",
      });
      await load(userId, activeTags);
    } catch (e) {
      // Keep the raw error in logs only; show product-tone copy + retry.
      if (typeof console !== "undefined")
        console.warn("[wiki] delete page failed", (e as Error).message);
      setToast({
        tone: "danger",
        message:
          locale === "ko"
            ? "페이지를 삭제하지 못했어요. 새로고침한 뒤 다시 시도해 주세요."
            : "Couldn't delete the page. Refresh and try again.",
      });
    } finally {
      setDeletingPageId(null);
    }
  }, [userId, pendingDeletePage, locale, load, activeTags]);

  const handleRunPhase1OnPage = useCallback(
    async (page: WikiPageRow): Promise<void> => {
      if (!userId || !page.source_id) return;
      setPhase1RunningId(page.id);
      try {
        await runPhase1({ userId, sourceId: page.source_id, locale, minor: isMinor === true });
        // runPhase1 writes __phase1__ to the SOURCE frontmatter only; the wiki
        // page's frontmatter was frozen at source-page generation time, so it
        // still lacks the brief. Re-promote the source into wiki_pages so its
        // frontmatter (now carrying __phase1__) is refreshed before we reload —
        // otherwise readPhase1(page.frontmatter) returns null and the brief
        // never appears.
        await generateSourcePage(userId, page.source_id);
        // Reload to pick up the refreshed frontmatter on the wiki page.
        await load(userId, activeTags);
        // 모모 labels the freshly organized page (companion pack §3).
        companion.fire("wikiSaved");
        setToast({
          tone: "success",
          message: locale === "ko" ? "요약과 질문이 준비됐어요." : "Source brief is ready.",
        });
      } catch (e) {
        // Keep the raw implementation error in logs only; show product-tone copy + retry.
        if (typeof console !== "undefined")
          console.warn("[wiki] source brief failed", (e as Error).message);
        setToast({
          tone: "danger",
          message:
            locale === "ko"
              ? "요약과 질문을 만들지 못했어요. 원본을 확인한 뒤 다시 시도해 주세요."
              : "Couldn't build the source brief. Check the source and try again.",
        });
      } finally {
        setPhase1RunningId(null);
      }
    },
    [userId, locale, isMinor, load, activeTags, companion],
  );

  async function handleExport(): Promise<void> {
    if (!userId) return;
    setExporting(true);
    try {
      // §6 Personal Context Pack: the 2-layer portable file (router header +
      // detail), so any consumer LLM operates on the user as their personal OS.
      // P2-2: this user-facing export is the pre-delete backup the danger-zone
      // copy points at — it must carry the journal/note records too (opt-in
      // here only; the chat RAG snapshot stays pages+sources via exportUserWiki).
      const result = await exportContextPack(userId, { locale, bodyCharLimit: 4000, includeRecords: true });
      setExportText(result.full);
    } catch (e) {
      // Keep the raw error in logs only; show product-tone copy + retry.
      if (typeof console !== "undefined")
        console.warn("[wiki] export failed", (e as Error).message);
      setToast({
        tone: "danger",
        message:
          locale === "ko"
            ? "내보내기를 만들지 못했어요. 새로고침한 뒤 다시 시도해 주세요."
            : "Couldn't build the export. Refresh and try again.",
      });
    } finally {
      setExporting(false);
    }
  }

  // Stable row callbacks so changing expandedId only re-renders the affected
  // rows, not all 200. Functional setState keeps these out of the dep array.
  const handleAddTag = useCallback((tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
  }, []);
  const handleSeeInGraph = useCallback((pageId: string) => {
    router.push({ pathname: "/", params: { highlightWikiPageId: pageId } });
  }, []);
  const handleAskSecondB = useCallback((title: string) => {
    router.push({ pathname: "/secondb", params: { fromNode: title } });
  }, []);

  const renderPage = useCallback(
    ({ item: p }: { item: WikiPageRow }) => (
      <WikiPageListRow
        page={p}
        locale={locale}
        expanded={expandedId === p.id}
        inDeg={inDegreeById.get(p.id) ?? 0}
        isHub={hubIds.has(p.id)}
        backlinks={backlinksById[p.id]}
        phase1Running={phase1RunningId === p.id}
        onToggleExpand={toggleExpand}
        onAddTag={handleAddTag}
        onRunPhase1={handleRunPhase1OnPage}
        onDelete={handleDeletePage}
        onSeeInGraph={handleSeeInGraph}
        onAskSecondB={handleAskSecondB}
      />
    ),
    [
      locale,
      expandedId,
      inDegreeById,
      hubIds,
      backlinksById,
      phase1RunningId,
      toggleExpand,
      handleAddTag,
      handleRunPhase1OnPage,
      handleDeletePage,
      handleSeeInGraph,
      handleAskSecondB,
    ],
  );

  // Auth/profile gate — after all hooks so Rules of Hooks hold.
  if (authLoading) {
    return (
      <PremiumAppShell>
        <View style={styles.shellCenter}>
          <PremiumLoadingState message={locale === "ko" ? "서재를 불러오는 중이에요…" : "Loading wiki…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }
  // No-profile OAuth session must not reach this LLM screen (Run Phase 1 →
  // Gemini) before C10 age-gate + PIPA consent. (Root gate in _layout covers too.)
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  // Everything above the page list (hero, facets, pulse, search, utility row,
  // stats/export cards, tag filter) rides along as the FlatList header so the
  // whole screen scrolls as one while only the rows virtualize.
  const header = (
    <View style={styles.headerWrap}>
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={VILLAGE_UI.knowledge.island}
          worker={VILLAGE_UI.knowledge.worker}
          accent={VILLAGE_UI.knowledge.accent}
          speech={t("hero.speech")}
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
                hitSlop={14}
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
            <PulseStat label={locale === "ko" ? "별가루" : "Pieces"} value={stats.pageCount} />
            <View style={styles.pulseDivider} />
            <PulseStat label={locale === "ko" ? "연결" : "Links"} value={stats.edgeCount} accent />
            <View style={styles.pulseDivider} />
            <PulseStat
              label={locale === "ko" ? "외딴 별가루" : "Orphans"}
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
              locale === "ko" ? "별가루 검색: 제목이나 저장 이름" : "Search pieces by title or saved name"
            }
            accessibilityLabel={locale === "ko" ? "지식 창고 검색" : "Search the knowledge store"}
          />
        ) : null}

        {pages.length > 0 ? (
          <View style={styles.exportAction}>
            <View style={styles.exportActionText}>
              <Text variant="caption" color="brand">
                {t("exportActionTitle")}
              </Text>
              <Text variant="body" color="textMuted">
                {t("exportActionBody")}
              </Text>
              <Text variant="subtle" color="textSubtle">
                {t("exportActionExample")}
              </Text>
            </View>
            <Button
              label={t("export")}
              variant="primary"
              style={styles.exportActionBtn}
              onPress={handleExport}
              loading={exporting}
              disabled={exporting}
              accessibilityHint={t("exportActionHint")}
            />
          </View>
        ) : null}

        {/* Utility row: lower-frequency tools sit a step down the hierarchy. */}
        <View style={styles.actionsUtility}>
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
            accessibilityHint={
              statsVisible
                ? locale === "ko"
                  ? "지식 그래프 세부 통계를 숨깁니다."
                  : "Hides graph detail metrics."
                : locale === "ko"
                  ? "지식 그래프 세부 통계를 보여줍니다."
                  : "Shows graph detail metrics."
            }
            accessibilityState={{ expanded: statsVisible }}
          />
          <Link href="/capture" asChild>
            <Button
              label={t("back")}
              variant="secondary"
              style={styles.actionBtn}
              accessibilityHint={
                locale === "ko" ? "캡처 화면으로 돌아갑니다." : "Opens capture from the knowledge store."
              }
            />
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
                    ? `자료 ${stats.countByKind.source} · 이름 ${stats.countByKind.entity} · 아이디어 ${stats.countByKind.concept}`
                    : `${stats.countByKind.source} sources · ${stats.countByKind.entity} names · ${stats.countByKind.concept} ideas`}
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
                    {displayPageName(h)} · {locale === "ko" ? `${h.inDegree}회 참고됨` : `cited ${h.inDegree} time${h.inDegree === 1 ? "" : "s"}`}
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
                    .map((o) => displayPageName(o))
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
                        setToast({
                          tone: "success",
                          message: locale === "ko" ? "클립보드에 복사했어요." : "Copied to clipboard.",
                        });
                      } catch {
                        setToast({
                          tone: "danger",
                          message:
                            locale === "ko"
                              ? "복사하지 못했어요. 아래 텍스트를 직접 선택해 주세요."
                              : "Copy failed. Select the text below manually.",
                        });
                      }
                    } else {
                      setToast({
                        tone: "info",
                        message:
                          locale === "ko"
                            ? "자동 복사가 지원되지 않아요. 아래 텍스트를 직접 선택해 주세요."
                            : "Auto-copy is not supported here. Select the text below manually.",
                      });
                    }
                  }}
                  hitSlop={14}
                  style={styles.exportTextLink}
                  accessibilityRole="button"
                  accessibilityLabel={locale === "ko" ? "내보낸 지식 창고 복사" : "Copy exported knowledge store"}
                >
                  <Text variant="caption" color="brand">
                    {locale === "ko" ? "복사" : "Copy"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setExportText(null)}
                  hitSlop={14}
                  style={styles.exportTextLink}
                  accessibilityRole="button"
                  accessibilityLabel={locale === "ko" ? "내보내기 미리보기 닫기" : "Close export preview"}
                >
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
              {t("exportHelper")}
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={locale === "ko" ? `${tag} 태그 필터` : `Filter by tag ${tag}`}
                  >
                    <Text variant="subtle" color={active ? "background" : "textMuted"}>
                      #{tag}
                    </Text>
                  </Pressable>
                );
              })}
              {activeTags.length > 0 ? (
                <Pressable
                  onPress={() => setActiveTags([])}
                  style={styles.clearChip}
                  accessibilityRole="button"
                  accessibilityLabel={locale === "ko" ? "태그 필터 모두 지우기" : "Clear all tag filters"}
                >
                  <Text variant="subtle" color="textMuted">
                    {t("clear")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
    </View>
  );

  // ListEmptyComponent covers the three "no rows" states the original chain
  // rendered: still loading, no pages at all, or a search with no match.
  const listEmpty = loading ? (
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
            ? "아직 창고가 조용해요. 오늘의 별가루나 링크를 저장하면 여기서 다시 찾아볼 수 있어요."
            : "The store is quiet for now. Save a piece or a link and you'll find it here again."}
      </Text>
      {activeTags.length === 0 ? (
        <View style={styles.emptyCtaRow}>
          <Link href="/capture" asChild>
            <Button
              label={locale === "ko" ? "오늘의 별가루 남기기" : "Leave today's piece"}
              variant="primary"
              accessibilityHint={
                locale === "ko" ? "캡처 화면을 열어 오늘의 별가루를 저장합니다." : "Opens capture to save today's piece."
              }
            />
          </Link>
          <Link href="/capture" asChild>
            <Button
              label={locale === "ko" ? "별가루 담기" : "Capture a piece"}
              variant="secondary"
              accessibilityHint={
                locale === "ko" ? "캡처 화면을 열어 새 별가루를 저장합니다." : "Opens capture to save a new piece."
              }
            />
          </Link>
        </View>
      ) : null}
    </View>
  ) : (
    <View style={styles.emptyCard}>
      <Text variant="body" color="textMuted" style={styles.emptyText}>
        {locale === "ko"
          ? `'${query.trim()}'에 맞는 별가루가 없어요.`
          : `No pieces match '${query.trim()}'.`}
      </Text>
    </View>
  );

  return (
    <PremiumAppShell>
      <FlatList
        data={loading ? [] : visiblePages}
        keyExtractor={(p) => p.id}
        renderItem={renderPage}
        ListHeaderComponent={header}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.scroll}
        ItemSeparatorComponent={ListGap}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={semantic.brand}
          />
        }
      />
      {/* 모모 appears briefly to label the organized page (companion pack §3) */}
      {companion.moment ? (
        <CompanionMoment moment={companion.moment} style={styles.companionFlash} />
      ) : null}
      <PremiumModal
        visible={pendingDeletePage !== null}
        onClose={() => {
          if (deletingPageId === null) setPendingDeletePage(null);
        }}
        accessibilityLabel={locale === "ko" ? "위키 페이지 삭제 확인" : "Delete wiki page confirmation"}
      >
        <Text variant="heading">
          {locale === "ko" ? "위키 페이지를 삭제할까요?" : "Delete this wiki page?"}
        </Text>
        <Text variant="body" color="textMuted" style={styles.deleteModalBody}>
          {locale === "ko"
            ? "이 페이지와 연결된 정보도 함께 정리돼요. 되돌릴 수 없습니다."
            : "Related links to this page are cleaned up too. This cannot be undone."}
        </Text>
        {pendingDeletePage ? (
          <Text variant="subtle" color="textSubtle" numberOfLines={2}>
            {pendingDeletePage.title}
          </Text>
        ) : null}
        <View style={styles.deleteModalActions}>
          <Button
            label={locale === "ko" ? "취소" : "Cancel"}
            variant="secondary"
            onPress={() => setPendingDeletePage(null)}
            disabled={deletingPageId !== null}
            style={styles.deleteModalButton}
            accessibilityHint={locale === "ko" ? "삭제하지 않고 닫습니다." : "Closes without deleting."}
          />
          <Button
            label={locale === "ko" ? "삭제" : "Delete"}
            variant="danger"
            onPress={() => void confirmDeletePage()}
            loading={deletingPageId !== null}
            disabled={deletingPageId !== null}
            style={styles.deleteModalButton}
            accessibilityHint={
              locale === "ko"
                ? "이 위키 페이지와 연결 정보를 삭제합니다."
                : "Deletes this wiki page and its related links."
            }
          />
        </View>
      </PremiumModal>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
    </PremiumAppShell>
  );
}

// Extracted, memoized row so flipping expandedId (or any single-row state)
// re-renders only the affected rows, not all 200 pages. Named *ListRow to
// avoid colliding with the WikiPageRow data type imported above.
type WikiPageListRowProps = {
  page: WikiPageRow;
  locale: "en" | "ko";
  expanded: boolean;
  inDeg: number;
  isHub: boolean;
  backlinks: WikiPageRow[] | undefined;
  phase1Running: boolean;
  onToggleExpand: (page: WikiPageRow) => void;
  onAddTag: (tag: string) => void;
  onRunPhase1: (page: WikiPageRow) => void;
  onDelete: (page: WikiPageRow) => void;
  onSeeInGraph: (pageId: string) => void;
  onAskSecondB: (title: string) => void;
};

const WikiPageListRow = React.memo(function WikiPageListRow({
  page: p,
  locale,
  expanded,
  inDeg,
  isHub,
  backlinks,
  phase1Running,
  onToggleExpand,
  onAddTag,
  onRunPhase1,
  onDelete,
  onSeeInGraph,
  onAskSecondB,
}: WikiPageListRowProps) {
  const { t } = useTranslation("wiki");
  return (
                <Pressable
                  onPress={() => onToggleExpand(p)}
                  style={[
                    styles.row,
                    { borderStartColor: semantic[KIND_BORDER[p.kind]], borderStartWidth: 3 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={locale === "ko" ? `${p.title} 위키 페이지 열기` : `Open wiki page ${p.title}`}
                  accessibilityHint={
                    expanded
                      ? locale === "ko"
                        ? "본문과 연결 정보를 닫습니다"
                        : "Collapses body and link details"
                      : locale === "ko"
                        ? "본문과 연결 정보를 엽니다"
                        : "Expands body and link details"
                  }
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
                      {locale === "ko" ? `저장 이름: ${savedName(p.slug)}` : `Saved as ${savedName(p.slug)}`}
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
                            onAddTag(tag);
                          }}
                          style={styles.inlineTagChip}
                          accessibilityRole="button"
                          accessibilityLabel={locale === "ko" ? `${tag} 태그 필터 추가` : `Add tag filter ${tag}`}
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
                                void onRunPhase1(p);
                              }}
                              disabled={phase1Running}
                              style={styles.phase1Trigger}
                              hitSlop={14}
                              accessibilityRole="button"
                              accessibilityLabel={
                                locale === "ko"
                                  ? `${p.title} 요약과 질문 만들기`
                                  : `Build source brief for ${p.title}`
                              }
                              accessibilityState={{ disabled: phase1Running, busy: phase1Running }}
                            >
                              <Text variant="caption" color="brand">
                                {phase1Running
                                  ? locale === "ko"
                                    ? "요약 중…"
                                    : "Summarizing…"
                                  : locale === "ko"
                                    ? "요약과 질문 만들기 (요약 + 4질문)"
                                    : "Build source brief (summary + 4 questions)"}
                              </Text>
                            </Pressable>
                          );
                        }
                        return (
                          <View style={styles.phase1Card}>
                            <View style={styles.phase1Header}>
                              <Text variant="caption" color="brand">
                                {locale === "ko" ? "요약과 질문" : "Source brief"}
                              </Text>
                              <Text variant="subtle" color="textSubtle">
                                {new Date(p1.generated_at).toLocaleDateString(
                                  locale === "ko" ? "ko-KR" : "en-US",
                                  { month: "short", day: "numeric" },
                                )}
                                {" · "}
                                {p1.model.startsWith("mock:")
                                  ? locale === "ko"
                                    ? "샘플"
                                    : "Sample"
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
                          {t("backlinks")} ({backlinks?.length ?? "…"})
                        </Text>
                      </View>
                      {(backlinks ?? []).map((b) => (
                        <Text key={b.id} variant="subtle" color="textMuted">
                          ← {displayPageName(b)}
                        </Text>
                      ))}
                      {/* Handoffs (wiki-records §6/§7): jump to this page on
                          the graph, or ask SecondB about it. */}
                      <View style={styles.pageHandoffs}>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            onSeeInGraph(p.id);
                          }}
                          hitSlop={14}
                          style={styles.pageHandoffBtn}
                          accessibilityRole="button"
                          accessibilityLabel={locale === "ko" ? `${p.title} 그래프에서 보기` : `See ${p.title} in graph`}
                        >
                          <Text variant="caption" color="brand">
                            {locale === "ko" ? "그래프에서 보기" : "See in graph"}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            onAskSecondB(p.title);
                          }}
                          hitSlop={14}
                          style={styles.pageHandoffBtn}
                          accessibilityRole="button"
                          accessibilityLabel={locale === "ko" ? `${p.title}에 대해 세컨비에게 묻기` : `Ask SecondB about ${p.title}`}
                        >
                          <Text variant="caption" color="brand">
                            {locale === "ko" ? "세컨비에게 묻기" : "Ask SecondB"}
                          </Text>
                        </Pressable>
                      </View>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          void onDelete(p);
                        }}
                        hitSlop={14}
                        style={styles.deletePageLink}
                        accessibilityRole="button"
                        accessibilityLabel={locale === "ko" ? `${p.title} 위키 페이지 삭제` : `Delete wiki page ${p.title}`}
                      >
                        <Text variant="caption" color="textSubtle">
                          {locale === "ko" ? "이 페이지 삭제" : "Delete page"}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Pressable>
  );
});

// Thin spacer between rows — replaces the old list container's `gap`. Kept as
// its own component (not a per-item style wrapper) so it never sits inside a
// row's pressable area or introduces the style-wrapper gap bug.
function ListGap() {
  return <View style={styles.rowGap} />;
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
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
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
  exportAction: {
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  exportActionText: { gap: spacing.xs },
  exportActionBtn: { alignSelf: "stretch" },
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
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
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
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  shellCenter: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
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
  inlineTagChip: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
  },
  // Header rides as ListHeaderComponent; it owns the inter-section gap the
  // ScrollView used to provide. The content container's own `gap` separates it
  // from the first row, so no extra bottom margin here (avoids a doubled gap).
  headerWrap: { gap: spacing.lg },
  // Separator between virtualized rows — replaces the old list container's gap.
  rowGap: { height: spacing.sm },
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
  rowSlug: { flex: 1, minWidth: 0 },
  rowInDeg: { marginStart: spacing.sm, flexShrink: 0 },
  // A-6: user-authored titles follow the P2-10 font preference via <Text variant="body">.
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
    borderStartWidth: 3,
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  phase1Header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  phase1QHeader: { marginTop: spacing.xs },
  phase1Meta: { marginTop: spacing.xs, gap: 2 },
  phase1Trigger: { minHeight: 44, justifyContent: "center", paddingVertical: spacing.xs, marginBottom: spacing.sm },
  exportTextLink: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
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
  deletePageLink: {
    alignSelf: "flex-end",
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  deleteModalBody: { lineHeight: 21 },
  deleteModalActions: { flexDirection: "row", gap: spacing.sm },
  deleteModalButton: { flex: 1 },
  toastWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    alignItems: "stretch",
  },
  statsCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: 1,
    borderStartWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statsTopRow: { flexDirection: "row", gap: spacing.lg },
  statsBlock: { flex: 1, gap: 2 },
  statsSectionHead: { letterSpacing: 0, marginTop: spacing.xs },
});

export default function Wiki() {
  if (isDeepSpaceUI()) return <DeepSpaceWikiScreen />;
  return <WikiLegacy />;
}
