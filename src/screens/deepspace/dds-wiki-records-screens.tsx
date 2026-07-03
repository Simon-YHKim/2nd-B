import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { colors, radius, spacing } from "@/theme/tokens";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { stripDomainTags } from "@/lib/persona/domain-stars";
import { ddsStyles as styles } from "./dds-styles";
import { parseStructured } from "@/lib/capture/structured";
import { Text } from "@/components/ui/Text";
import { DeepSpaceLoader, SecondbStatusHeader } from "@/components/deepspace";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { WikiGraph } from "@/components/deep-space/WikiGraph";
import { SegBtn } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { deleteRecord, getRecordById, listRecentRecords } from "@/lib/records/create";
import { listAllWikiLinks, listWikiPages } from "@/lib/wiki/queries";
import type { WikiPageRow } from "@/lib/wiki/types";
import { buildDeepWikiView, recencyLabel, type RecencyLabels, type WikiEdge } from "./wiki-graph-view";
import { buildRecordsTimeline, relatedByTag, type TimelineLabels, type TimelineRecord } from "./records-timeline";

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
    <DeepSpaceScreen active="lens" title={title ?? ""} onBack={() => router.back()}>
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

function TimelineRow({ title, time, tag, dim, onPress }: { title: string; time?: string; tag?: string; dim?: boolean; onPress?: () => void }) {
  const content = (
    <View style={{ gap: 5 }}>
      <View style={styles.tlRow}>
        <View style={[styles.tlDot, dim && styles.tlDotDim]} />
        <Text variant="body" style={[styles.tlTitle, dim && styles.tlTitleDim]} numberOfLines={1}>{title}</Text>
        {time ? <Text variant="subtle" style={styles.tlTime}>{time}</Text> : null}
      </View>
      {tag ? <View style={styles.tlTagRow}><Text variant="caption" pixelEn style={styles.tlTag}>{tag}</Text></View> : null}
    </View>
  );
  if (!onPress) return content;
  // Tappable timeline row (SCREEN_TREE_SPEC §4: 항목→/record/[id]). Wrap, not
  // restyle - the row visual is unchanged; only a ≥44px hit target is added.
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{ minHeight: 44, justifyContent: "center" }, pressed ? { opacity: 0.6 } : null]}>
      {content}
    </Pressable>
  );
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

