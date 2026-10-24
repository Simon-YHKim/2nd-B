import { PhoneFlatList as FlatList, PhonePressable as Pressable, PhoneScrollView as ScrollView, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { SceneTransition } from "@/components/motion/SceneTransition";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { PlainText as RNText } from "@/components/ui/PlainText";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";

import { colors, spacing } from "@/theme/tokens";
import { deepSpace, flattenAlpha } from "@/lib/theme/tokens";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { canonGlyph } from "@/components/pixel/pixel-glyphs";
import { m3 } from "@/lib/theme/m3";
import { stripDomainTags } from "@/lib/persona/domain-stars";
import { useRoleEvidenceRead } from "@/lib/persona/use-role-evidence-read";
import { ddsStyles as styles } from "./dds-styles";
import { Text } from "@/components/ui/Text";
// Button / PremiumModal / SecondbHead left with DeepSpaceRecordDetailScreen when
// #1535 extracted it to ./dds-record-detail-screen. SecondbStatusHeader went when
// #1521 gave the records list its own ListHeaderComponent. Nothing here uses them.
import { DeepSpaceLoader } from "@/components/deepspace";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { WikiGraph } from "@/components/deep-space/WikiGraph";
import { RecordsGraph } from "@/components/deep-space/RecordsGraph";
import { SegBtn } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { captureAccountOwnerLease, currentAccountEpoch, isCurrentAccountEpoch, subscribeAccountTransition } from "@/lib/auth/account-epoch";
import { isTimeoutError, withTimeout } from "@/lib/async/with-timeout";
import { useAppRouter, useHardwareBack, usePhoneEmbed, useScreenParams } from "@/lib/nav/phone-embed";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import { SEVEN_STARS } from "@/lib/persona/seven-stars";
import { listAllRecords } from "@/lib/records/list-all-records";
import { buildRoleRecordsGraph } from "@/lib/records/records-graph";
import { listSourcePieces } from "@/lib/records/source-pieces";
import { hasCaptureMarker, isReasoningRatified } from "@/lib/records/system-tags";
import { listAllWikiLinks, listWikiPages } from "@/lib/wiki/queries";
import { useFocusedWikiPage } from "@/lib/wiki/use-focused-wiki-page";
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

/** Wiki rows, kept with the account they were fetched for.
 *
 *  Supabase can publish owner A -> owner B with no signed-out frame in between, and
 *  AuthContext supports that publication on purpose. The scene boundary in
 *  app/_layout.tsx remounts every product scene on an account epoch, so in the shipped
 *  tree this state is thrown away before B can read it - that boundary is the real
 *  defence and this is not a claim that it is broken. But it lives in another file and
 *  applies per route, so a screen that is ever mounted outside it would read the
 *  previous account's rows with nothing in this file to stop it. Holding the owner id
 *  beside the rows makes the answer local: rows are readable only by the account they
 *  were loaded under. */
interface OwnedWikiRows {
  ownerId: string | null;
  epoch: number;
  attempt: number;
  status: "ready" | "error" | "timeout";
  pages: WikiPageRow[];
  edges: WikiEdge[];
}

/** Shared so an owner mismatch returns a stable reference and costs no re-render. */
const NO_WIKI_ROWS: OwnedWikiRows = { ownerId: null, epoch: -1, attempt: -1, status: "ready", pages: [], edges: [] };
export const WIKI_PAGES_READ_TIMEOUT_MS = 10_000;

function useWikiGraphData() {
  const { userId, loading: authLoading } = useAuth();
  const accountEpoch = currentAccountEpoch();
  const [attempt, setAttempt] = useState(0);
  const [held, setHeld] = useState<OwnedWikiRows>(NO_WIKI_ROWS);

  useEffect(() => {
    if (!userId || authLoading) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease || lease.epoch !== accountEpoch) return;
    let alive = true;
    // Pages and links are one snapshot. Missing links must not look like zero
    // connections, and a missing page list must not look like an empty library.
    const work = Promise.all([
      listWikiPages(userId, { limit: 200 }),
      listAllWikiLinks(userId),
    ]);
    void withTimeout(work, WIKI_PAGES_READ_TIMEOUT_MS, "Wiki pages")
      .then(([p, e]) => {
        if (!alive || !lease.isCurrent()) return;
        setHeld({ ownerId: userId, epoch: accountEpoch, attempt, status: "ready", pages: p, edges: e });
      })
      .catch((error: unknown) => {
        if (!alive || !lease.isCurrent()) return;
        setHeld({ ownerId: userId, epoch: accountEpoch, attempt, status: isTimeoutError(error) ? "timeout" : "error", pages: [], edges: [] });
      });
    return () => {
      alive = false;
    };
  }, [accountEpoch, attempt, authLoading, userId]);

  // Read back only for the owner they were loaded under. The effect above overwrites
  // `held` only once the network answers, so without this the previous account's rows
  // would be what the screen draws for the whole refetch window.
  const owned = held.ownerId !== null && held.ownerId === userId && held.epoch === accountEpoch && held.attempt === attempt ? held : NO_WIKI_ROWS;
  const loading = owned === NO_WIKI_ROWS;
  const loadError = !loading && owned.status !== "ready" ? owned.status : null;
  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);
  return { userId, authLoading, pages: owned.pages, edges: owned.edges, loading, loadError, retry };
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
type RecordsTimelineRecord = TimelineRecord & { origin?: RecordsOrigin; sourceId?: string; audit_period?: string | null };
export const WIKI_LIST_READ_TIMEOUT_MS = 10_000;
const NO_RECORDS: RecordsTimelineRecord[] = [];
interface RecordsRead {
  ownerId: string;
  epoch: number;
  reloadKey: number;
  rows: RecordsTimelineRecord[];
  failed: boolean;
}

