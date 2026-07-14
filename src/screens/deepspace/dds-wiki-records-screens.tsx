import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, FlatList, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { Redirect, router, useLocalSearchParams, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { colors, radius, spacing } from "@/theme/tokens";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import {
  DOMAIN_STARS,
  DOMAIN_TAG_PREFIX,
  domainTagFor,
  getDomainStar,
  isDomainId,
  isDomainTag,
  stripDomainTags,
  type DomainId,
} from "@/lib/persona/domain-stars";
import { ddsStyles as styles } from "./dds-styles";
import { parseStructured, structuredFieldLabel } from "@/lib/capture/structured";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { PremiumModal } from "@/components/premium";
import { DeepSpaceLoader, SecondbHead, SecondbStatusHeader } from "@/components/deepspace";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { WikiGraph } from "@/components/deep-space/WikiGraph";
import { RecordsGraph } from "@/components/deep-space/RecordsGraph";
import { SegBtn } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import { deleteRecord, getRecordById, listRecentRecords, updateRecord, updateRecordTags } from "@/lib/records/create";
import { buildRecordsGraph } from "@/lib/records/records-graph";
import { listSourcePieces } from "@/lib/records/source-pieces";
import { getSupabaseClient } from "@/lib/supabase/client";
import { listAllWikiLinks, listWikiPages } from "@/lib/wiki/queries";
import type { WikiPageRow } from "@/lib/wiki/types";
import { buildDeepWikiView, recencyLabel, type RecencyLabels, type WikiEdge } from "./wiki-graph-view";
import { buildRecordsTimeline, relatedByTag, type TimelineLabels, type TimelineRecord } from "./records-timeline";
import { relatedRecordsByEmbedding, recordsEmbeddingAllowed } from "@/lib/records/records-embeddings";
import { fetchPrivacyPrefs } from "@/lib/supabase/privacy";

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
function dsRecencyLabels(t: Tx): RecencyLabels {
  return {
    today: t("time.today"),
    yesterday: t("time.yesterday"),
    daysAgo: (n) => t("time.daysAgo", { count: n }),
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

function Shell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <DeepSpaceScreen active="home" variant="windowed" header="none" title={title ?? ""} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {subtitle ? <Text variant="subtle" style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </DeepSpaceScreen>
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

function TrashGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M4 7h16M10 7V5h4v2M7 7l1 13h8l1-13M10 11v6M14 11v6" stroke={colors.clay} strokeWidth={1.7} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

// rev2 위키(records) — display type derived from a record's kind/tags/body so the
// list can carry the reference's 5 content-type icons (글·링크·음성·사진·할 일)
// without a dedicated column in the DB. Purely presentational.
type RType = "text" | "link" | "voice" | "photo" | "todo";
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

// Static Material-symbol-style glyphs (inline SVG, no animation) — Android-safe
// per ANDROID_QA_GUIDELINES (no rAF, no dynamic SVG churn).
function TypeGlyph({ type }: { type: RType }) {
  const s = colors.cyanSoft;
  const p = { stroke: s, strokeWidth: 1.7, fill: "none" as const, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      {type === "text" && (
        <>
          <Path {...p} d="M4 6.5h11M4 11h11M4 15.5h7" />
          <Path {...p} d="M15.4 15.6l3.1-3.1a1.4 1.4 0 0 1 2 2l-3.1 3.1-2.7.7z" />
        </>
      )}
      {type === "link" && (
        <>
          <Path {...p} d="M9.2 14.8l5.6-5.6" />
          <Path {...p} d="M8.6 10.6l-2 2a3 3 0 0 0 4.2 4.2l2-2" />
          <Path {...p} d="M15.4 13.4l2-2a3 3 0 0 0-4.2-4.2l-2 2" />
        </>
      )}
      {type === "voice" && (
        <>
          <Rect {...p} x={9.5} y={3.5} width={5} height={9.5} rx={2.5} />
          <Path {...p} d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20M9.2 20h5.6" />
        </>
      )}
      {type === "photo" && (
        <>
          <Path {...p} d="M4 8.5h3l1.4-2h7.2L18 8.5h2a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
          <Circle {...p} cx={12} cy={13.5} r={3} />
        </>
      )}
      {type === "todo" && (
        <>
          <Circle {...p} cx={12} cy={12} r={8} />
          <Path {...p} d="M8.4 12.2l2.5 2.5 4.6-5" />
        </>
      )}
    </Svg>
  );
}

const RecordCard = memo(function RecordCard({ r, type, time, unfiled, onPress }: { r: TimelineRecord; type: RType; time?: string; unfiled: boolean; onPress: (id: string) => void }) {
  const { t } = useTranslation("deepspace");
  const title = timelineTitle(r, t("records.fallbackTitle"));
  const tags = stripDomainTags(r.tags ?? []).slice(0, 2);
  // No explicit accessibilityLabel: an explicit label REPLACES the flattened child
  // text, so TalkBack heard only the title and never the time label, tags, or the
  // 미분류 badge. Without it, RN concatenates the children in render order.
  return (
    <Pressable style={rStyles.card} android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }} onPress={() => onPress(r.id)} accessibilityRole="button">
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
  const [records, setRecords] = useState<TimelineRecord[]>([]);
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
    // the screen (mirrors core-brain's merged evidence read). Source rows carry
    // no record detail, so tapping one lands on the graceful notFound state.
    (async () => {
      // The canonical records read is NOT coerced to [] on failure. Doing so
      // rendered the genuine-empty state ("아직 기록이 없어요" + 담기 CTA) to a
      // user whose network/Supabase call merely failed — telling someone with
      // records that they have none. A records-read failure is a distinct error
      // state (retry) instead. Sources stay best-effort (source-only users still
      // merge in below), so only the primary records read gates the error.
      let recs: TimelineRecord[] = [];
      let recordsFailed = false;
      try {
        recs = (await listRecentRecords(userId)) as TimelineRecord[];
      } catch {
        recordsFailed = true;
      }
      // Same source of truth as /insights. This read used to live here inline, and
      // /insights had no equivalent at all -- which is exactly how the two screens came to
      // disagree about how much the user had captured.
      let srcRecs: TimelineRecord[] = [];
      try {
        srcRecs = (await listSourcePieces(userId)).map(
          (s) =>
            ({
              id: s.id,
              kind: "note",
              summary: s.title,
              topic: s.title,
              body: null,
              tags: s.tags,
              created_at: s.created_at,
            }) as TimelineRecord,
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
    (id: string) => router.push({ pathname: "/record/[id]", params: { id } }),
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
    ({ item }: { item: TimelineRecord }) => (
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
          android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
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
        android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
        onPress={() => router.push("/inbox")}
        accessibilityRole="button"
        accessibilityLabel={t("records.triageTitle", { count: unfiledCount })}
      >
        <View style={rStyles.triageIcon}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d="M3 13h4l2 3h6l2-3h4M5 6h14l1 7v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4z" stroke={colors.soul} strokeWidth={1.7} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
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
              <RecordsGraph graph={recordsGraph} onOpenRecord={openRecord} />
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
    borderRadius: radius.lg,
    backgroundColor: withAlpha(deepSpace.soul, 0.1),
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  triageIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(deepSpace.soul, 0.16),
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
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
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
    borderRadius: radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeTxt: { color: colors.textTitle, fontSize: 9, fontWeight: "700" },
});

interface DetailRecord {
  id: string;
  kind: string;
  body: string | null;
  structured?: unknown;
  topic: string | null;
  summary: string | null;
  conclusion: string | null;
  tags: string[] | null;
  created_at: string;
}

// Instrument records persist a JSON payload as their body (build.ts loaders
// JSON.parse it). Map the instrument tag to the screen that renders the result
// properly; null = not an assessment payload, show the body as prose.
const ASSESSMENT_ROUTES: Record<string, string> = {
  motivation: "/motivation",
  strengths: "/strengths",
  values: "/values",
  big_five: "/big-five",
  bfi: "/big-five",
  attachment: "/attachment",
  ecr: "/attachment",
};

function assessmentRoute(r: DetailRecord): string | null {
  const tags = (r.tags ?? []).map((s) => s.toLowerCase());
  if (!tags.includes("assessment")) return null;
  const body = r.body?.trim() ?? "";
  if (!body.startsWith("{")) return null;
  try {
    JSON.parse(body);
  } catch {
    return null;
  }
  for (const tag of tags) {
    const route = ASSESSMENT_ROUTES[tag];
    if (route) return route;
  }
  return null;
}

function recordTitle(r: DetailRecord, fallback: string): string {
  const s = r.summary?.trim() || r.topic?.trim();
  if (s) return s;
  const body = r.body?.trim();
  if (body) {
    const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
    if (line) return line;
  }
  return fallback;
}

const RTYPE_KO: Record<RType, string> = { text: "글", link: "링크", voice: "음성", photo: "사진", todo: "할 일" };
const RTYPE_EN: Record<RType, string> = { text: "Text", link: "Link", voice: "Voice", photo: "Photo", todo: "To-do" };

// The 세컨비 line names the domain star this piece connects to. Derived from the
// record's own tags (domain: tag or a plain 도메인 name), never invented.
function pickDomainStar(tags: string[] | null, ko: boolean, t: Tx): string {
  for (const tag of tags ?? []) {
    if (isDomainTag(tag)) {
      const id = tag.slice(DOMAIN_TAG_PREFIX.length);
      if (isDomainId(id)) return ko ? getDomainStar(id).nameKo : getDomainStar(id).nameEn;
    }
    const hit = DOMAIN_STARS.find((d) => d.nameKo === tag || d.nameEn.toLowerCase() === tag.toLowerCase());
    if (hit) return ko ? hit.nameKo : hit.nameEn;
  }
  return t("ds.wikiRecords.relationships");
}

export function DeepSpaceRecordDetailScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language === "ko";
  const { userId, loading: authLoading } = useAuth();
  const params = useLocalSearchParams();
  const idParam = params.id;
  const recordId = Array.isArray(idParam) ? idParam[0] : idParam;

  const [record, setRecord] = useState<DetailRecord | null>(null);
  const [all, setAll] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  // Every write on this screen is optimistic-with-revert; a silent revert on a
  // failed write read as "the app ate my reflection" — the #1 cross-panel finding
  // in the persona-validate pass. Surface a dismissible banner + a screen-reader
  // announce so a failure is never silent. Cleared on the next attempt + after 5s.
  const [actionError, setActionError] = useState<string | null>(null);
  const reportActionError = useCallback(() => {
    const msg = t("recordDetail.actionFailed");
    setActionError(msg);
    AccessibilityInfo.announceForAccessibility(msg);
  }, [t]);
  useEffect(() => {
    if (!actionError) return;
    const h = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(h);
  }, [actionError]);
  // deleteRecord is a hard DB DELETE with no undo, and the trash button sits in
  // the same ctaRow as 편집/이동 - a mis-tap destroyed the record silently. The
  // confirm modal mirrors inbox's delete-confirm pattern.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // D5 (J3): semantic neighbours of this record (embedding kNN), merged into the
  // tag-based "연결된 기록" below with a badge. Only fetched when the user opted in
  // (records_embedding); empty otherwise, so the section stays tag-only.
  const [semanticIds, setSemanticIds] = useState<Set<string>>(() => new Set());
  // Inline "+ 태그 추가": tapping the chip reveals a field that appends a tag to
  // THIS record via updateRecordTags (records_owner_all RLS); optimistic + revert.
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const submitTag = useCallback(async () => {
    const tag = tagDraft.trim();
    setAddingTag(false);
    setTagDraft("");
    if (!tag || !userId || !record || !recordId) return;
    // Reserved domain: tags drive star membership and are managed by Move, not
    // free-text — a hand-typed "domain:career" would double-file the record and
    // break moveTo's single-domain assumption (persona-validate: tag-injection).
    if (isDomainTag(tag)) return;
    const existing = record.tags ?? [];
    if (existing.includes(tag)) return;
    setActionError(null);
    const next = [...existing, tag];
    setRecord({ ...record, tags: next });
    try {
      await updateRecordTags(userId, recordId, next);
    } catch {
      setRecord({ ...record, tags: existing });
      reportActionError();
    }
  }, [tagDraft, userId, record, recordId, reportActionError]);
  // 이동: re-file this record to another domain star by swapping its reserved
  // domain: tag (the star lens filters by the domain: tag). Same optimistic
  // updateRecordTags path as add-tag; reverts on failure.
  const [moving, setMoving] = useState(false);
  const moveTo = useCallback(
    async (target: DomainId) => {
      setMoving(false);
      if (!userId || !record || !recordId) return;
      const currentTags = record.tags ?? [];
      if (currentTags.includes(domainTagFor(target))) return;
      const next = [...stripDomainTags(currentTags), domainTagFor(target)];
      setActionError(null);
      setRecord({ ...record, tags: next });
      try {
        await updateRecordTags(userId, recordId, next);
      } catch {
        setRecord({ ...record, tags: currentTags });
        reportActionError();
      }
    },
    [userId, record, recordId, reportActionError],
  );
  // 편집: inline-edit this record's body text in place. The Edit CTA used to
  // route to /capture, which has no edit mode, so the labelled action did
  // nothing to the record. Optimistic + revert, same shape as add-tag/move.
  // Only the body column is written; the domain: tag (star membership) and the
  // structured payload are left untouched — the editor is gated to plain-body
  // records so a machine JSON body is never overwritten with prose.
  const [editing, setEditing] = useState(false);
  const [bodyDraft, setBodyDraft] = useState("");
  const startEdit = useCallback(() => {
    if (!record) return;
    setBodyDraft(record.body ?? "");
    setEditing(true);
  }, [record]);
  const submitEdit = useCallback(async () => {
    const next = bodyDraft.trim();
    if (!userId || !record || !recordId) {
      setEditing(false);
      return;
    }
    const prevBody = record.body ?? "";
    if (next.length === 0 || next === prevBody.trim()) {
      setEditing(false);
      return;
    }
    setEditing(false);
    setActionError(null);
    setRecord({ ...record, body: next });
    try {
      await updateRecord(userId, recordId, { body: next });
    } catch {
      setRecord({ ...record, body: prevBody });
      reportActionError();
    }
  }, [bodyDraft, userId, record, recordId, reportActionError]);

  useEffect(() => {
    if (!userId || !recordId) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([getRecordById(userId, recordId), listRecentRecords(userId)])
      .then(([r, rows]) => {
        if (!alive) return;
        setRecord((r as DetailRecord) ?? null);
        setAll(rows as TimelineRecord[]);
      })
      .catch(() => {
        if (alive) setRecord(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, recordId]);

  // D5 (J3): pull embedding kNN neighbours, gated by the records_embedding opt-in
  // (a minor's pref is server-locked false, so recordsEmbeddingAllowed short-
  // circuits). Best-effort read; the focal record returns [] until it is embedded.
  useEffect(() => {
    if (!userId || !recordId) return;
    let alive = true;
    void (async () => {
      try {
        const prefs = await fetchPrivacyPrefs(userId);
        if (!recordsEmbeddingAllowed(false, prefs.records_embedding)) return;
        const neighbours = await relatedRecordsByEmbedding(userId, recordId, 6);
        if (alive) setSemanticIds(new Set(neighbours.map((n) => n.id)));
      } catch {
        /* best-effort — the tag-based section still renders */
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, recordId]);

  async function handleDelete() {
    if (!userId || !record) return;
    setActionError(null);
    setDeleting(true);
    try {
      await deleteRecord(userId, record.id);
      router.back();
    } catch {
      setDeleting(false);
      reportActionError();
    }
  }

  if (authLoading) {
    return <Shell title={t("recordDetail.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  if (loading) {
    return <Shell title={t("recordDetail.title")}><GraphLoading /></Shell>;
  }
  if (record === null) {
    return (
      <Shell title={t("recordDetail.title")}>
        <View style={styles.wikiPageOpen}>
          <Text variant="body" style={styles.wikiBody}>{t("recordDetail.notFound")}</Text>
          <Pressable style={styles.primary} onPress={() => router.replace("/records")} accessibilityRole="button">
            <Text variant="caption" style={styles.primaryText}>{t("recordDetail.toArchive")}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  const relatedTag = relatedByTag(record.id, record.tags, all);
  const tagIds = new Set(relatedTag.map((r) => r.id));
  // J3: tag-based first, then embedding-semantic-only neighbours, each flagged so
  // the render badges the semantic ones. semanticIds is empty unless opted in.
  const related = [
    ...relatedTag.map((r) => ({ rec: r, semantic: false })),
    ...all
      .filter((r) => r.id !== record.id && semanticIds.has(r.id) && !tagIds.has(r.id))
      .slice(0, 5)
      .map((r) => ({ rec: r, semantic: true })),
  ];
  const recencyOpts = { labels: dsRecencyLabels(t) };
  const rtype = recordType(record as unknown as TimelineRecord);
  const typeLabel = ko ? RTYPE_KO[rtype] : RTYPE_EN[rtype];
  const timeLabel = recencyLabel(record.created_at, recencyOpts) || t("ds.wikiRecords.justNow");
  const linkedStar = pickDomainStar(record.tags, ko, t);
  const secondbLine =
    related.length > 0
      ? t("ds.wikiRecords.secondbLinked", { star: linkedStar, n: related.length })
      : t("ds.wikiRecords.secondbUnlinked");

  return (
    <Shell title={t("recordDetail.title")}>
      {/* type chip + relative time (reference RecordDetail 별가루 상세 → 조각 상세) */}
      <View style={rd.typeRow}>
        <View style={rStyles.iconBox}><TypeGlyph type={rtype} /></View>
        <RNText style={rd.typeLabel}>{typeLabel} · {timeLabel}</RNText>
      </View>

      {actionError ? (
        <View style={rd.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <RNText style={rd.errorBannerTxt}>{actionError}</RNText>
        </View>
      ) : null}

      <Text variant="heading" style={styles.recTitle}>{recordTitle(record, t("recordDetail.kindFallback"))}</Text>

      {record.body && record.body.trim().length > 0 ? (
        assessmentRoute(record) ? (
          // Self-understanding instruments persist their responses as a JSON body
          // (the loaders JSON.parse it back). Dumping that machine payload here
          // read as a broken screen; the instrument's own populated screen is the
          // canonical renderer, so link there instead.
          <View style={styles.recBody}>
            <Text variant="body" style={styles.recBodyText}>{t("recordDetail.assessmentBody")}</Text>
            <Pressable
              style={rd.assessmentCta}
              onPress={() => router.push(assessmentRoute(record) as Href)}
              accessibilityRole="button"
              accessibilityLabel={t("recordDetail.assessmentCta")}
            >
              <Text variant="caption" style={rd.assessmentCtaText}>{t("recordDetail.assessmentCta")}</Text>
            </Pressable>
          </View>
        ) : editing ? (
          <View style={styles.recBody}>
            <TextInput
              value={bodyDraft}
              onChangeText={setBodyDraft}
              multiline
              autoFocus
              textAlignVertical="top"
              style={rd.editInput}
              accessibilityLabel={t("ds.wikiRecords.edit")}
            />
            <View style={rd.editActions}>
              <Button
                label={t("recordDetail.deleteCancel")}
                variant="secondary"
                onPress={() => setEditing(false)}
                style={rd.confirmBtn}
              />
              <Button
                label={t("recordDetail.editSave")}
                variant="primary"
                onPress={() => void submitEdit()}
                style={rd.confirmBtn}
              />
            </View>
          </View>
        ) : (
          <View style={styles.recBody}>
            <Text variant="body" style={styles.recBodyText}>{record.body}</Text>
          </View>
        )
      ) : null}
      {(() => {
        // 0066: form-shaped captures render their machine-readable fields as a
        // clean label grid under the flattened body (no re-parsing of prose).
        const sp = parseStructured(record.structured);
        if (!sp) return null;
        return (
          <View style={styles.recBody}>
            <Text variant="caption" pixelEn style={styles.tlLabel}>{sp.form === "fourw" ? "4W1H" : "3C4P"}</Text>
            {Object.entries(sp.fields).map(([k, v]) => (
              <View key={k} style={{ marginTop: 6 }}>
                <Text variant="caption" style={styles.metaLabel}>{structuredFieldLabel(sp.form, k, ko ? "ko" : "en")}</Text>
                <Text variant="body" style={styles.recBodyText}>{v}</Text>
              </View>
            ))}
          </View>
        );
      })()}

      {/* 세컨비 한 줄 — which star this connects to + why (tertiary container) */}
      <View style={rd.sbCard}>
        <SecondbHead size={30} mood="neutral" track={false} />
        <View style={rd.sbBody}>
          <RNText style={rd.sbText}>{secondbLine}</RNText>
          {related.length > 0 ? (
            <Pressable onPress={() => router.push("/core-brain")} accessibilityRole="button" hitSlop={12}>
              <RNText style={rd.sbLink}>{t("ds.wikiRecords.seeEvidence")}</RNText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <RNText style={rd.section}>{t("ds.wikiRecords.tags")}</RNText>
      <View style={rd.tagRow}>
        {(record.tags ?? []).slice(0, 6).map((tag) => (
          <View key={tag} style={rd.tag}><RNText style={rd.tagTxt}>{tag}</RNText></View>
        ))}
        {addingTag ? (
          <TextInput
            style={[rd.tag, { minWidth: 120, color: colors.textTitle, fontSize: 12, paddingVertical: 4 }]}
            value={tagDraft}
            onChangeText={setTagDraft}
            autoFocus
            placeholder={t("ds.wikiRecords.addTag")}
            placeholderTextColor={colors.textLo}
            returnKeyType="done"
            onSubmitEditing={() => void submitTag()}
            onBlur={() => { setAddingTag(false); setTagDraft(""); }}
            accessibilityLabel={t("ds.wikiRecords.addTag")}
          />
        ) : (
          <Pressable style={rd.tag} onPress={() => setAddingTag(true)} accessibilityRole="button" hitSlop={12} accessibilityLabel={t("ds.wikiRecords.addTag")}>
            <RNText style={rd.tagTxt}>+ {t("ds.wikiRecords.addTag")}</RNText>
          </Pressable>
        )}
      </View>

      {related.length > 0 ? (
        <>
          <RNText style={rd.section}>{t("ds.wikiRecords.linkedRecords")}</RNText>
          <View style={rd.linkCol}>
            {related.map(({ rec: r, semantic }) => {
              const lt = recordType(r);
              return (
                <Pressable
                  key={r.id}
                  style={rd.linkCard}
                  android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
                  onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={recordTitle(r as DetailRecord, t("recordDetail.kindFallback"))}
                >
                  <TypeGlyph type={lt} />
                  <RNText numberOfLines={1} style={rd.linkTitle}>{recordTitle(r as DetailRecord, t("recordDetail.kindFallback"))}</RNText>
                  {semantic ? (
                    <View style={rd.semBadge}><RNText style={rd.semBadgeTxt}>{t("ds.wikiRecords.meaning")}</RNText></View>
                  ) : null}
                  <RNText style={rd.linkChev}>›</RNText>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <View style={styles.ctaRow}>
        {record.body && record.body.trim().length > 0 && !assessmentRoute(record) && !parseStructured(record.structured) && !editing ? (
          <Pressable style={styles.secondary} onPress={startEdit} accessibilityRole="button">
            <Text variant="caption" style={styles.secondaryText}>{t("ds.wikiRecords.edit")}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.secondary} onPress={() => setMoving(true)} accessibilityRole="button">
          <Text variant="caption" style={styles.secondaryText}>{t("ds.wikiRecords.move")}</Text>
        </Pressable>
        <Pressable
          style={[styles.iconBtn, styles.iconBtnDanger, { minHeight: 44 }]}
          onPress={() => setConfirmingDelete(true)}
          disabled={deleting}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("recordDetail.a11yDelete")}
        >
          <TrashGlyph />
        </Pressable>
      </View>

      <PremiumModal
        visible={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        accessibilityLabel={t("recordDetail.deleteConfirmTitle")}
      >
        <Text variant="heading">{t("recordDetail.deleteConfirmTitle")}</Text>
        <Text variant="body" color="textMuted" style={rd.confirmBody}>
          {t("recordDetail.deleteConfirmBody")}
        </Text>
        <View style={rd.confirmActions}>
          <Button
            label={t("recordDetail.deleteCancel")}
            variant="secondary"
            onPress={() => setConfirmingDelete(false)}
            style={rd.confirmBtn}
          />
          <Button
            label={t("recordDetail.deleteConfirm")}
            variant="danger"
            onPress={() => {
              setConfirmingDelete(false);
              void handleDelete();
            }}
            style={rd.confirmBtn}
          />
        </View>
      </PremiumModal>

      <PremiumModal
        visible={moving}
        onClose={() => setMoving(false)}
        accessibilityLabel={t("ds.wikiRecords.move")}
      >
        <Text variant="heading">{t("ds.wikiRecords.move")}</Text>
        <View style={rd.moveList}>
          {DOMAIN_STARS.filter(
            (d) => !(record?.tags ?? []).includes(domainTagFor(d.id)),
          ).map((d) => (
            <Button
              key={d.id}
              label={ko ? d.nameKo : d.nameEn}
              variant="secondary"
              onPress={() => void moveTo(d.id)}
              style={rd.moveBtn}
            />
          ))}
        </View>
      </PremiumModal>
    </Shell>
  );
}

const rd = StyleSheet.create({
  assessmentCta: { alignSelf: "flex-start", marginTop: 10, minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: colors.borderHi, borderRadius: radius.md, backgroundColor: colors.bgDeep },
  assessmentCtaText: { color: colors.cyanSoft, fontSize: 12.5 },
  confirmBody: { marginTop: 8, marginBottom: 4 },
  errorBanner: { borderWidth: 1, borderColor: colors.clay, borderRadius: radius.md, backgroundColor: colors.cardBg, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  errorBannerTxt: { color: colors.clay, fontSize: 13, lineHeight: 18 },
  confirmActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  confirmBtn: { flex: 1 },
  moveList: { gap: 8, marginTop: 12 },
  moveBtn: { alignSelf: "stretch" },
  editInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.borderHi,
    borderRadius: radius.md,
    backgroundColor: colors.bgDeep,
    color: colors.textTitle,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  editActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 10 },
  typeLabel: { color: colors.textMid, fontSize: 11 },
  sbCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: m3.color.tertiaryContainer,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  sbBody: { flex: 1, gap: 6 },
  sbText: { color: m3.color.onTertiaryContainer, fontSize: 13, lineHeight: 19 },
  sbLink: { color: m3.color.primary, fontSize: 13, fontWeight: "600" },
  section: { color: colors.textTitle, fontSize: 13, marginTop: spacing.md, marginBottom: spacing.xs },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  tagTxt: { color: colors.cyanSoft, fontSize: 12 },
  linkCol: { gap: 8, marginTop: spacing.xs },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  linkTitle: { flex: 1, color: colors.textTitle, fontSize: 13 },
  linkChev: { color: colors.cyanSoft, fontSize: 20 },
  semBadge: { borderWidth: 1, borderColor: colors.cyanSoft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, opacity: 0.7 },
  semBadgeTxt: { color: colors.cyanSoft, fontSize: 10, fontWeight: "700" },
});

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
                    <Pressable
                      onPress={() => router.push({ pathname: "/wiki", params: { focusPageId: p.id } })}
                      accessibilityRole="button"
                      hitSlop={12}
                      accessibilityLabel={t("wiki.backlinks", { count: p.connections })}
                    >
                      <Text variant="subtle" style={styles.wikiBacklink}>↩ {t("wiki.backlinks", { count: p.connections })}</Text>
                    </Pressable>
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

