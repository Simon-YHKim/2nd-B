import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { colors, spacing } from "@/theme/tokens";
import { deepSpace, flattenAlpha } from "@/lib/theme/tokens";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { canonGlyph } from "@/components/pixel/pixel-glyphs";
import { m3 } from "@/lib/theme/m3";
import { stripDomainTags } from "@/lib/persona/domain-stars";
import { ddsStyles as styles } from "./dds-styles";
import { Text } from "@/components/ui/Text";
import { DeepSpaceLoader, SecondbStatusHeader } from "@/components/deepspace";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { WikiGraph } from "@/components/deep-space/WikiGraph";
import { RecordsGraph } from "@/components/deep-space/RecordsGraph";
import { SegBtn } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import { listRecentRecords } from "@/lib/records/create";
import { buildRecordsGraph } from "@/lib/records/records-graph";
import { listSourcePieces } from "@/lib/records/source-pieces";
import { listAllWikiLinks, listWikiPages } from "@/lib/wiki/queries";
import type { WikiPageRow } from "@/lib/wiki/types";
import { buildDeepWikiView, type WikiEdge } from "./wiki-graph-view";
import { buildRecordsTimeline, type TimelineLabels, type TimelineRecord } from "./records-timeline";

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `deepSpace.card` — 위키·기록 카드 배경.
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const wrAlpha = (c: string, a: number): string => flattenAlpha(c, a, deepSpace.card);