function RecordCard({ r, type, time, unfiled, onPress }: { r: TimelineRecord; type: RType; time?: string; unfiled: boolean; onPress: () => void }) {
  const { t } = useTranslation("deepspace");
  const title = timelineTitle(r, t("records.fallbackTitle"));
  const tags = stripDomainTags(r.tags ?? []).slice(0, 2);
  return (
    <Pressable style={({ pressed }) => [rStyles.card, pressed && rStyles.cardPressed]} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
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
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<RType | "all" | "unfiled">("all");
  const [view, setView] = useState<"list" | "graph">("list");
  // Graph mode reuses the deterministic knowledge-graph view (wiki pages/edges).
  const { pages, edges } = useWikiGraphData();
  const graphPages = useMemo(() => pages.map((p) => ({ id: p.id, title: p.title.trim() || p.slug, kind: p.kind })), [pages]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    listRecentRecords(userId)
      .then((rows) => {
        if (alive) setRecords(rows as TimelineRecord[]);
      })
      .catch(() => {
        if (alive) setRecords([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Per-record time label reuses the tested timeline bucketer (방금 / N시간 전 / 어제 …).
  const timeById = useMemo(() => {
    const m = new Map<string, string>();
    buildRecordsTimeline(records, { labels: dsTimeLabels(t) }).forEach((g) => g.items.forEach((it) => m.set(it.id, it.timeLabel)));
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

  if (authLoading) {
    return (
      <DeepSpaceScreen active="wiki" header="none">
        <View style={styles.wikiFloatClear}><GraphLoading /></View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const total = scoped.length;
  return (
    <DeepSpaceScreen active="wiki" header="none">
      {/* rev2 위키: companion FLOATS over the immersive surface (sb-app §4). */}
      <View pointerEvents="box-none" style={rStyles.floatHeader}>
        <SecondbStatusHeader
          text={total > 0 ? t("records.headerCount", { count: total }) : t("records.headerEmpty")}
          tip={unfiledCount > 0 ? t("records.tip", { count: unfiledCount }) : t("records.tipClear")}
        />
      </View>
      <View style={styles.wikiFloatClear}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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

          <Pressable
            style={({ pressed }) => [rStyles.triageCard, pressed && rStyles.cardPressed]}
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

          {view === "list" ? (
            <>
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

              {loading ? (
                <GraphLoading />
              ) : filtered.length === 0 ? (
                <View style={styles.wikiPageOpen}>
                  <Text variant="body" style={styles.wikiBody}>{typeFilter === "all" ? t("records.emptyAll") : t("records.emptyKind")}</Text>
                  <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
                    <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={rStyles.list}>
                  {filtered.map((r) => (
                    <RecordCard
                      key={r.id}
                      r={r}
                      type={recordType(r)}
                      time={timeById.get(r.id) || undefined}
                      unfiled={isUnfiled(r)}
                      onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
                    />
                  ))}
                </View>
              )}
            </>
          ) : graphPages.length > 0 ? (
            <WikiGraph pages={graphPages} edges={edges} isKo={isKo} onOpenPage={(id) => router.push({ pathname: "/record/[id]", params: { id } })} />
          ) : (
            <View style={styles.wikiPageOpen}>
              <Text variant="body" style={styles.wikiBody}>{t("records.graphEmpty")}</Text>
              <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
                <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
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
  cardPressed: { opacity: 0.6 },
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
  list: { gap: spacing.sm },
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
  time: { color: colors.cyanDim, fontSize: 10.5, fontFamily: m3.font.mono },
  metaTagWrap: { flexDirection: "row", alignItems: "center" },
  metaDot: { color: colors.textLo, fontSize: 10.5, paddingHorizontal: 5 },
  metaTag: { color: colors.textLo, fontSize: 10.5 },
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

const RECORD_KIND_KEY: Record<string, string> = {
  journal: "recordDetail.kindJournal",
  note: "recordDetail.kindNote",
  audit_response: "recordDetail.kindAudit",
};

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

export function DeepSpaceRecordDetailScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();
  const params = useLocalSearchParams();
  const idParam = params.id;
  const recordId = Array.isArray(idParam) ? idParam[0] : idParam;

  const [record, setRecord] = useState<DetailRecord | null>(null);
  const [all, setAll] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

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

  async function handleDelete() {
    if (!userId || !record) return;
    setDeleting(true);
    try {
      await deleteRecord(userId, record.id);
      router.back();
    } catch {
      setDeleting(false);
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
          <Pressable style={styles.primary} onPress={() => router.replace("/records")}>
            <Text variant="caption" style={styles.primaryText}>{t("recordDetail.toArchive")}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  const related = relatedByTag(record.id, record.tags, all);
  const kindKey = RECORD_KIND_KEY[record.kind];
  const kindLabel = kindKey ? t(kindKey) : t("recordDetail.kindFallback");
  const recencyOpts = { labels: dsRecencyLabels(t) };

  return (
    <Shell title={t("recordDetail.title")}>
      <SecondbStatusHeader
        text={related.length > 0 ? t("recordDetail.headerLinked", { count: related.length }) : t("recordDetail.headerAlone")}
        tip={t("recordDetail.tip")}
      />
      <View style={styles.recMetaRow}>
        <Text variant="subtle" style={styles.recMetaType}>{kindLabel}</Text>
        <RNText style={styles.recMetaDot}>·</RNText>
        <Text variant="subtle" style={styles.recMeta}>{recencyLabel(record.created_at, recencyOpts) || t("recordDetail.kindFallback")}</Text>
        <RNText style={styles.recMetaDot}>·</RNText>
        <Text variant="subtle" style={styles.recMeta}>{t("recordDetail.author")}</Text>
      </View>
      <Text variant="heading" style={styles.recTitle}>{recordTitle(record, t("recordDetail.kindFallback"))}</Text>
      {record.body && record.body.trim().length > 0 ? (
        <View style={styles.recBody}>
          <Text variant="body" style={styles.recBodyText}>{record.body}</Text>
        </View>
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
                <Text variant="caption" style={styles.metaLabel}>{k}</Text>
                <Text variant="body" style={styles.recBodyText}>{v}</Text>
              </View>
            ))}
          </View>
        );
      })()}
      {record.tags && record.tags.length > 0 ? (
        <View style={styles.filterRow}>
          {record.tags.slice(0, 5).map((tag) => (
            <FilterChip key={tag} label={`#${tag}`} active />
          ))}
        </View>
      ) : null}
      {record.conclusion && record.conclusion.trim().length > 0 ? (
        <View style={styles.insightViolet}>
          <Text variant="body" style={styles.insightVioletText}>{record.conclusion}</Text>
        </View>
      ) : null}
      {related.length > 0 ? (
        <>
          <Text variant="caption" pixelEn style={styles.tlLabel}>{t("recordDetail.linkedRecords")}</Text>
          <View style={styles.tlGroup}>
            {related.map((r) => (
              <TimelineRow
                key={r.id}
                title={recordTitle(r as DetailRecord, t("recordDetail.kindFallback"))}
                time={recencyLabel(r.created_at, recencyOpts) || undefined}
                dim
                onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
              />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.ctaRow}>
        <Pressable style={styles.secondary} onPress={() => router.push("/capture")}>
          <Text variant="caption" style={styles.secondaryText}>{t("recordDetail.newRecord")}</Text>
        </Pressable>
        <Pressable
          style={[styles.iconBtn, styles.iconBtnDanger]}
          onPress={() => void handleDelete()}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel={t("recordDetail.a11yDelete")}
        >
          <TrashGlyph />
        </Pressable>
      </View>
    </Shell>
  );
}

export function DeepSpaceWikiScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const isKo = i18n.language === "ko";
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // Which page row is expanded. null until the user taps; the first page renders
  // expanded by default (matching the old fixed-open-first behaviour) but any row
  // can now toggle open via its caret.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // rev2 P4b: list <-> node-graph view. The graph honours the same tag filter;
  // tapping a node twice opens it back in the list (progressive disclosure).
  const [wikiView, setWikiView] = useState<"list" | "graph">("list");
  const view = useMemo(() => buildDeepWikiView(pages, edges, { activeTag }), [pages, edges, activeTag]);
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
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
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
                      onPress={() => router.push({ pathname: "/record/[id]", params: { id: p.id } })}
                      accessibilityRole="button"
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

