/**
 * Native domain lenses for the rev2 star-detail screen.
 *
 * The Claude handoff gives every life-domain star a different visual grammar.
 * This component preserves that grammar while replacing the prototype's sample
 * numbers with owner-scoped product data. When a structured source has not been
 * filled yet, the visual stays in place and says so instead of inventing data.
 *
 * Android discipline:
 * - record lists are deliberately bounded before `.map()` (no unbounded
 *   ScrollView children);
 * - the relationship SVG is capped at 24 nodes;
 * - there are no animated SVG filters, gradients, or large off-screen canvases.
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";

import { MdButton, MdCard, ProgressLinear, m3TextStyle } from "@/components/m3";
import type { LadderLevel } from "@/lib/persona/brightness";
import type { DomainId } from "@/lib/persona/domain-stars";
import {
  listEntriesForMonth,
  monthBucket,
  summarizeMonth,
  type LedgerEntry,
  type MonthSummary,
} from "@/lib/finance/ledger";
import { listPeople, type Person, type RelationKind } from "@/lib/relation/people";
import { layoutPeopleMap } from "@/lib/relation/people-map-layout";
import { listRecreationItems, type RecreationItem } from "@/lib/recreation/items";
import { listRecentSamples, type HealthSampleRow } from "@/lib/supabase/health";
import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";

export interface DomainLensRecord {
  id: string;
  topic: string | null;
  body: string | null;
  created_at: string;
}

interface StructuredLensData {
  status: "idle" | "loading" | "ready" | "error";
  finance?: { entries: LedgerEntry[]; summary: MonthSummary };
  people?: Person[];
  recreation?: RecreationItem[];
  health?: HealthSampleRow[];
}

const RELATION_COLOR: Record<RelationKind, string> = {
  family: m3.accent.moodPositive,
  partner: m3.accent.moodNegative,
  friend: m3.accent.starCore,
  colleague: m3.accent.star,
  mentor: m3.accent.polaris,
  other: m3.accent.starDim,
};

const HEALTH_LABEL: Record<string, { ko: string; en: string }> = {
  steps: { ko: "걸음", en: "Steps" },
  workout: { ko: "움직임", en: "Movement" },
  sleep: { ko: "수면", en: "Sleep" },
  heart_rate: { ko: "심박", en: "Heart rate" },
};

function useStructuredLensData(userId: string, domain: DomainId): StructuredLensData {
  const [data, setData] = useState<StructuredLensData>({ status: "idle" });

  useEffect(() => {
    let alive = true;
    const structured = domain === "finance" || domain === "relation" || domain === "recreation" || domain === "health";
    if (!structured) {
      setData({ status: "idle" });
      return () => {
        alive = false;
      };
    }

    setData({ status: "loading" });
    void (async () => {
      try {
        if (domain === "finance") {
          const month = monthBucket(new Date());
          const entries = await listEntriesForMonth(userId, month);
          if (alive) setData({ status: "ready", finance: { entries, summary: summarizeMonth(entries, month) } });
          return;
        }
        if (domain === "relation") {
          const people = await listPeople(userId);
          if (alive) setData({ status: "ready", people });
          return;
        }
        if (domain === "recreation") {
          const recreation = await listRecreationItems(userId);
          if (alive) setData({ status: "ready", recreation });
          return;
        }
        const health = await listRecentSamples(userId, 50);
        if (alive) setData({ status: "ready", health });
      } catch (error) {
        console.warn("[star-lens] structured data failed", (error as Error).message);
        if (alive) setData({ status: "error" });
      }
    })();

    return () => {
      alive = false;
    };
  }, [domain, userId]);

  return data;
}

function SectionLabel({ children }: { children: string }) {
  return <RNText style={[m3TextStyle("titleMedium"), styles.sectionLabel]}>{children}</RNText>;
}

function EmptyPanel({
  body,
  action,
  route,
}: {
  body: string;
  action: string;
  route: string;
}) {
  return (
    <MdCard variant="outlined" style={styles.emptyCard}>
      <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>{body}</RNText>
      <MdButton variant="text" label={action} onPress={() => router.push(route as never)} />
    </MdCard>
  );
}

function RecordTimeline({
  records,
  empty,
}: {
  records: DomainLensRecord[];
  empty: string;
}) {
  const visible = records.slice(0, 8);
  if (visible.length === 0) {
    return <RNText style={[m3TextStyle("bodyMedium"), styles.timelineEmpty]}>{empty}</RNText>;
  }
  return (
    <View>
      {visible.map((record, index) => (
        <Pressable
          key={record.id}
          onPress={() => router.push({ pathname: "/record/[id]", params: { id: record.id } })}
          accessibilityRole="button"
          accessibilityLabel={record.topic ?? record.body?.split("\n")[0] ?? ""}
          style={styles.timelineRow}
        >
          <View style={styles.timelineRail}>
            <View style={styles.timelineDot} />
            {index < visible.length - 1 ? <View style={styles.timelineLine} /> : null}
          </View>
          <View style={styles.timelineCopy}>
            <RNText style={[m3TextStyle("labelSmall"), styles.monoMuted]}>
              {new Date(record.created_at).getFullYear()}
            </RNText>
            <RNText style={[m3TextStyle("bodyLarge"), styles.timelineTitle]} numberOfLines={1}>
              {record.topic ?? record.body?.split("\n")[0]}
            </RNText>
            {record.body ? (
              <RNText style={[m3TextStyle("bodySmall"), styles.muted]} numberOfLines={2}>
                {record.body}
              </RNText>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function CareerLens({ records, ko }: { records: DomainLensRecord[]; ko: boolean }) {
  const [track, setTrack] = useState<"main" | "side">("main");
  const credentials = ko
    ? ["학력", "병역", "수상", "자격", "경력"]
    : ["Education", "Service", "Awards", "Licenses", "Experience"];
  return (
    <>
      <SectionLabel>{ko ? "쌓아온 길" : "The path you have built"}</SectionLabel>
      <View style={styles.segmented}>
        {(["main", "side"] as const).map((key) => {
          const selected = track === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTrack(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.segment, selected && styles.segmentOn]}
            >
              <RNText style={[m3TextStyle("labelLarge"), selected ? styles.segmentTextOn : styles.segmentText]}>
                {key === "main" ? (ko ? "메인" : "Main") : ko ? "사이드" : "Side"}
              </RNText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legendRow}>
        {credentials.map((label, index) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, index % 2 === 1 && styles.legendDotViolet]} />
            <RNText style={[m3TextStyle("labelSmall"), styles.legendText]}>{label}</RNText>
          </View>
        ))}
      </View>
      <MdCard variant="outlined" style={styles.timelineCard}>
        {track === "main" ? (
          <RecordTimeline
            records={records}
            empty={ko ? "성과를 담으면 이 길에 실제 기록이 이어져요." : "Add an achievement and its real record will join this path."}
          />
        ) : (
          <View style={styles.sideEmpty}>
            <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>
              {ko
                ? "공식 이력은 연동된 자료가 생기면 학력, 수상, 자격, 경력 순으로 정리돼요."
                : "Connected official records will organize here as education, awards, licenses, and experience."}
            </RNText>
            <MdButton variant="text" label={ko ? "커리어 전체 보기" : "Open career"} onPress={() => router.push("/career")} />
          </View>
        )}
      </MdCard>
    </>
  );
}

function FinanceLens({
  payload,
  ko,
}: {
  payload: StructuredLensData["finance"];
  ko: boolean;
}) {
  if (!payload || payload.entries.length === 0) {
    return (
      <>
        <SectionLabel>{ko ? "이번 달 가계" : "This month"}</SectionLabel>
        <EmptyPanel
          body={ko ? "수입과 지출을 담으면 이번 달 흐름과 카테고리 구성이 여기에 보여요." : "Add income and expenses to see this month's flow and category mix here."}
          action={ko ? "가계 열기" : "Open ledger"}
          route="/ledger"
        />
      </>
    );
  }

  const { entries, summary } = payload;
  const money = (value: number) => `₩${Math.round(value).toLocaleString(ko ? "ko-KR" : "en-US")}`;
  const ratio = summary.income > 0 ? Math.min(1, summary.expense / summary.income) : summary.expense > 0 ? 1 : 0;
  const categoryTotal = Math.max(1, summary.byCategory.reduce((sum, row) => sum + row.total, 0));

  return (
    <>
      <SectionLabel>{ko ? "이번 달 가계" : "This month"}</SectionLabel>
      <MdCard variant="outlined" style={styles.financeCard}>
        <View style={styles.financeHeadline}>
          <View style={styles.flexOne}>
            <RNText style={[m3TextStyle("labelSmall"), styles.muted]}>{ko ? "지출" : "Expense"}</RNText>
            <RNText style={styles.money}>{money(summary.expense)}</RNText>
          </View>
          <View style={styles.financeRight}>
            <RNText style={[m3TextStyle("labelSmall"), styles.muted]}>{ko ? "수입" : "Income"}</RNText>
            <RNText style={[m3TextStyle("bodyMedium"), styles.financeIncome]}>{money(summary.income)}</RNText>
          </View>
        </View>
        <ProgressLinear
          value={ratio}
          accessibilityLabel={ko ? "수입 대비 지출" : "Expense compared with income"}
          style={styles.financeProgress}
        />
        <RNText style={[m3TextStyle("bodySmall"), styles.muted]}>
          {ko ? `이번 달 순흐름 ${money(summary.net)}` : `Net flow this month ${money(summary.net)}`}
        </RNText>
        {summary.byCategory.length > 0 ? (
          <>
            <View style={styles.categoryBar}>
              {summary.byCategory.slice(0, 5).map((category, index) => (
                <View
                  key={category.category}
                  style={[
                    styles.categorySlice,
                    { flex: Math.max(0.02, category.total / categoryTotal) },
                    index % 2 === 1 && styles.categorySliceAlt,
                  ]}
                />
              ))}
            </View>
            <View style={styles.categoryList}>
              {summary.byCategory.slice(0, 4).map((category, index) => (
                <View key={category.category} style={styles.categoryRow}>
                  <View style={[styles.categoryDot, index % 2 === 1 && styles.categoryDotAlt]} />
                  <RNText style={[m3TextStyle("bodySmall"), styles.flexOneText]} numberOfLines={1}>
                    {category.category}
                  </RNText>
                  <RNText style={[m3TextStyle("labelSmall"), styles.mono]}>{money(category.total)}</RNText>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </MdCard>

      <SectionLabel>{ko ? "현금 흐름" : "Cash flow"}</SectionLabel>
      <MdCard variant="outlined" style={styles.financeCard}>
        {entries.slice(0, 4).map((entry) => (
          <View key={entry.id} style={styles.flowRow}>
            <View style={[styles.flowMark, entry.kind === "income" ? styles.flowMarkIn : styles.flowMarkOut]} />
            <RNText style={[m3TextStyle("bodyMedium"), styles.flexOneText]} numberOfLines={1}>
              {entry.note || entry.category}
            </RNText>
            <RNText
              style={[
                m3TextStyle("labelMedium"),
                styles.mono,
                entry.kind === "income" ? styles.flowIn : styles.flowOut,
              ]}
            >
              {`${entry.kind === "income" ? "+" : "-"}${money(entry.amount_krw)}`}
            </RNText>
          </View>
        ))}
      </MdCard>
    </>
  );
}

function RelationLens({ people, ko }: { people: Person[] | undefined; ko: boolean }) {
  const visiblePeople = (people ?? []).slice(0, 24);
  const nodes = useMemo(() => layoutPeopleMap(visiblePeople), [visiblePeople]);
  if (nodes.length === 0) {
    return (
      <>
        <SectionLabel>{ko ? "나의 사람들" : "My people"}</SectionLabel>
        <EmptyPanel
          body={ko ? "사람을 한 명 담으면 나를 중심으로 실제 관계 지도가 시작돼요." : "Add one person to begin a real map centered on you."}
          action={ko ? "사람 지도 열기" : "Open people map"}
          route="/people"
        />
      </>
    );
  }

  return (
    <>
      <SectionLabel>{ko ? "나의 사람들" : "My people"}</SectionLabel>
      <Pressable
        onPress={() => router.push("/people")}
        accessibilityRole="button"
        accessibilityLabel={ko ? "관계 지도 전체 보기" : "Open full people map"}
        style={styles.mapCard}
      >
        <Svg width="100%" height="100%" viewBox="0 0 1000 1000">
          {[160, 310, 460].map((radius) => (
            <Circle
              key={radius}
              cx={500}
              cy={500}
              r={radius}
              fill="none"
              stroke={withAlpha(m3.accent.starDim, 0.16)}
              strokeWidth={2}
            />
          ))}
          {nodes.map((node) => (
            <Line
              key={`line-${node.id}`}
              x1={500}
              y1={500}
              x2={node.x * 1000}
              y2={node.y * 1000}
              stroke={withAlpha(RELATION_COLOR[node.kind], 0.28)}
              strokeWidth={3}
            />
          ))}
          <Circle cx={500} cy={500} r={32} fill={m3.accent.polaris} />
          <SvgText x={500} y={560} fill={m3.color.onSurface} fontSize={30} textAnchor="middle">
            {ko ? "나" : "Me"}
          </SvgText>
          {nodes.map((node) => {
            const radius = 16 + node.closeness * 3;
            return (
              <G key={node.id}>
                <Circle
                  cx={node.x * 1000}
                  cy={node.y * 1000}
                  r={radius}
                  fill={withAlpha(RELATION_COLOR[node.kind], 0.92)}
                />
                <SvgText
                  x={node.x * 1000}
                  y={node.y * 1000 - radius - 12}
                  fill={m3.color.onSurface}
                  fontSize={24}
                  textAnchor="middle"
                >
                  {node.name.length > 7 ? `${node.name.slice(0, 6)}…` : node.name}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </Pressable>
      <RNText style={[m3TextStyle("bodySmall"), styles.mapFoot]}>
        {ko ? "가까움은 중심과의 거리, 관계 종류는 별빛 색으로 보여요." : "Distance shows closeness; starlight color shows relation type."}
      </RNText>
    </>
  );
}

function GrowthLens({ records, ko }: { records: DomainLensRecord[]; ko: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<number, DomainLensRecord[]>();
    for (const record of records.slice(0, 40)) {
      const year = new Date(record.created_at).getFullYear();
      const decade = Math.floor(year / 10) * 10;
      const bucket = map.get(decade) ?? [];
      bucket.push(record);
      map.set(decade, bucket);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]).slice(0, 6);
  }, [records]);

  return (
    <>
      <SectionLabel>{ko ? "기록의 시간대" : "Chapters in your records"}</SectionLabel>
      <MdCard variant="outlined" style={styles.growthCard}>
        {groups.length === 0 ? (
          <View style={styles.sideEmpty}>
            <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>
              {ko ? "성장의 장면을 담으면 실제 기록의 시간대가 한 장씩 열려요." : "Add a growth moment and its real chapter will open here."}
            </RNText>
            <MdButton variant="text" label={ko ? "회상 시작하기" : "Start reflection"} onPress={() => router.push("/audit")} />
          </View>
        ) : (
          groups.map(([decade, items], index) => (
            <View key={decade} style={styles.chapterRow}>
              <View style={styles.chapterRail}>
                <View style={[styles.chapterDot, index === 0 && styles.chapterDotNow]} />
                {index < groups.length - 1 ? <View style={styles.chapterLine} /> : null}
              </View>
              <View style={styles.chapterBody}>
                <View style={styles.chapterHead}>
                  <RNText style={[m3TextStyle("titleMedium"), styles.onSurface]}>{`${decade}${ko ? "년대" : "s"}`}</RNText>
                  <RNText style={[m3TextStyle("labelSmall"), styles.monoMuted]}>
                    {ko ? `${items.length}개 기록` : `${items.length} records`}
                  </RNText>
                </View>
                <ProgressLinear value={Math.min(1, items.length / 10)} style={styles.chapterProgress} />
                <RNText style={[m3TextStyle("bodySmall"), styles.muted]} numberOfLines={2}>
                  {items[0]?.topic ?? items[0]?.body?.split("\n")[0]}
                </RNText>
              </View>
            </View>
          ))
        )}
      </MdCard>
    </>
  );
}

function HealthLens({
  samples,
  level,
  ko,
}: {
  samples: HealthSampleRow[] | undefined;
  level: LadderLevel | null;
  ko: boolean;
}) {
  const recent = samples ?? [];
  const coverage = Math.max(0, Math.min(1, ((level ?? 1) - 1) / 4));
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  const latestByMetric = new Map<string, HealthSampleRow>();
  for (const sample of recent) {
    if (!latestByMetric.has(sample.metric_type)) latestByMetric.set(sample.metric_type, sample);
  }
  const stats = [...latestByMetric.values()].slice(0, 3);
  const sleep = recent.filter((sample) => sample.metric_type === "sleep").slice(0, 7).reverse();
  const maxSleep = Math.max(1, ...sleep.map((sample) => sample.value));

  return (
    <>
      <SectionLabel>{ko ? "오늘의 건강 기록" : "Today's health records"}</SectionLabel>
      <MdCard variant="outlined" style={styles.healthCard}>
        <View style={styles.healthTop}>
          <View style={styles.ringWrap}>
            <Svg width={112} height={112} viewBox="0 0 112 112">
              <Circle
                cx={56}
                cy={56}
                r={radius}
                fill="none"
                stroke={m3.color.surfaceContainerHighest}
                strokeWidth={10}
              />
              <Circle
                cx={56}
                cy={56}
                r={radius}
                fill="none"
                stroke={m3.color.primary}
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={`${coverage * circumference} ${circumference}`}
                rotation={-90}
                origin="56, 56"
              />
            </Svg>
            <View style={styles.ringText}>
              <RNText style={styles.ringLevel}>{`L${level ?? 1}`}</RNText>
              <RNText style={[m3TextStyle("labelSmall"), styles.muted]}>{ko ? "기록 범위" : "Coverage"}</RNText>
            </View>
          </View>
          <View style={styles.healthStats}>
            {stats.length > 0 ? (
              stats.map((sample) => (
                <View key={sample.id} style={styles.healthStat}>
                  <RNText style={[m3TextStyle("bodySmall"), styles.muted]}>
                    {(HEALTH_LABEL[sample.metric_type] ?? { ko: sample.metric_type, en: sample.metric_type })[ko ? "ko" : "en"]}
                  </RNText>
                  <RNText style={[m3TextStyle("labelLarge"), styles.healthValue]}>
                    {`${Number(sample.value.toFixed(1)).toLocaleString()} ${sample.unit}`}
                  </RNText>
                </View>
              ))
            ) : (
              <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>
                {ko ? "연결된 건강 기록이 아직 없어요." : "No connected health records yet."}
              </RNText>
            )}
          </View>
        </View>
      </MdCard>

      <SectionLabel>{ko ? "수면 기록의 흐름" : "Sleep record trend"}</SectionLabel>
      <MdCard variant="outlined" style={styles.sleepCard}>
        {sleep.length === 0 ? (
          <View style={styles.sideEmpty}>
            <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>
              {ko ? "수면 기록을 연결하면 최근 흐름이 막대로 나타나요." : "Connect sleep records to see the recent pattern as bars."}
            </RNText>
            <MdButton variant="text" label={ko ? "데이터 연결" : "Connect data"} onPress={() => router.push("/import-hub")} />
          </View>
        ) : (
          <View style={styles.sleepBars}>
            {sleep.map((sample) => (
              <View key={sample.id} style={styles.sleepCol}>
                <RNText style={[m3TextStyle("labelSmall"), styles.monoMuted]}>{Number(sample.value.toFixed(1))}</RNText>
                <View style={[styles.sleepBar, { height: Math.max(12, (sample.value / maxSleep) * 74) }]} />
                <RNText style={[m3TextStyle("labelSmall"), styles.muted]}>
                  {new Date(sample.started_at).toLocaleDateString(ko ? "ko-KR" : "en-US", { weekday: "short" })}
                </RNText>
              </View>
            ))}
          </View>
        )}
      </MdCard>
    </>
  );
}

function RecreationLens({
  items,
  ko,
}: {
  items: RecreationItem[] | undefined;
  ko: boolean;
}) {
  const visible = (items ?? []).slice(0, 8);
  return (
    <>
      <SectionLabel>{ko ? "휴식 지도" : "Rest map"}</SectionLabel>
      <MdCard variant="outlined" style={styles.restCard}>
        <View style={styles.restMap}>
          <View style={styles.axisVertical} />
          <View style={styles.axisHorizontal} />
          <RNText style={[m3TextStyle("labelSmall"), styles.axisTop]}>{ko ? "채움" : "Fill"}</RNText>
          <RNText style={[m3TextStyle("labelSmall"), styles.axisBottom]}>{ko ? "비움" : "Empty"}</RNText>
          <RNText style={[m3TextStyle("labelSmall"), styles.axisLeft]}>{ko ? "혼자" : "Solo"}</RNText>
          <RNText style={[m3TextStyle("labelSmall"), styles.axisRight]}>{ko ? "함께" : "Together"}</RNText>
          {visible.length === 0 ? (
            <View style={styles.restEmpty}>
              <RNText style={[m3TextStyle("bodyMedium"), styles.restEmptyText]}>
                {ko ? "휴식을 담으면 여기에 별이 생겨요." : "Rest moments become stars here."}
              </RNText>
            </View>
          ) : (
            <View style={styles.restCluster}>
              {visible.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.restNodeWrap,
                    {
                      transform: [
                        { translateX: ((index % 3) - 1) * 48 },
                        { translateY: (Math.floor(index / 3) - 1) * 46 },
                      ],
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.restNode,
                      item.status === "active" ? styles.restNodeActive : item.status === "done" ? styles.restNodeDone : null,
                    ]}
                  />
                  <RNText style={[m3TextStyle("labelSmall"), styles.restNodeText]} numberOfLines={1}>
                    {item.title}
                  </RNText>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={styles.restFoot}>
          <RNText style={[m3TextStyle("bodySmall"), styles.muted]}>
            {ko
              ? "현재 항목은 중심에 모아 두었어요. 혼자·함께, 비움·채움 분류는 다음 입력부터 쌓여요."
              : "Current items stay neutral at the center. Solo/together and empty/fill classification will build from future entries."}
          </RNText>
          <MdButton variant="text" label={ko ? "휴식 기록 보기" : "Open rest records"} onPress={() => router.push("/rest")} />
        </View>
      </MdCard>
    </>
  );
}

function CollectLens({ records, ko }: { records: DomainLensRecord[]; ko: boolean }) {
  return (
    <>
      <SectionLabel>{ko ? "정리 대기" : "Waiting to organize"}</SectionLabel>
      <MdCard variant="outlined" style={styles.timelineCard}>
        <RecordTimeline
          records={records}
          empty={ko ? "아직 분류를 기다리는 기록이 없어요." : "There are no records waiting to be organized."}
        />
      </MdCard>
    </>
  );
}

export function DomainStarLens({
  domain,
  userId,
  records,
  level,
  ko,
}: {
  domain: DomainId;
  userId: string;
  records: DomainLensRecord[];
  level: LadderLevel | null;
  ko: boolean;
}) {
  const structured = useStructuredLensData(userId, domain);

  if (structured.status === "loading") {
    return (
      <MdCard variant="outlined" style={styles.loadingCard}>
        <ProgressLinear accessibilityLabel={ko ? "도메인 렌즈 불러오는 중" : "Loading domain lens"} />
        <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>
          {ko ? "실제 기록으로 렌즈를 맞추는 중이에요." : "Fitting the lens to your real records."}
        </RNText>
      </MdCard>
    );
  }

  if (structured.status === "error") {
    return (
      <EmptyPanel
        body={ko ? "전용 기록을 잠깐 불러오지 못했어요. 원본 화면에서 다시 확인해 주세요." : "The structured records did not load just now. Try their source screen."}
        action={ko ? "기록 전체 보기" : "Open all records"}
        route="/records"
      />
    );
  }

  switch (domain) {
    case "career":
      return <CareerLens records={records} ko={ko} />;
    case "finance":
      return <FinanceLens payload={structured.finance} ko={ko} />;
    case "relation":
      return <RelationLens people={structured.people} ko={ko} />;
    case "growth":
      return <GrowthLens records={records} ko={ko} />;
    case "health":
      return <HealthLens samples={structured.health} level={level} ko={ko} />;
    case "recreation":
      return <RecreationLens items={structured.recreation} ko={ko} />;
    case "collect":
      return <CollectLens records={records} ko={ko} />;
  }
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 10,
  },
  onSurface: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  muted: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  mono: { color: m3.color.onSurface, fontFamily: m3.font.mono },
  monoMuted: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.mono },
  flexOne: { flex: 1 },
  flexOneText: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand },
  emptyCard: { padding: 16, gap: 8, alignItems: "flex-start" },
  loadingCard: { marginTop: 20, padding: 16, gap: 14 },

  segmented: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 18,
    backgroundColor: m3.color.surfaceContainerHigh,
  },
  segment: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  segmentOn: { backgroundColor: m3.color.secondaryContainer },
  segmentText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  segmentTextOn: { color: m3.color.onSecondaryContainer, fontFamily: m3.font.brand, fontWeight: "700" },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, marginBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: m3.color.primary },
  legendDotViolet: { backgroundColor: m3.color.tertiary },
  legendText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  timelineCard: { padding: 14 },
  timelineRow: { flexDirection: "row", gap: 12, minHeight: 74 },
  timelineRail: { width: 18, alignItems: "center" },
  timelineDot: { width: 11, height: 11, borderRadius: 6, marginTop: 5, backgroundColor: m3.color.primary },
  timelineLine: { width: 2, flex: 1, marginTop: 5, backgroundColor: m3.color.outlineVariant },
  timelineCopy: { flex: 1, paddingBottom: 14, gap: 2 },
  timelineTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "700" },
  timelineEmpty: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, paddingVertical: 12 },
  sideEmpty: { gap: 8, alignItems: "flex-start" },

  financeCard: { padding: 16 },
  financeHeadline: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  financeRight: { alignItems: "flex-end" },
  financeIncome: { color: m3.color.onSurface, fontFamily: m3.font.mono, fontWeight: "600" },
  money: { color: m3.color.onSurface, fontFamily: m3.font.mono, fontSize: 24, lineHeight: 32, fontWeight: "700" },
  financeProgress: { height: 8, borderRadius: 4, marginTop: 12, marginBottom: 8 },
  categoryBar: { flexDirection: "row", height: 14, gap: 2, marginTop: 16, overflow: "hidden", borderRadius: 7 },
  categorySlice: { minWidth: 4, backgroundColor: m3.color.primary },
  categorySliceAlt: { backgroundColor: m3.color.tertiary },
  categoryList: { gap: 8, marginTop: 12 },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  categoryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: m3.color.primary },
  categoryDotAlt: { backgroundColor: m3.color.tertiary },
  flowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  flowMark: { width: 8, height: 8, borderRadius: 4 },
  flowMarkIn: { backgroundColor: m3.accent.moodPositive },
  flowMarkOut: { backgroundColor: m3.color.tertiary },
  flowIn: { color: m3.accent.moodPositive },
  flowOut: { color: m3.color.onSurface },

  mapCard: {
    aspectRatio: 1.2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    backgroundColor: withAlpha(m3.color.surfaceContainerLow, 0.9),
    overflow: "hidden",
  },
  mapFoot: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 8 },

  growthCard: { padding: 14 },
  chapterRow: { flexDirection: "row", gap: 12, minHeight: 88 },
  chapterRail: { width: 16, alignItems: "center" },
  chapterDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
    borderWidth: 2,
    borderColor: m3.color.outline,
    backgroundColor: m3.color.surface,
  },
  chapterDotNow: { width: 13, height: 13, borderRadius: 7, borderWidth: 0, backgroundColor: m3.color.primary },
  chapterLine: { width: 2, flex: 1, marginTop: 4, backgroundColor: m3.color.outlineVariant },
  chapterBody: { flex: 1, paddingBottom: 16 },
  chapterHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  chapterProgress: { marginTop: 8, marginBottom: 7 },

  healthCard: { padding: 16 },
  healthTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  ringWrap: { width: 112, height: 112, alignItems: "center", justifyContent: "center" },
  ringText: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  ringLevel: { color: m3.color.onSurface, fontFamily: m3.font.mono, fontSize: 27, lineHeight: 32, fontWeight: "700" },
  healthStats: { flex: 1, gap: 7 },
  healthStat: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: m3.color.surfaceContainerHigh,
  },
  healthValue: { color: m3.color.onSurface, fontFamily: m3.font.mono, fontWeight: "700" },
  sleepCard: { padding: 16 },
  sleepBars: { height: 126, flexDirection: "row", alignItems: "flex-end", gap: 7 },
  sleepCol: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 5 },
  sleepBar: { width: "68%", minHeight: 12, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: m3.color.primary },

  restCard: { padding: 14 },
  restMap: {
    height: 250,
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  axisVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: 1,
    backgroundColor: m3.color.outlineVariant,
  },
  axisHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 1,
    backgroundColor: m3.color.outlineVariant,
  },
  axisTop: { position: "absolute", top: 7, left: "48%", color: m3.color.onSurfaceVariant },
  axisBottom: { position: "absolute", bottom: 7, left: "48%", color: m3.color.onSurfaceVariant },
  axisLeft: { position: "absolute", left: 7, top: "47%", color: m3.color.onSurfaceVariant },
  axisRight: { position: "absolute", right: 7, top: "47%", color: m3.color.onSurfaceVariant },
  restEmpty: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingHorizontal: 46 },
  restEmptyText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, textAlign: "center" },
  restCluster: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  restNodeWrap: { position: "absolute", width: 82, alignItems: "center", gap: 4 },
  restNode: { width: 17, height: 17, borderRadius: 9, borderWidth: 2, borderColor: m3.color.primary },
  restNodeActive: { backgroundColor: m3.color.primary },
  restNodeDone: { backgroundColor: m3.color.tertiary, borderColor: m3.color.tertiary },
  restNodeText: { width: 82, textAlign: "center", color: m3.color.onSurface, fontFamily: m3.font.brand },
  restFoot: { marginTop: 12, gap: 4, alignItems: "flex-start" },
});