const TYPE_CHIPS: { id: RType | "all" | "unfiled"; labelKey: string }[] = [
  { id: "all", labelKey: "records.filterAll" },
  { id: "text", labelKey: "records.typeText" },
  { id: "link", labelKey: "records.typeLink" },
  { id: "voice", labelKey: "records.typeVoice" },
  { id: "photo", labelKey: "records.typePhoto" },
  { id: "unfiled", labelKey: "records.typeUnfiled" },
];
// The list remains the complete archive. The immersive graph uses the newest
// three pieces per domain: its 44dp node targets then occupy unique safe lattice
// slots instead of covering one another in a dense fixed fan. The compact count
// says when this visual map is a subset (`18 / 143 pieces`).
const URL_RE = /https?:\/\//;
const DUR_RE = /\(\d+:\d{2}\)/;

function recordType(r: TimelineRecord): RType {
  const tags = (r.tags ?? []).map((s) => s.toLowerCase());
  const has = (...k: string[]) => k.some((x) => tags.includes(x));
  if (r.kind === "audit_response") return "todo";
  const hay = `${r.topic ?? ""} ${r.summary ?? ""} ${r.body ?? ""}`;
  if (hasCaptureMarker(r, "link") || has("링크", "url") || URL_RE.test(hay)) return "link";
  if (hasCaptureMarker(r, "voice") || has("음성") || DUR_RE.test(hay)) return "voice";
  if (has("photo", "사진", "image", "이미지")) return "photo";
  return "text";
}
function isUnfiled(r: TimelineRecord): boolean {
  return stripDomainTags(r.tags ?? []).length === 0 && !isReasoningRatified(r);
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
  // Phone-aware: inside the dashboard phone, links open in the phone and the
  // query below is the phone route's, not /dashboard's.
  const router = useAppRouter();
  const { t, i18n } = useTranslation("deepspace");
  const isKo = i18n.language === "ko";
  const { userId, loading: authLoading } = useAuth();
  // ?tags=a,b filters to pieces whose tags intersect the set (trinity 영역 drilldown).
  const recordsParams = useScreenParams<{ tags?: string; period?: string }>();
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
  const accountEpoch = currentAccountEpoch();
  const [recordsRead, setRecordsRead] = useState<RecordsRead | null>(null);
  // Bumped to re-run the load: on focus re-entry (useFocusRefetch) and on the
  // error-state retry. Rows belong to that request's owner, epoch and retry,
  // so stale rows disappear in render before the next effect even starts.
  const [reloadKey, setReloadKey] = useState(0);
  const currentRead = recordsRead?.ownerId === userId && recordsRead.epoch === accountEpoch && recordsRead.reloadKey === reloadKey
    ? recordsRead : null;
  const records = currentRead?.rows ?? NO_RECORDS;
  const loading = currentRead === null;
  const loadError = currentRead?.failed ?? false;
  const [typeFilter, setTypeFilter] = useState<RType | "all" | "unfiled">("all");
  // PIXEL-CLAY `records` is the connection map. Keep the real, virtualized list
  // one tap away instead of replacing it with the reference's sample corpus.
  // ?period=<a star's period> opens the list on that star's stories (the star summary's
  // record count leads here). The line at the top of the list says so and returns to
  // everything; so does the graph, which is the map of all of it.
  const [periodShownAll, setPeriodShownAll] = useState<string | null>(null);
  const periodStar = useMemo(() => {
    const asked = recordsParams.period;
    if (!asked || asked === periodShownAll) return null;
    return SEVEN_STARS.find((star) => star.period !== null && star.period === asked) ?? null;
  }, [recordsParams.period, periodShownAll]);
  const [view, setView] = useState<"list" | "graph">(periodStar ? "list" : "graph");
  useEffect(() => {
    if (periodStar) setView("list");
  }, [periodStar]);
  const showAllPeriods = useCallback(() => setPeriodShownAll(recordsParams.period ?? null), [recordsParams.period]);
  // Opened from a star's summary, the device's Back returns to that summary. The tab's own Back
  // (DeepSpaceScreen) goes home, which skipped the screen the person came from. This listener is
  // added after the tab's, so it is asked first.
  const openedFromStar = SEVEN_STARS.some((star) => star.period !== null && star.period === recordsParams.period);
  const backToStar = useCallback(() => {
    if (!openedFromStar || !router.canGoBack()) return false;
    router.back();
    return true;
  }, [openedFromStar, router]);
  useHardwareBack(backToStar);

  useEffect(() => {
    if (!userId || authLoading) return;
    let alive = true;
    const controller = new AbortController();
    const current = () => alive && !controller.signal.aborted && isCurrentAccountEpoch(accountEpoch);
    const unsubscribe = subscribeAccountTransition(() => {
      if (!isCurrentAccountEpoch(accountEpoch)) controller.abort();
    });
    // /records shows EVERY saved piece — including non-journal Capture/Import
    // (글/링크/사진/file) in sources. Either failed read makes the list unknown,
    // including a source-only account; a partial result must not look empty.
    // One deadline bounds the whole paged read and sources, not each page.
    const work = Promise.all([
      listAllRecords(userId, { signal: controller.signal }),
      listSourcePieces(userId),
    ]).then(([recs, sources]) => {
      const srcRecs: RecordsTimelineRecord[] = sources.map((s) => ({
        id: s.id, origin: "source", sourceId: s.sourceId, kind: "note",
        summary: s.title, topic: s.title, body: null, tags: s.tags, system_tags: s.system_tags, created_at: s.created_at,
      }));
      const merged = [...recs, ...srcRecs].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      return merged;
    });
    void withTimeout(work, WIKI_LIST_READ_TIMEOUT_MS, "Wiki records")
      .then((rows) => {
        if (current()) setRecordsRead({ ownerId: userId, epoch: accountEpoch, reloadKey, rows, failed: false });
      })
      .catch(() => {
        if (current()) setRecordsRead({ ownerId: userId, epoch: accountEpoch, reloadKey, rows: NO_RECORDS, failed: true });
      })
      .finally(() => { unsubscribe(); controller.abort(); });
    return () => {
      alive = false;
      unsubscribe();
      controller.abort();
    };
  }, [userId, authLoading, accountEpoch, reloadKey]);

  // Reload on focus re-entry so a delete on the record detail (then router.back)
  // is reflected here; the shared helper skips the initial mount, so this never
  // double-loads on first render.
  useFocusRefetch(() => setReloadKey((k) => k + 1), Boolean(userId));

  const roleRead = useRoleEvidenceRead(userId, authLoading, reloadKey,
    JSON.stringify([recordsParams.tags ?? "", recordsParams.period ?? ""]));
  const visibleRoleCards = roleRead.pair?.cards;
  const visibleRoleEvidence = roleRead.pair?.evidence;

  // Stable across renders so the memoized RecordCard's onPress prop does not
  // change (React.memo keeps unchanged rows from re-rendering on filter taps).
  const openRecord = useCallback(
    (record: RecordsTimelineRecord) => router.push({ pathname: "/record/[id]", params: recordRouteParams(record) }),
    [router],
  );

  // Per-record time label reuses the tested timeline bucketer (방금 / N시간 전 / 어제 …).
  // labelEveryItem: this flat list has no date-group headers, so older rows need
  // their own day label - without it every non-today record showed no time at all.
  const timeById = useMemo(() => {
    const m = new Map<string, string>();
    // maxGroups: the timeline labels only its first 8 day groups unless told otherwise, and a row
    // past the eighth day then showed no time at all. This list holds every record, so every day.
    buildRecordsTimeline(records, { labels: dsTimeLabels(t), labelEveryItem: true, maxGroups: Number.POSITIVE_INFINITY }).forEach((g) => g.items.forEach((it) => m.set(it.id, it.timeLabel)));
    return m;
  }, [records, t]);

  const scoped = useMemo(() => {
    const ofStar = periodStar ? records.filter((r) => r.audit_period === periodStar.period) : records;
    if (tagFilter.length === 0) return ofStar;
    return ofStar.filter((r) => (r.tags ?? []).some((tag) => tagFilter.includes(tag.toLowerCase())));
  }, [records, tagFilter, periodStar]);
  const unfiledCount = useMemo(() => scoped.filter(isUnfiled).length, [scoped]);
  const filtered = useMemo(() => {
    if (typeFilter === "all") return scoped;
    if (typeFilter === "unfiled") return scoped.filter(isUnfiled);
    return scoped.filter((r) => recordType(r) === typeFilter);
  }, [scoped, typeFilter]);
  // The second tier now comes from user-approved Polaris role cards. The graph
  // cites real saved records; unapproved proposals are visible only in Polaris.
  const graphSourceRecords = useMemo(() => {
    if (view !== "graph") return [];
    if (tagFilter.length > 0 || typeFilter !== "all") return filtered;
    const byId = new Map(filtered.map((record) => [record.id, record]));
    visibleRoleEvidence?.forEach((record) => byId.set(record.id, record as RecordsTimelineRecord));
    return [...byId.values()];
  }, [view, tagFilter, typeFilter, filtered, visibleRoleEvidence]);
  const recordsGraph = useMemo(
    () =>
      buildRoleRecordsGraph(
        graphSourceRecords,
        visibleRoleCards ?? [],
        isKo ? "ko" : "en",
        t("home:ds.home.polaris"),
      ),
    [graphSourceRecords, visibleRoleCards, isKo, t],
  );

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
      <DeepSpaceScreen active="wiki" header="none" showSharedSky={view === "graph"}>
        <View style={rStyles.centerState}><GraphLoading /></View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  // Z80 (Simon 2026-10-13): a count that was not read is not zero. While the records read is
  // pending or has failed, the two counts show "..." the way the chat's daily count does.
  const countsUnread = loading || loadError;
  const graphCountsUnread = countsUnread || roleRead.status !== "ready";
  const graphCount = recordsGraph.nodes.filter((node) => node.kind === "record").length;
  const graphCountText = graphCountsUnread
    ? `... ${t("domains.unit")}`
    : `${graphCount}${graphCount < graphSourceRecords.length ? ` / ${graphSourceRecords.length}` : ""} ${t("domains.unit")}`;
  const triageTitle = countsUnread
    ? t("records.triageTitle", { replace: { count: "..." } })
    : t("records.triageTitle", { count: unfiledCount });

  // The list header keeps the title, triage, and filters together inside the
  // FlatList. Graph mode uses the compact absolute rail below instead.
  const viewToggleRow = (
    <View style={rStyles.titleRow}>
      <RNText style={rStyles.wikiTitle}>{t("records.wikiTitle")}</RNText>
      <SegBtn
        segments={[
          { key: "list", label: t("records.viewList") },
          { key: "graph", label: t("records.viewGraph") },
        ]}
        selected={[view]}
        onSelect={(key) => {
          if (key === "graph") showAllPeriods();
          setView(key === "graph" ? "graph" : "list");
        }}
        style={rStyles.viewToggle}
      />
    </View>
  );

  const periodLine = periodStar ? (
    <View style={rStyles.periodLine}>
      <RNText style={rStyles.periodLineText}>{t("records.periodScope", { star: t(`home:ds.star.${periodStar.key}`) })}</RNText>
      <RNText style={rStyles.periodLineDot} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">·</RNText>
      <Pressable onPress={showAllPeriods} accessibilityRole="button" style={rStyles.periodLineAll}>
        <RNText style={rStyles.periodLineAllText}>{t("records.periodShowAll")}</RNText>
      </Pressable>
    </View>
  ) : null;

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
        accessibilityLabel={loadError ? t("records.loadError") : loading ? t("common:states.loading") : triageTitle}
      >
        <View style={rStyles.triageIcon}>
          <PixelGlyph name="inbox" color={colors.soul} size={20} />
        </View>
        <View style={rStyles.triageCol}>
          <RNText style={rStyles.triageTitle}>{triageTitle}</RNText>
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
    <DeepSpaceScreen active="wiki" header="none" showSharedSky={view === "graph"}>
      <SceneTransition transitionKey={view} kind="replace" animateOnMount={false} style={{ flex: 1, minHeight: 0 }}>
      {view === "list" ? (
        <View style={rStyles.listPane}>
          {/* The records list is virtualized (FlatList) and is the ONLY vertical
              scroller here. The deep-space shell's fullbleed body is a plain flex
              View, so there is no nested-VirtualizedList conflict. */}
          <FlatList
            data={loadError ? [] : filtered}
            keyExtractor={(r) => r.id}
            renderItem={renderRecord}
            ListHeaderComponent={
              <View style={rStyles.listHeader}>
                {viewToggleRow}
                {periodLine}
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
                  <Text variant="body" style={styles.wikiBody}>{typeFilter === "all" && !periodStar ? t("records.emptyAll") : t("records.emptyKind")}</Text>
                  {/* A new record is not told under a star, so it would not appear in a star's list. */}
                  {periodStar ? null : (
                    <Pressable style={styles.primary} onPress={() => router.push("/capture")} accessibilityRole="button">
                      <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
                    </Pressable>
                  )}
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
        </View>
      ) : (
        <View style={rStyles.graphPane}>
          <View pointerEvents="box-none" style={rStyles.graphRail}>
            <PixelPressable
              onPress={() => setView("list")}
              accessibilityLabel={t("records.viewList")}
              contentStyle={rStyles.railButtonContent}
            >
              <PixelGlyph name="article" color={colors.cyanSoft} size={18} />
              <RNText style={rStyles.railButtonText}>{t("records.viewList")}</RNText>
            </PixelPressable>
            <PixelSurface variant="frame" contentStyle={rStyles.countContent}>
              <RNText style={rStyles.countText} accessibilityLabel={graphCountText}>
                {graphCountText}
              </RNText>
            </PixelSurface>
          </View>
          {loadError ? (
            <View style={rStyles.centerState}>{errorState}</View>
          ) : loading ? (
            <View style={rStyles.centerState}><GraphLoading /></View>
          ) : roleRead.status === "error" || roleRead.status === "timeout" ? (
            <View style={rStyles.centerState}>
              <View style={styles.wikiPageOpen}>
                <Text variant="body" style={styles.wikiBody} accessibilityRole="alert">
                  {t(roleRead.status === "timeout" ? "common:errors.network" : "common:errors.unknown")}
                </Text>
                <PixelPressable onPress={roleRead.retry} accessibilityLabel={t("common:actions.retry")} contentStyle={styles.primary}>
                  <Text variant="caption" style={styles.primaryText}>{t("common:actions.retry")}</Text>
                </PixelPressable>
              </View>
            </View>
          ) : roleRead.status === "loading" ? (
            <View style={rStyles.centerState}><GraphLoading /></View>
          ) : graphSourceRecords.length > 0 && recordsGraph.nodes.some((node) => node.kind === "persona") ? (
            <RecordsGraph
              graph={recordsGraph}
              onOpenRecord={(id) => router.push({ pathname: "/record/[id]", params: recordRouteParamsById(id, graphSourceRecords) })}
              onOpenPersona={() => router.push("/core-brain")}
            />
          ) : graphSourceRecords.length > 0 ? (
            <View style={rStyles.centerState}>
              <View style={styles.wikiPageOpen}>
                <Text variant="body" style={styles.wikiBody}>
                  {visibleRoleCards?.some((card) => card.status === "ratified")
                    ? t("core-brain:roleGraphFiltered")
                    : t("core-brain:roleGraphEmpty")}
                </Text>
                <Pressable style={styles.primary} onPress={() => router.push("/core-brain")} accessibilityRole="button">
                  <Text variant="caption" style={styles.primaryText}>{t("core-brain:roleOpenPolaris")}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={rStyles.centerState}>
              <View style={styles.wikiPageOpen}>
                <Text variant="body" style={styles.wikiBody}>{t("records.graphEmpty")}</Text>
                <Pressable style={styles.primary} onPress={() => router.push("/capture")} accessibilityRole="button">
                  <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
      </SceneTransition>
    </DeepSpaceScreen>
  );
}

const rStyles = StyleSheet.create({
  listPane: { flex: 1, minHeight: 0 },
  graphPane: { flex: 1, minHeight: 0 },
  graphRail: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  railButtonContent: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: 0 },
  railButtonText: { color: colors.textTitle, fontSize: 12, fontFamily: m3.font.mono },
  countContent: { minHeight: 44, justifyContent: "center", paddingVertical: 0, paddingHorizontal: spacing.sm },
  countText: { color: colors.cyanSoft, fontSize: 12, fontFamily: m3.font.mono },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  wikiTitle: { color: colors.textTitle, fontSize: 26, fontWeight: "800", flexShrink: 1 },
  viewToggle: { width: 148, flexShrink: 0 },
  periodLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  periodLineText: { color: colors.textTitle, fontSize: 15, fontWeight: "700" },
  periodLineDot: { color: colors.textMid, fontSize: 15 },
  periodLineAll: { minHeight: 44, justifyContent: "center" },
  periodLineAllText: { color: colors.cyanSoft, fontSize: 15, fontWeight: "700" },
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

const NO_FLOAT_CLEAR = { paddingTop: 0 } as const;

export function DeepSpaceWikiScreen() {
  // Phone-aware: inside the dashboard phone, /capture opens in the phone and
  // focusPageId is read from the phone route's query.
  const router = useAppRouter();
  // The phone shell draws no floating companion header, so the 88px clearance
  // for it would only push the graph below a short display.
  const floatClear = usePhoneEmbed() ? [styles.wikiFloatClear, NO_FLOAT_CLEAR] : styles.wikiFloatClear;
  const { t, i18n } = useTranslation("deepspace");
  const isKo = i18n.language === "ko";
  const { userId, authLoading, pages, edges, loading, loadError, retry } = useWikiGraphData();
  // Deep-link to one page, by wiki_pages.id. Three screens hold a wiki page id and used
  // to push it at /record/[id], which looks a record up by that id and always 404s -- a
  // page id is not a record id. They send it here instead, which is where it belongs.
  // (The legacy wiki screen has focusSourceId, keyed on source_id; this is the live
  // deep-space screen and it read no params at all.)
  const { focusPageId } = useScreenParams<{ focusPageId?: string }>();
  const focusRead = useFocusedWikiPage(userId, focusPageId, pages, loading || !!loadError, authLoading);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // Which page row is expanded. null until the user taps; the first page renders
  // expanded by default (matching the old fixed-open-first behaviour) but any row
  // can now toggle open via its caret.
  const honouredFocusRef = useRef<typeof focusRead.key | null>(null);
  const [expanded, setExpanded] = useState<{ key: typeof focusRead.key; id: string | null } | null>(null);
  const expandedId = expanded?.key === focusRead.key ? expanded.id : null;
  const setExpandedId = useCallback((id: string | null) => {
    // A manual row/graph choice supersedes an outstanding citation expansion.
    honouredFocusRef.current = focusRead.key;
    setExpanded({ key: focusRead.key, id });
  }, [focusRead.key]);
  // rev2 P4b: list <-> node-graph view. The graph honours the same tag filter;
  // tapping a node twice opens it back in the list (progressive disclosure).
  const [wikiView, setWikiView] = useState<"list" | "graph">("list");

  // Mark a citation honoured only after its owned page is known. Later renders
  // must not reopen it over a row the user deliberately selected.
  useEffect(() => {
    if (focusRead.status !== "ready" || !focusRead.page || !focusPageId || honouredFocusRef.current === focusRead.key) return;
    honouredFocusRef.current = focusRead.key;
    setExpandedId(focusPageId);
  }, [focusRead.status, focusRead.page, focusRead.key, focusPageId, setExpandedId]);

  // Only the current owner/epoch/target's successful row joins the window.
  const linkedPage = focusRead.page;
  const listedPages = useMemo(
    () => linkedPage && !pages.some((page) => page.id === linkedPage.id) ? [linkedPage, ...pages] : pages,
    [pages, linkedPage],
  );

  // The page the user asked to open is pinned into the list: the graph draws every page but
  // the list keeps only the top 12 by connection count, so opening a sparsely-linked node
  // used to land on a list that did not contain it.
  const view = useMemo(
    () => buildDeepWikiView(listedPages, edges, { activeTag, pinnedId: expandedId }),
    [listedPages, edges, activeTag, expandedId],
  );
  const graphPages = useMemo(
    () =>
      listedPages
        .filter((p) => activeTag === null || p.tags.includes(activeTag))
        .map((p) => ({ id: p.id, title: p.title.trim() || p.slug, kind: p.kind })),
    [listedPages, activeTag],
  );

  if (authLoading) {
    return (
      <DeepSpaceScreen active="wiki" header="floating">
        <View style={floatClear}>
          <DockBody title={t("wiki.title")}><GraphLoading /></DockBody>
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  // A citation must never silently open an unrelated default row while its
  // target is waiting, failed, missing or hidden by a tag filter.
  const openId = view.pages.some((p) => p.id === expandedId)
    ? expandedId
    : focusPageId ? null : (view.pages[0]?.id ?? null);

  // rev2 records: the companion FLOATS over the surface (sb-app), so the body
  // clears its height instead of being pushed by a header band.
  return (
    <DeepSpaceScreen active="wiki" header="floating">
      <View style={floatClear}>
      <DockBody title={t("wiki.title")}>
      <View style={styles.wikiStatRow}>
        <View style={styles.wikiStat}><Text variant="heading" style={styles.wikiStatNum}>{loading || loadError ? "..." : view.pageCount}</Text><Text variant="subtle" style={styles.wikiStatCap}>{t("wiki.statPages")}</Text></View>
        <View style={styles.wikiStat}><Text variant="heading" style={[styles.wikiStatNum, styles.wikiStatNumCyan]}>{loading || loadError ? "..." : view.edgeCount}</Text><Text variant="subtle" style={styles.wikiStatCap}>{t("wiki.statLinks")}</Text></View>
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
      {!loading && !loadError && view.tagChips.length > 0 ? (
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
      {!loading && !loadError && focusPageId && focusRead.status !== "ready" ? (
        <View style={styles.wikiPageOpen}>
          <Text variant="body" style={styles.wikiBody} accessibilityLiveRegion="polite">
            {focusRead.status === "loading" ? "..." : focusRead.status === "missing"
              ? t("recordDetail:state.missingTitle")
              : t(focusRead.status === "timeout" ? "common:errors.network" : "common:errors.unknown")}
          </Text>
          {focusRead.status === "error" || focusRead.status === "timeout" ? (
            <Pressable style={styles.primary} onPress={focusRead.retry} accessibilityRole="button">
              <Text variant="caption" style={styles.primaryText}>{t("common:actions.retry")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <SceneTransition transitionKey={wikiView} kind="replace" animateOnMount={false} style={{ gap: spacing.md }}>
      {loading ? (
        <GraphLoading />
      ) : loadError ? (
        <View style={styles.wikiPageOpen}>
          <Text variant="body" style={styles.wikiBody}>{t(loadError === "timeout" ? "common:errors.network" : "common:errors.unknown")}</Text>
          <Pressable style={styles.primary} onPress={retry} accessibilityRole="button">
            <Text variant="caption" style={styles.primaryText}>{t("common:actions.retry")}</Text>
          </Pressable>
        </View>
      ) : focusPageId && focusRead.status !== "ready" && view.pages.length === 0 ? null : wikiView === "graph" && graphPages.length > 0 ? (
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
            const toggle = () => setExpandedId(isOpen ? null : p.id);
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
      </SceneTransition>
      </DockBody>
      </View>
    </DeepSpaceScreen>
  );
}