type Tx = (key: string, options?: Record<string, unknown>) => string;
function dsTimeLabels(t: Tx): TimelineLabels {
  return {
    today: t("time.today"),
    yesterday: t("time.yesterday"),
    monthDay: (m, d) => t("time.monthDay", { month: m, day: d }),
    now: t("time.now"),
    hoursAgo: (h) => t("time.hoursAgo", { count: h }),
    fallbackTitle: t("time.recordFallback"),
  };
}
function useWikiGraphData() {
  const { userId, loading: authLoading } = useAuth();
  const [pages, setPages] = useState<WikiPageRow[]>([]);
  const [edges, setEdges] = useState<WikiEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      listWikiPages(userId, { limit: 200 }),
      listAllWikiLinks(userId).catch(() => [] as WikiEdge[]),
    ])
      .then(([p, e]) => {
        if (!alive) return;
        setPages(p);
        setEdges(e);
      })
      .catch(() => {
        if (!alive) return;
        setPages([]);
        setEdges([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return { userId, authLoading, pages, edges, loading };
}

function GraphLoading() {
  return (
    <View style={styles.center}>
      <DeepSpaceLoader variant="dots" />
    </View>
  );
}

function DockBody({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {title ? <View style={styles.titleRow}><View><Text variant="heading" style={styles.title}>{title}</Text>{subtitle ? <Text variant="subtle" style={styles.subtitle}>{subtitle}</Text> : null}</View></View> : null}
      {children}
    </ScrollView>
  );
}

export function FilterChip({ label, active, violet, onPress }: { label: string; active?: boolean; violet?: boolean; onPress?: () => void }) {
  const inner = (
    <Text variant="caption" style={[styles.fchipText, active && styles.fchipTextActive, violet && styles.fchipTextViolet]}>{label}</Text>
  );
  const chipStyle = [styles.fchip, active && styles.fchipActive, violet && styles.fchipViolet];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={chipStyle}
        accessibilityRole="button"
        accessibilityState={{ selected: !!active }}
        accessibilityLabel={label}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={chipStyle}>{inner}</View>;
}

// rev2 위키(records) — display type derived from a record's kind/tags/body so the
// list can carry the reference's 5 content-type icons (글·링크·음성·사진·할 일)
// without a dedicated column in the DB. Purely presentational.
type RType = "text" | "link" | "voice" | "photo" | "todo";
type RecordsOrigin = "record" | "source";
type RecordsTimelineRecord = TimelineRecord & { origin?: RecordsOrigin; sourceId?: string };

const TYPE_CHIPS: { id: RType | "all" | "unfiled"; labelKey: string }[] = [
  { id: "all", labelKey: "records.filterAll" },
  { id: "text", labelKey: "records.typeText" },
  { id: "link", labelKey: "records.typeLink" },
  { id: "voice", labelKey: "records.typeVoice" },
  { id: "photo", labelKey: "records.typePhoto" },
  { id: "unfiled", labelKey: "records.typeUnfiled" },
];
const URL_RE = /https?:\/\//;
const DUR_RE = /\(\d+:\d{2}\)/;

function recordType(r: TimelineRecord): RType {
  const tags = (r.tags ?? []).map((s) => s.toLowerCase());
  const has = (...k: string[]) => k.some((x) => tags.includes(x));
  if (r.kind === "audit_response") return "todo";
  const hay = `${r.topic ?? ""} ${r.summary ?? ""} ${r.body ?? ""}`;
  if (has("link", "링크", "url") || URL_RE.test(hay)) return "link";
  if (has("voice", "음성") || DUR_RE.test(hay)) return "voice";
  if (has("photo", "사진", "image", "이미지")) return "photo";
  return "text";
}
function isUnfiled(r: TimelineRecord): boolean {
  return stripDomainTags(r.tags ?? []).length === 0;
}
function timelineTitle(r: TimelineRecord, fallback: string): string {
  const s = r.summary?.trim() || r.topic?.trim();
  if (s) return s;
  const body = r.body?.trim();
  if (body) {
    const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
    if (line) return line.length > 80 ? `${line.slice(0, 80).trimEnd()}…` : line;
  }
  return fallback;
}
function recordRouteParams(r: RecordsTimelineRecord) {
  return r.origin === "source" && r.sourceId
    ? { id: r.sourceId, origin: "source" }
    : { id: r.id };
}
function recordRouteParamsById(id: string, records: readonly RecordsTimelineRecord[]) {
  const hit = records.find((r) => r.id === id || r.sourceId === id);
  return hit ? recordRouteParams(hit) : { id };
}

// Static Material-symbol-style glyphs (inline SVG, no animation) — Android-safe
// per ANDROID_QA_GUIDELINES (no rAF, no dynamic SVG churn).
/**
 * 기록 종류별 아이콘. 다섯 종류가 각각 인라인 곡선이었다.
 *
 * 문자열 레지스트리가 아니라 JSX 였던 탓에 레지스트리 스캔에 안 잡혔고,
 * **화면 DOM 을 세고 나서야** 드러났다.
 */
const TYPE_GLYPH: Record<string, string> = {
  text: "edit_note",
  link: "link",
  voice: "mic",
  photo: "photo_camera",
  todo: "task_alt",
};

function TypeGlyph({ type }: { type: RType }) {
  return <PixelGlyph name={canonGlyph(TYPE_GLYPH[type] ?? "article")} color={colors.cyanSoft} size={19} />;
}

const RecordCard = memo(function RecordCard({ r, type, time, unfiled, onPress }: { r: RecordsTimelineRecord; type: RType; time?: string; unfiled: boolean; onPress: (record: RecordsTimelineRecord) => void }) {
  const { t } = useTranslation("deepspace");
  const title = timelineTitle(r, t("records.fallbackTitle"));
  const tags = stripDomainTags(r.tags ?? []).slice(0, 2);
  // No explicit accessibilityLabel: an explicit label REPLACES the flattened child
  // text, so TalkBack heard only the title and never the time label, tags, or the
  // 미분류 badge. Without it, RN concatenates the children in render order.
  return (
    <Pressable style={rStyles.card} android_ripple={{ color: wrAlpha(m3.color.tertiary, 0.12) }} onPress={() => onPress(r)} accessibilityRole="button">
      <View style={rStyles.iconBox}><TypeGlyph type={type} /></View>
      <View style={rStyles.body}>
        <RNText numberOfLines={1} style={rStyles.title}>{title}</RNText>
        <View style={rStyles.metaRow}>
          {time ? <RNText style={rStyles.time}>{time}</RNText> : null}
          {unfiled ? (
            <View style={rStyles.badge}><RNText style={rStyles.badgeTxt}>{t("records.unfiledBadge")}</RNText></View>
          ) : (
            tags.map((tag, i) => (
              <View key={tag} style={rStyles.metaTagWrap}>
                {(time || i > 0) ? <RNText style={rStyles.metaDot}>·</RNText> : null}
                <RNText style={rStyles.metaTag}>{tag}</RNText>
              </View>
            ))
          )}
        </View>
      </View>
    </Pressable>
  );
});

// FlatList inter-row spacing (reproduces the old rStyles.list gap between cards).
function RecordSeparator() {
  return <View style={rStyles.rowSep} />;
}

export function DeepSpaceRecordsScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const isKo = i18n.language === "ko";
  const { userId, loading: authLoading } = useAuth();
  // ?tags=a,b filters to pieces whose tags intersect the set (trinity 영역 drilldown).
  const recordsParams = useLocalSearchParams<{ tags?: string }>();
  const tagFilter = useMemo(
    () =>
      (recordsParams.tags ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    [recordsParams.tags],
  );
  // When viewing a single domain (?tags=domain:X), offer a "채워넣기" CTA to that
  // domain's real input screen so the read-only records view isn't a dead end.
  // (career/relation/leisure have dedicated writers; others fall through to none.)
  const domainWriter = useMemo(() => {
    for (const tag of tagFilter) {
      if (!tag.startsWith("domain:")) continue;
      const slug = tag.slice(7);
      if (slug === "relation") return "/people";
      if (slug === "recreation") return "/rest";
      if (slug === "career") return "/career";
    }
    return null;
  }, [tagFilter]);
  const [records, setRecords] = useState<RecordsTimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Bumped to re-run the load: on focus re-entry (useFocusRefetch) and on the
  // error-state retry. The effect's alive-flag cleanup cancels any in-flight
  // read before the next one commits, so overlapping loads never race.
  const [reloadKey, setReloadKey] = useState(0);
  const [typeFilter, setTypeFilter] = useState<RType | "all" | "unfiled">("all");
  const [view, setView] = useState<"list" | "graph">("list");
  // Reserve exactly the floating companion header's measured height so the
  // 목록/그래프 toggle never sits under the briefing bubble when its tip wraps to
  // two lines (the previous fixed clearance under-reserved it). Falls back to 88.
  const [headerH, setHeaderH] = useState(88);
  // Graph mode reuses the deterministic knowledge-graph view (wiki pages/edges).
  // D-27 Phase 1b: the /records graph runs on the user's RECORDS (the canonical
  // node-set), connected by shared tags — not the near-empty wiki_pages track
  // that left the graph blank for a normal user.
  // Only run the O(n^2) shared-tag graph build when the graph view is actually
  // open; passing [] otherwise yields the same-shaped empty graph at ~0 cost, so
  // list-only users stop paying the full compute on every data load (audit wave-3).
  const recordsGraph = useMemo(
    () =>
      buildRecordsGraph(view === "graph" ? records : [], {
        locale: isKo ? "ko" : "en",
        // Localized node labels: the same names the home constellation uses, so
        // one star never carries two names across screens (es saw "Relaciones"
        // on home but "Relationship" here before this).
        labels: {
          polaris: t("home:ds.home.polaris"),
          star: (id) => t(`home:ds.home.domainName.${id}`),
          untitled: t("deepspace:recordsGraph.untitled"),
        },
      }),
    [records, isKo, view, t],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    setLoadError(false);
    // /records shows EVERY saved piece — including non-journal Capture/Import
    // (글/링크/사진/file) that land in `sources`, not just `records` — so a
    // source-only user no longer sees a false-empty list. Sources are
    // best-effort: a sources failure degrades to records-only and never blanks
    // the screen (mirrors core-brain's merged evidence read). Source rows keep
    // their DB id for detail navigation while the list id stays collision-free.
    (async () => {
      // The canonical records read is NOT coerced to [] on failure. Doing so
      // rendered the genuine-empty state ("아직 기록이 없어요" + 담기 CTA) to a
      // user whose network/Supabase call merely failed — telling someone with
      // records that they have none. A records-read failure is a distinct error
      // state (retry) instead. Sources stay best-effort (source-only users still
      // merge in below), so only the primary records read gates the error.
      let recs: RecordsTimelineRecord[] = [];
      let recordsFailed = false;
      try {
        recs = (await listRecentRecords(userId)) as RecordsTimelineRecord[];
      } catch {
        recordsFailed = true;
      }
      // Same source of truth as /insights. This read used to live here inline, and
      // /insights had no equivalent at all -- which is exactly how the two screens came to
      // disagree about how much the user had captured.
      let srcRecs: RecordsTimelineRecord[] = [];
      try {
        srcRecs = (await listSourcePieces(userId)).map(
          (s) =>
            ({
              id: s.id,
              origin: "source",
              sourceId: s.sourceId,
              kind: "note",
              summary: s.title,
              topic: s.title,
              body: null,
              tags: s.tags,
              created_at: s.created_at,
            }) as RecordsTimelineRecord,
        );
      } catch {
        // records-only fallback (sources stay best-effort)
      }
      if (!alive) return;
      if (recordsFailed) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      const merged = [...recs, ...srcRecs].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      setRecords(merged);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [userId, reloadKey]);

  // Reload on focus re-entry so a delete on the record detail (then router.back)
  // is reflected here; the shared helper skips the initial mount, so this never
  // double-loads on first render.
  useFocusRefetch(() => setReloadKey((k) => k + 1), Boolean(userId));

  // Stable across renders so the memoized RecordCard's onPress prop does not
  // change (React.memo keeps unchanged rows from re-rendering on filter taps).
  const openRecord = useCallback(
    (record: RecordsTimelineRecord) => router.push({ pathname: "/record/[id]", params: recordRouteParams(record) }),
    [],
  );

  // Per-record time label reuses the tested timeline bucketer (방금 / N시간 전 / 어제 …).
  // labelEveryItem: this flat list has no date-group headers, so older rows need
  // their own day label - without it every non-today record showed no time at all.
  const timeById = useMemo(() => {
    const m = new Map<string, string>();
    buildRecordsTimeline(records, { labels: dsTimeLabels(t), labelEveryItem: true }).forEach((g) => g.items.forEach((it) => m.set(it.id, it.timeLabel)));
    return m;
  }, [records, t]);

  const scoped = useMemo(() => {
    if (tagFilter.length === 0) return records;
    return records.filter((r) => (r.tags ?? []).some((tag) => tagFilter.includes(tag.toLowerCase())));
  }, [records, tagFilter]);
  const unfiledCount = useMemo(() => scoped.filter(isUnfiled).length, [scoped]);
  const filtered = useMemo(() => {
    if (typeFilter === "all") return scoped;
    if (typeFilter === "unfiled") return scoped.filter(isUnfiled);
    return scoped.filter((r) => recordType(r) === typeFilter);
  }, [scoped, typeFilter]);

  const renderRecord = useCallback(
    ({ item }: { item: RecordsTimelineRecord }) => (
      <RecordCard
        r={item}
        type={recordType(item)}
        time={timeById.get(item.id) || undefined}
        unfiled={isUnfiled(item)}
        onPress={openRecord}
      />
    ),
    [timeById, openRecord],
  );

  if (authLoading) {
    return (
      <DeepSpaceScreen active="wiki" header="none">
        <View style={styles.wikiFloatClear}><GraphLoading /></View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const total = scoped.length;

  // Header pieces are shared by the list (as FlatList ListHeaderComponent) and
  // the graph view (inside its ScrollView). Only one view renders at a time, so
  // reusing the same elements across the two branches is safe.
  const viewToggleRow = (
    <View style={rStyles.titleRow}>
      <RNText style={rStyles.wikiTitle}>{t("records.wikiTitle")}</RNText>
      <SegBtn
        segments={[
          { key: "list", label: t("records.viewList") },
          { key: "graph", label: t("records.viewGraph") },
        ]}
        selected={[view]}
        onSelect={(key) => setView(key === "graph" ? "graph" : "list")}
        style={rStyles.viewToggle}
      />
    </View>
  );

  const triageCards = (
    <>
      {domainWriter ? (
        <Pressable
          style={rStyles.triageCard}
          android_ripple={{ color: wrAlpha(m3.color.tertiary, 0.12) }}
          onPress={() => router.push(domainWriter)}
          accessibilityRole="button"
          accessibilityLabel={t("ds.wikiRecords.fillStar")}
        >
          <View style={rStyles.triageCol}>
            <RNText style={rStyles.triageTitle}>{t("ds.wikiRecords.fillStar")}</RNText>
            <RNText style={rStyles.triageBody}>{t("ds.wikiRecords.fillStarBody")}</RNText>
          </View>
          <RNText style={rStyles.triageChev}>›</RNText>
        </Pressable>
      ) : null}

      <Pressable
        style={rStyles.triageCard}
        android_ripple={{ color: wrAlpha(m3.color.tertiary, 0.12) }}
        // med#5: the card counts UNFILED pieces, but it used to route to
        // /inbox (알림), which has no triage UI — the promised sorting is this
        // list's own 미분류 filter, one tap away on the same screen.
        onPress={() => setTypeFilter("unfiled")}
        accessibilityRole="button"
        accessibilityLabel={t("records.triageTitle", { count: unfiledCount })}
      >
        <View style={rStyles.triageIcon}>
          <PixelGlyph name="inbox" color={colors.soul} size={20} />
        </View>
        <View style={rStyles.triageCol}>
          <RNText style={rStyles.triageTitle}>{t("records.triageTitle", { count: unfiledCount })}</RNText>
          <RNText style={rStyles.triageBody}>{t("records.triageBody")}</RNText>
        </View>
        <RNText style={rStyles.triageChev}>›</RNText>
      </Pressable>
    </>
  );

  const chipStrip = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={rStyles.chipStrip}
    >
      {TYPE_CHIPS.map((c) => (
        <FilterChip key={c.id} label={t(c.labelKey)} active={typeFilter === c.id} onPress={() => setTypeFilter(c.id)} />
      ))}
    </ScrollView>
  );

  // Honest error state (records read failed) with a retry, distinct from the
  // genuine-empty state so a user with records is never told they have none.
  const errorState = (
    <View style={styles.wikiPageOpen}>
      <Text variant="body" style={styles.wikiBody}>{t("records.loadError")}</Text>
      <Pressable style={styles.primary} onPress={() => setReloadKey((k) => k + 1)} accessibilityRole="button">
        <Text variant="caption" style={styles.primaryText}>{t("records.retry")}</Text>
      </Pressable>
    </View>
  );

  return (
    <DeepSpaceScreen active="wiki" header="none">
      {/* rev2 위키: companion FLOATS over the immersive surface (sb-app §4). */}
      <View
        pointerEvents="box-none"
        style={rStyles.floatHeader}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <SecondbStatusHeader
          text={total > 0 ? t("records.headerCount", { count: total }) : t("records.headerEmpty")}
          tip={unfiledCount > 0 ? t("records.tip", { count: unfiledCount }) : t("records.tipClear")}
        />
      </View>
      <View style={[styles.wikiFloatClear, { paddingTop: headerH + 8 }]}>
        {view === "list" ? (
          // The records list is virtualized (FlatList) and is the ONLY vertical
          // scroller here — the deep-space shell's fullbleed body is a plain flex
          // View (no outer ScrollView), so there is no nested-VirtualizedList
          // conflict. The header/triage/filter chips ride as ListHeaderComponent;
          // the chip strip is a cross-axis (horizontal) scroller, safe to nest.
          <FlatList
            data={loadError ? [] : filtered}
            keyExtractor={(r) => r.id}
            renderItem={renderRecord}
            ListHeaderComponent={
              <View style={rStyles.listHeader}>
                {viewToggleRow}
                {triageCards}
                {chipStrip}
              </View>
            }
            ListEmptyComponent={
              loadError ? (
                errorState
              ) : loading ? (
                <GraphLoading />
              ) : (
                <View style={styles.wikiPageOpen}>
                  <Text variant="body" style={styles.wikiBody}>{typeFilter === "all" ? t("records.emptyAll") : t("records.emptyKind")}</Text>
                  <Pressable style={styles.primary} onPress={() => router.push("/capture")} accessibilityRole="button">
                    <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
                  </Pressable>
                </View>
              )
            }
            ItemSeparatorComponent={RecordSeparator}
            contentContainerStyle={rStyles.listContent}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews
          />
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {viewToggleRow}
            {triageCards}
            {loadError ? (
              errorState
            ) : loading ? (
              <GraphLoading />
            ) : records.length > 0 ? (
              <RecordsGraph graph={recordsGraph} onOpenRecord={(id) => router.push({ pathname: "/record/[id]", params: recordRouteParamsById(id, records) })} />
            ) : (
              <View style={styles.wikiPageOpen}>
                <Text variant="body" style={styles.wikiBody}>{t("records.graphEmpty")}</Text>
                <Pressable style={styles.primary} onPress={() => router.push("/capture")} accessibilityRole="button">
                  <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </DeepSpaceScreen>
  );
}

const rStyles = StyleSheet.create({
  floatHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  wikiTitle: { color: colors.textTitle, fontSize: 26, fontWeight: "800", flexShrink: 1 },
  viewToggle: { width: 148, flexShrink: 0 },
  triageCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: colors.soulLine,
    borderRadius: m3.shape.large,
    backgroundColor: wrAlpha(deepSpace.soul, 0.1),
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  triageIcon: {
    width: 38,
    height: 38,
    borderRadius: m3.shape.medium,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: wrAlpha(deepSpace.soul, 0.16),
  },
  triageCol: { flex: 1, gap: 2 },
  triageTitle: { color: colors.textTitle, fontSize: 13.5, fontWeight: "700" },
  triageBody: { color: colors.textMid, fontSize: 11.5 },
  triageChev: { color: colors.soul, fontSize: 22, marginLeft: 4 },
  chipStrip: { flexDirection: "row", gap: 6, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  // FlatList outer padding (mirrors styles.scroll minus its gap — inter-row
  // spacing is the separator, header spacing is listHeader below).
  listContent: { padding: spacing.lg, paddingBottom: 40 },
  // Reproduces the old ScrollView's gap between the header rows and before the
  // first record now that the header rides as a single ListHeaderComponent.
  listHeader: { gap: spacing.md, marginBottom: spacing.md },
  rowSep: { height: spacing.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: m3.shape.large,
    backgroundColor: colors.cardBg,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: m3.shape.medium,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: { flex: 1, gap: 5 },
  title: { color: colors.textTitle, fontSize: 13.5 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  time: { color: colors.cyanDim, fontSize: 12, fontFamily: m3.font.mono },
  metaTagWrap: { flexDirection: "row", alignItems: "center" },
  metaDot: { color: colors.textLo, fontSize: 12, paddingHorizontal: 5 },
  metaTag: { color: colors.textLo, fontSize: 12 },
  badge: {
    marginLeft: 8,
    backgroundColor: colors.clay,
    borderRadius: m3.shape.small,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeTxt: { color: colors.textTitle, fontSize: 9, fontWeight: "700" },
});

export { DeepSpaceRecordDetailScreen } from "./dds-record-detail-screen";

export function DeepSpaceWikiScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const isKo = i18n.language === "ko";
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  // Deep-link to one page, by wiki_pages.id. Three screens hold a wiki page id and used
  // to push it at /record/[id], which looks a record up by that id and always 404s -- a
  // page id is not a record id. They send it here instead, which is where it belongs.
  // (The legacy wiki screen has focusSourceId, keyed on source_id; this is the live
  // deep-space screen and it read no params at all.)
  const { focusPageId } = useLocalSearchParams<{ focusPageId?: string }>();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // Which page row is expanded. null until the user taps; the first page renders
  // expanded by default (matching the old fixed-open-first behaviour) but any row
  // can now toggle open via its caret.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // rev2 P4b: list <-> node-graph view. The graph honours the same tag filter;
  // tapping a node twice opens it back in the list (progressive disclosure).
  const [wikiView, setWikiView] = useState<"list" | "graph">("list");

  // A ?focusPageId= deep link opens that page. Must sit ABOVE the early returns below --
  // a hook after a conditional return breaks the hook order (react-hooks/rules-of-hooks
  // caught this). Only fires once the pages have loaded and only if the id is really in
  // the list: a stale or foreign id falls back to the default (first page) rather than
  // leaving every row collapsed.
  useEffect(() => {
    if (!focusPageId || expandedId !== null) return;
    if (!pages.some((p) => p.id === focusPageId)) return;
    setExpandedId(focusPageId);
  }, [focusPageId, expandedId, pages]);

  // The page the user asked to open is pinned into the list: the graph draws every page but
  // the list keeps only the top 12 by connection count, so opening a sparsely-linked node
  // used to land on a list that did not contain it.
  const view = useMemo(
    () => buildDeepWikiView(pages, edges, { activeTag, pinnedId: expandedId }),
    [pages, edges, activeTag, expandedId],
  );
  const graphPages = useMemo(
    () =>
      pages
        .filter((p) => activeTag === null || p.tags.includes(activeTag))
        .map((p) => ({ id: p.id, title: p.title.trim() || p.slug, kind: p.kind })),
    [pages, activeTag],
  );

  if (authLoading) {
    return (
      <DeepSpaceScreen active="wiki" header="floating">
        <View style={styles.wikiFloatClear}>
          <DockBody title={t("wiki.title")}><GraphLoading /></DockBody>
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  // Default the first page open when nothing is explicitly toggled.
  const openId = expandedId ?? view.pages[0]?.id ?? null;

  // rev2 records: the companion FLOATS over the surface (sb-app), so the body
  // clears its height instead of being pushed by a header band.
  return (
    <DeepSpaceScreen active="wiki" header="floating">
      <View style={styles.wikiFloatClear}>
      <DockBody title={t("wiki.title")}>
      <View style={styles.wikiStatRow}>
        <View style={styles.wikiStat}><Text variant="heading" style={styles.wikiStatNum}>{view.pageCount}</Text><Text variant="subtle" style={styles.wikiStatCap}>{t("wiki.statPages")}</Text></View>
        <View style={styles.wikiStat}><Text variant="heading" style={[styles.wikiStatNum, styles.wikiStatNumCyan]}>{view.edgeCount}</Text><Text variant="subtle" style={styles.wikiStatCap}>{t("wiki.statLinks")}</Text></View>
      </View>
      <SegBtn
        segments={[
          { key: "list", label: t("wiki.viewList") },
          { key: "graph", label: t("wiki.viewGraph") },
        ]}
        selected={[wikiView]}
        onSelect={(key) => setWikiView(key === "graph" ? "graph" : "list")}
        style={styles.wikiViewToggle}
      />
      {view.tagChips.length > 0 ? (
        <View style={styles.filterRow}>
          <FilterChip label={t("wiki.filterAll")} active={activeTag === null} onPress={() => setActiveTag(null)} />
          {view.tagChips.map((c) => (
            <FilterChip
              key={c.tag}
              label={c.tag}
              active={activeTag === c.tag}
              onPress={() => setActiveTag((prev) => (prev === c.tag ? null : c.tag))}
            />
          ))}
        </View>
      ) : null}
      {loading ? (
        <GraphLoading />
      ) : wikiView === "graph" && graphPages.length > 0 ? (
        <WikiGraph
          pages={graphPages}
          edges={edges}
          isKo={isKo}
          onOpenPage={(id) => {
            setWikiView("list");
            setExpandedId(id);
          }}
        />
      ) : view.pages.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text variant="body" style={styles.wikiBody}>{activeTag !== null ? t("wiki.emptyTag") : t("wiki.emptyAll")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")} accessibilityRole="button">
            <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {view.pages.map((p) => {
            const isOpen = p.id === openId;
            const toggle = () => setExpandedId((prev) => ((prev ?? view.pages[0]?.id ?? null) === p.id ? null : p.id));
            if (isOpen) {
              return (
                <View key={p.id} style={styles.wikiPageOpen}>
                  <Pressable
                    style={styles.wikiPageHead}
                    onPress={toggle}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: true }}
                    accessibilityLabel={p.title}
                  >
                    <Text variant="heading" style={styles.wikiPageTitle}>{p.title}</Text>
                    <RNText style={styles.wikiCaret}>⌄</RNText>
                  </Pressable>
                  {p.snippet.length > 0 ? (
                    <Text variant="body" style={styles.wikiBody}>{p.snippet}</Text>
                  ) : null}
                  <View style={styles.wikiBacklinkRow}>
                    {/* A count, not a button. This row only renders inside the
                        EXPANDED card, so `p.id` is the page the user is already
                        looking at — the tap pushed a second, visually identical
                        /wiki with the same entry open. (It used to push
                        /record/[id] and land on "기록을 찾을 수 없어요"; #984
                        retargeted it to /wiki, which stopped the error screen but
                        left the destination degenerate.) The label named a
                        destination that did not exist, so the affordance goes and
                        the number stays. Listing the N linked pages inline is the
                        real fix and wants its own change: `edges` and `pages` are
                        both in scope here, so it is a disclosure, not a fetch. */}
                    <Text variant="subtle" style={styles.wikiBacklink}>↩ {t("wiki.backlinks", { count: p.connections })}</Text>
                    {p.tags[0] ? <Text variant="caption" pixelEn style={styles.tlTag}>{p.tags[0]}</Text> : null}
                  </View>
                </View>
              );
            }
            return (
              <Pressable
                key={p.id}
                style={styles.wikiPageRow}
                onPress={toggle}
                accessibilityRole="button"
                accessibilityState={{ expanded: false }}
                accessibilityLabel={p.title}
              >
                <View style={styles.wikiRowHead}>
                  <Text variant="caption" style={styles.wikiRowTitle} numberOfLines={1}>{p.title}</Text>
                  <Text variant="subtle" style={styles.wikiRowConn}>{t("wiki.connections", { count: p.connections })}</Text>
                </View>
                {p.snippet.length > 0 ? (
                  <Text variant="subtle" style={styles.wikiRowDesc} numberOfLines={1}>{p.snippet}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </>
      )}
      </DockBody>
      </View>
    </DeepSpaceScreen>
  );
}

