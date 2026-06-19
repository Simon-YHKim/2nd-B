import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Line } from "react-native-svg";

import { colors, radius, spacing } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SecondbHead, SecondbStatusHeader } from "@/components/deepspace";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { systemLocaleFor } from "@/lib/i18n/locales";
import { fetchPrivacyPrefs } from "@/lib/supabase/privacy";
import { OPS_GROUP_IDS, domainsForGroup, type OpsDomainId, type OpsGroupId } from "@/lib/ops/domains";
import { recommendForDomain, recommendationsAllowed, type OpsRecommendation } from "@/lib/ops/recommend";
import { buildGoogleCalendarUrl } from "@/lib/ops/push";
import { OPS_DAILY_LIMIT, bumpOpsUsage, readOpsUsage } from "@/lib/ops/usage";
import { deleteSource, listAllWikiLinks, listSources, listWikiPages } from "@/lib/wiki/queries";
import { generateSourcePage } from "@/lib/wiki/phase2";
import { deleteRecord, getRecordById, listRecentRecords } from "@/lib/records/create";
import type { SourceRow, WikiPageRow } from "@/lib/wiki/types";
import {
  buildDeepResearchView,
  buildDeepWikiView,
  buildDomainsView,
  recencyLabel,
  type RecencyLabels,
  type WikiEdge,
} from "./wiki-graph-view";
import {
  buildRecordsTimeline,
  relatedByTag,
  RECORD_KIND_ICON,
  type TimelineLabels,
  type TimelineRecord,
} from "./records-timeline";

// i18n label builders for the pure date helpers (which stay i18n-free).
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

type Row = { label: string; value?: string; onPress?: () => void; on?: boolean };

// Shared loader for the two graph-backed deep-space screens (/wiki + /research).
// Mirrors what the legacy /wiki loads: pages + the full edge set, both bounded.
// A links failure degrades to a zero-edge graph rather than blanking the screen.
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
      <ActivityIndicator color={colors.cyan} />
    </View>
  );
}

function Shell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.stars}><View style={[styles.star,{left:"12%",top:42}]} /><View style={[styles.star,{right:"18%",top:118,opacity:.55}]} /><View style={[styles.star,{left:"42%",bottom:92,opacity:.5}]} /></View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {title ? <View style={styles.titleRow}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><View><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View></View> : null}
        {children}
      </ScrollView>
    </View>
  );
}

function Card({ children, style }: { children: ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }
function Action({ label, value, onPress }: Row) { return <Pressable onPress={onPress} style={styles.action}><Text style={styles.actionLabel}>{label}</Text>{value ? <Text style={styles.actionValue}>{value}</Text> : <Text style={styles.chev}>›</Text>}</Pressable>; }
function Toggle({ label, value, on = true }: Row) { return <View style={styles.action}><View><Text style={styles.actionLabel}>{label}</Text>{value ? <Text style={styles.actionValue}>{value}</Text> : null}</View><View style={[styles.toggle,on&&styles.toggleOn]}><View style={[styles.knob,on&&styles.knobOn]} /></View></View>; }

export function DeepSpaceGraphDesignScreen() {
  const { t } = useTranslation("deepspace");
  const clusters = [
    { x: 63, y: 135, t: t("graph.clRecords") }, { x: 136, y: 92, t: t("graph.clRelations") }, { x: 219, y: 134, t: t("graph.clKnowledge") }, { x: 106, y: 226, t: t("graph.clTaste") }, { x: 207, y: 225, t: t("graph.clGrowth") },
  ];
  return <Shell title={t("graph.title")} subtitle={t("graph.subtitle", { nodes: 128, edges: 342 })}><SecondbStatusHeader text={t("graph.status")} tip={t("graph.tip")} /><Card style={styles.graphCard}><Svg width="100%" height={310} viewBox="0 0 300 310"><Circle cx={150} cy={160} r={34} fill={colors.soul} opacity={.95}/>{clusters.map((c,i)=><Line key={'l'+i} x1={150} y1={160} x2={c.x} y2={c.y} stroke={colors.borderHi} strokeWidth={1.4}/>) }{clusters.map((c,i)=><Circle key={'c'+i} cx={c.x} cy={c.y} r={22} fill={colors.cyan} opacity={.22}/>) }<Circle cx={150} cy={160} r={9} fill={colors.textHi}/>{[42,86,118,244,257,188,72].map((x,i)=><Circle key={i} cx={x} cy={70+i*30%190} r={4} fill={colors.cyanSoft} opacity={.75}/>)}</Svg><Text style={styles.centerCaption}>{t("graph.me")}</Text>{clusters.map((c)=><Text key={c.t} style={[styles.clusterLabel,{left:c.x-18,top:c.y+23}]}>{c.t}</Text>)}</Card><View style={styles.ctaRow}><Pressable style={styles.primary} onPress={() => router.push('/records')}><Text style={styles.primaryText}>{t("graph.viewClusters")}</Text></Pressable><Pressable style={styles.secondary} onPress={() => router.push('/research')}><Text style={styles.secondaryText}>{t("graph.findConnections")}</Text></Pressable></View></Shell>;
}

export function DeepSpaceIntegrationsScreen() { const { t } = useTranslation("deepspace"); return <Shell title={t("integrations.title")}><SecondbStatusHeader text={t("integrations.status")} tip={t("integrations.tip")} /><Card><Text style={styles.section}>{t("integrations.sectionAssistant")}</Text>{['ChatGPT','Claude','Gemini'].map((x)=><Action key={x} label={x} value={t("integrations.pending")} />)}</Card><Card><Text style={styles.section}>{t("integrations.sectionSources")}</Text><Toggle label="Notion" value={t("integrations.notionValue")} /><Toggle label="Obsidian" value={t("integrations.obsidianValue")} on={false} /><Toggle label={t("integrations.healthLabel")} value={t("integrations.permissionNeeded")} on={false} /></Card><Text style={styles.footer}>{t("integrations.footer")}</Text></Shell>; }

export function DeepSpaceSupportDesignScreen() { const { t } = useTranslation("deepspace"); return <Shell title={t("support.title")}><View style={styles.center}><SecondbHead size={104} mood="positive" /><Text style={styles.prompt}>{t("support.prompt")}</Text></View><Card>{[{label:t("support.askSecondb"),onPress:()=>router.push('/secondb')},{label:t("support.viewManual"),onPress:()=>router.push('/manual')},{label:t("support.emailUs"),onPress:()=>Linking.openURL('mailto:support@2nd-brain.app')},{label:t("support.reportBug"),onPress:()=>Linking.openURL('mailto:support@2nd-brain.app?subject=Bug%20report')}].map((r)=><Action key={r.label} {...r}/>)}</Card><Text style={styles.footer}>{t("support.footer")}</Text></Shell>; }

export function DeepSpaceAccountDesignScreen() { const { t } = useTranslation("deepspace"); const rows: [string, string][] = [[t("account.labelName"),'Simon Kim'],[t("account.labelEmail"),'simon@example.com'],[t("account.labelPassword"),t("account.valueChange")],[t("account.labelLinked"),'Google'],[t("account.labelLanguage"),t("account.valueLanguage")]]; return <Shell title={t("account.title")}><SecondbStatusHeader text={t("account.status")} tip={t("account.tip")} /><View style={styles.center}><View style={styles.avatar}><SecondbHead size={72} mood="neutral" /></View><Text style={styles.prompt}>Simon Kim</Text><Text style={styles.footer}>{t("account.joined", { date: "2026.06" })}</Text></View><Card>{rows.map(([label,value])=><Action key={label} label={label} value={value}/>)}</Card><Pressable style={styles.danger}><Text style={styles.dangerText}>{t("account.delete")}</Text></Pressable></Shell>; }

export function DeepSpacePrivacyDesignScreen() { const { t } = useTranslation("deepspace"); return <Shell title={t("privacy.title")}><SecondbStatusHeader text={t("privacy.status")} tip={t("privacy.tip")} /><Text style={styles.lead}>{t("privacy.lead")}</Text><Card><Toggle label={t("privacy.toggleAnalysis")} value={t("privacy.on")} /><Toggle label={t("privacy.toggleStats")} value={t("privacy.off")} on={false} /><Toggle label={t("privacy.toggleLock")} value={t("privacy.on")} /></Card><Card><Action label={t("privacy.policy")} value={t("privacy.view")}/><Action label={t("privacy.processingLog")} value={t("privacy.last7")}/><Action label={t("privacy.thirdParty")} value={t("privacy.none")}/></Card><Text style={styles.footer}>{t("privacy.footer")}</Text></Shell>; }

export function DeepSpaceSignInDesignScreen() { const { t } = useTranslation("deepspace"); return <Shell><View style={styles.authHero}><SecondbHead size={132} mood="positive"/><Text style={styles.big}>{t("auth.appName")}</Text><Text style={styles.lead}>{t("auth.signInLead")}</Text></View><Card><TextInput placeholder="email@example.com" placeholderTextColor={colors.textLo} style={styles.input}/><TextInput placeholder="password" placeholderTextColor={colors.textLo} secureTextEntry style={styles.input}/><Pressable style={styles.primary}><Text style={styles.primaryText}>{t("auth.signIn")}</Text></Pressable><Pressable onPress={()=>router.push('/sign-up')}><Text style={styles.link}>{t("auth.createAccount")}</Text></Pressable></Card></Shell>; }

export function DeepSpaceSignUpDesignScreen() { const { t } = useTranslation("deepspace"); return <Shell><View style={styles.authHero}><SecondbHead size={120} mood="neutral"/><Text style={styles.big}>{t("auth.signUpTitle")}</Text><Text style={styles.lead}>{t("auth.signUpLead")}</Text></View><Card>{[t("auth.fieldEmail"),t("auth.fieldPassword"),t("auth.fieldBirthYear")].map((p)=><TextInput key={p} placeholder={p} placeholderTextColor={colors.textLo} style={styles.input}/>) }<Pressable style={styles.primary}><Text style={styles.primaryText}>{t("auth.signUp")}</Text></Pressable></Card></Shell>; }

export function DeepSpaceResetPasswordDesignScreen() { const { t } = useTranslation("deepspace"); return <Shell title={t("auth.resetTitle")}><View style={styles.center}><Text style={styles.mail}>✉</Text><Text style={styles.prompt}>{t("auth.resetPrompt")}</Text><Text style={styles.footer}>{t("auth.resetBody")}</Text></View><View style={styles.codeRow}>{['','', '', '', '', ''].map((_,i)=><View key={i} style={styles.codeCell}/>)}</View><Text style={styles.footer}>{t("auth.resend", { time: "00:42" })}</Text><Pressable style={styles.primary}><Text style={styles.primaryText}>{t("auth.confirm")}</Text></Pressable></Shell>; }

export function DeepSpaceInsightsScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("insights.title")}>
      <SecondbStatusHeader text={t("insights.status")} tip={t("insights.tip")} mood="positive" />
      <Card>
        <Text style={styles.section}>{t("insights.sectionNow")}</Text>
        <Text style={styles.lead}>{t("insights.lead")}</Text>
        <Text style={styles.footer}>{t("insights.weeklyCap")}</Text>
        <View style={styles.compareRow}>
          <View style={styles.compareCol}><Text style={styles.compareNum}>18</Text><Text style={styles.compareCap}>{t("insights.lastWeek")}</Text></View>
          <Text style={styles.chev}>›</Text>
          <View style={styles.compareCol}><Text style={[styles.compareNum, styles.compareNumHi]}>31</Text><Text style={styles.compareCap}>{t("insights.thisWeek")}</Text></View>
        </View>
        <Text style={styles.delta}>{t("insights.delta", { percent: 72 })}</Text>
      </Card>
      <Card>
        <Text style={styles.section}>{t("insights.sectionFinding")}</Text>
        <Text style={styles.lead}>{t("insights.finding")}</Text>
      </Card>
    </Shell>
  );
}

export function DeepSpaceDataDesignScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("data.title")} subtitle={t("data.subtitle")}>
      <SecondbStatusHeader text={t("data.status")} tip={t("data.tip")} />
      <View style={styles.statRow}>
        <View style={styles.statBox}><Text style={styles.statNum}>412</Text><Text style={styles.statCap}>{t("data.statPieces")}</Text></View>
        <View style={styles.statBox}><Text style={styles.statNum}>7</Text><Text style={styles.statCap}>{t("data.statChecks")}</Text></View>
      </View>
      <Card>
        <Text style={styles.section}>{t("data.sectionStorage")}</Text>
        <Action label={t("data.onDevice")} value={t("data.encrypted")} />
        <Action label={t("data.cloudSync")} value={t("data.on")} />
      </Card>
      <Card>
        <Action label={t("data.exportAll")} />
        <Action label={t("data.deleteAll")} />
      </Card>
    </Shell>
  );
}

export function DeepSpaceThemeScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("theme.title")}>
      <SecondbStatusHeader text={t("theme.status")} tip={t("theme.tip")} />
      <Card>
        <Text style={styles.section}>{t("theme.sectionTheme")}</Text>
        <Action label={t("theme.themeDeepspace")} value="✓" />
        <Action label={t("theme.themeMidnight")} />
      </Card>
      <Card>
        <Text style={styles.section}>{t("theme.sectionFont")}</Text>
        <Action label={t("theme.fontPixel")} value="✓" />
        <Action label={t("theme.fontReadable")} />
      </Card>
      <Card>
        <Text style={styles.section}>{t("theme.sectionSize")}</Text>
        <View style={styles.sizeRow}>
          <Text style={styles.sizeCap}>{t("theme.small")}</Text>
          <View style={styles.sizeTrack}><View style={styles.sizeKnob} /></View>
          <Text style={styles.sizeCapLg}>{t("theme.large")}</Text>
        </View>
        <Toggle label={t("theme.reduceMotion")} on={false} />
      </Card>
    </Shell>
  );
}

export function DeepSpaceManualScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("manual.title")}>
      <SecondbStatusHeader text={t("manual.status")} tip={t("manual.tip")} />
      <View style={styles.searchBox}><Text style={styles.searchText}>{t("manual.search")}</Text></View>
      <Card>
        <Text style={styles.section}>{t("manual.sectionStart")}</Text>
        <Action label={t("manual.q1")} />
        <Action label={t("manual.q2")} />
        <Action label={t("manual.q3")} />
      </Card>
      <Card>
        <Text style={styles.section}>{t("manual.sectionData")}</Text>
        <Action label={t("manual.q4")} />
        <Action label={t("manual.q5")} />
        <Action label={t("manual.askDirect")} onPress={() => router.push('/secondb')} />
      </Card>
    </Shell>
  );
}

export function DeepSpacePlansScreen() {
  const { t } = useTranslation("deepspace");
  const proFeats = [t("plans.proFeat1"), t("plans.proFeat2"), t("plans.proFeat3"), t("plans.proFeat4")];
  return (
    <Shell title={t("plans.title")}>
      <SecondbStatusHeader text={t("plans.status")} tip={t("plans.tip")} mood="positive" />
      <Card style={styles.planPro}>
        <View style={styles.planHead}><Text style={styles.planName}>Pro</Text><Text style={styles.planBadge}>{t("plans.recommended")}</Text></View>
        <Text style={styles.planPrice}>₩9,900 <Text style={styles.planPer}>{t("plans.perMonth")}</Text></Text>
        {proFeats.map((x) => <Text key={x} style={styles.planFeat}>✦ {x}</Text>)}
      </Card>
      <Card>
        <View style={styles.planHead}><Text style={styles.planName}>Free</Text><Text style={styles.footer}>{t("plans.currentPlan")}</Text></View>
        <Text style={styles.planFeatDim}>{t("plans.freeFeat")}</Text>
      </Card>
      <Pressable style={styles.primary}><Text style={styles.primaryText}>{t("plans.startPro")}</Text></Pressable>
    </Shell>
  );
}

export function DeepSpacePermissionsScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("permissions.title")}>
      <SecondbStatusHeader text={t("permissions.status")} tip={t("permissions.tip")} />
      <Card>
        <Toggle label={t("permissions.notif")} value={t("permissions.notifValue")} />
        <Toggle label={t("permissions.photo")} value={t("permissions.photoValue")} on={false} />
        <Toggle label={t("permissions.mic")} value={t("permissions.micValue")} on={false} />
      </Card>
      <Pressable style={styles.primary}><Text style={styles.primaryText}>{t("permissions.continue")}</Text></Pressable>
    </Shell>
  );
}

export function DeepSpaceDiscoverScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("discover.title")}>
      <SecondbStatusHeader text={t("discover.status")} tip={t("discover.tip")} mood="positive" />
      <Text style={styles.lead}>{t("discover.lead")}</Text>
      <Card>
        <View style={styles.trendHead}><Text style={styles.section}>{t("discover.card1Head")}</Text><Text style={styles.delta}>{t("discover.card1Delta", { percent: 32 })}</Text></View>
        <Text style={styles.planFeatDim}>{t("discover.card1Body")}</Text>
      </Card>
      <Card>
        <View style={styles.trendHead}><Text style={styles.section}>{t("discover.card2Head")}</Text><Text style={styles.delta}>{t("discover.card2Delta", { percent: 18 })}</Text></View>
        <Text style={styles.planFeatDim}>{t("discover.card2Body")}</Text>
      </Card>
      <Text style={styles.footer}>{t("discover.footer")}</Text>
    </Shell>
  );
}

export function DeepSpaceReviewScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("review.title")}>
      <SecondbStatusHeader text={t("review.status")} tip={t("review.tip")} />
      <Text style={styles.lead}>{t("review.lead")}</Text>
      <Card>
        <Text style={styles.section}>{t("review.section")}</Text>
        <Text style={styles.planFeatDim}>{t("review.body")}</Text>
        <View style={styles.compareRow}>
          <View style={styles.compareCol}><Text style={styles.compareCap}>{t("review.now")}</Text><Text style={styles.compareNum}>61</Text></View>
          <Text style={styles.chev}>›</Text>
          <View style={styles.compareCol}><Text style={styles.compareCap}>{t("review.suggest")}</Text><Text style={[styles.compareNum, styles.compareNumHi]}>68</Text></View>
        </View>
        <Text style={styles.footer}>{t("review.evidence", { count: 5 })}</Text>
      </Card>
      <Text style={styles.footer}>{t("review.footer")}</Text>
      <View style={styles.ctaRow}>
        <Pressable style={styles.secondary}><Text style={styles.secondaryText}>{t("review.hold")}</Text></Pressable>
        <Pressable style={styles.primary}><Text style={styles.primaryText}>{t("review.approve")}</Text></Pressable>
      </View>
    </Shell>
  );
}

function FilterChip({ label, active, violet, onPress }: { label: string; active?: boolean; violet?: boolean; onPress?: () => void }) {
  const inner = (
    <Text style={[styles.fchipText, active && styles.fchipTextActive, violet && styles.fchipTextViolet]}>{label}</Text>
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

function TimelineRow({ icon, title, time, tag, dim }: { icon: string; title: string; time?: string; tag?: string; dim?: boolean }) {
  return (
    <View style={{ gap: 5 }}>
      <View style={styles.tlRow}>
        <View style={[styles.tlDot, dim && styles.tlDotDim]} />
        <Text style={styles.tlIcon}>{icon}</Text>
        <Text style={[styles.tlTitle, dim && styles.tlTitleDim]} numberOfLines={1}>{title}</Text>
        {time ? <Text style={styles.tlTime}>{time}</Text> : null}
      </View>
      {tag ? <View style={styles.tlTagRow}><Text style={styles.tlTag}>{tag}</Text></View> : null}
    </View>
  );
}

const RECORD_KIND_FILTERS: { id: TimelineRecord["kind"] | null; labelKey: string }[] = [
  { id: null, labelKey: "records.filterAll" },
  { id: "journal", labelKey: "records.filterJournal" },
  { id: "note", labelKey: "records.filterNote" },
  { id: "audit_response", labelKey: "records.filterAudit" },
];

export function DeepSpaceRecordsScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<TimelineRecord["kind"] | null>(null);

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

  const groups = useMemo(() => {
    const filtered = kind === null ? records : records.filter((r) => r.kind === kind);
    return buildRecordsTimeline(filtered, { labels: dsTimeLabels(t) });
  }, [records, kind, t]);

  if (authLoading) {
    return <Shell title={t("records.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const total = records.length;
  return (
    <Shell title={t("records.title")}>
      <SecondbStatusHeader
        text={total > 0 ? t("records.headerCount", { count: total }) : t("records.headerEmpty")}
        tip={t("records.tip")}
      />
      <Text style={styles.lead}>{t("records.lead")}</Text>
      <View style={styles.filterRow}>
        {RECORD_KIND_FILTERS.map((f) => (
          <FilterChip
            key={f.labelKey}
            label={t(f.labelKey)}
            active={kind === f.id}
            onPress={() => setKind(f.id)}
          />
        ))}
      </View>
      {loading ? (
        <GraphLoading />
      ) : groups.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>{kind === null ? t("records.emptyAll") : t("records.emptyKind")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.label}>
            <Text style={styles.tlLabel}>{g.label}</Text>
            <View style={styles.tlGroup}>
              {g.items.map((it) => (
                <TimelineRow key={it.id} icon={it.icon} title={it.title} time={it.timeLabel || undefined} tag={it.tag} dim={it.dim} />
              ))}
            </View>
          </View>
        ))
      )}
    </Shell>
  );
}

const SOURCE_KIND_ICON: Record<string, string> = {
  inbox: "✎",
  article: "🔗",
  video: "🎬",
  paper: "📄",
  reddit: "💬",
  code: "⌨",
  ai_tool: "🤖",
  self_knowledge: "🪞",
};

function sourceTitle(s: SourceRow, fallback: string): string {
  const title = s.title?.trim();
  return title && title.length > 0 ? title : fallback;
}

export function DeepSpaceInboxScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useMemo(
    () => async (uid: string) => {
      const rows = await listSources(uid, { ingested: false, limit: 50 });
      setSources(rows);
    },
    [],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    load(userId)
      .catch(() => {
        if (alive) setSources([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, load]);

  async function promote(s: SourceRow) {
    if (!userId) return;
    setBusyId(s.id);
    try {
      await generateSourcePage(userId, s.id);
      await load(userId);
    } catch {
      // best-effort; the row stays in the queue to retry
    } finally {
      setBusyId(null);
    }
  }

  async function discard(s: SourceRow) {
    if (!userId) return;
    setBusyId(s.id);
    try {
      await deleteSource(userId, s.id);
      await load(userId);
    } catch {
      // best-effort
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) {
    return <Shell title={t("inbox.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const pending = sources.length;
  const [current, ...queue] = sources;

  return (
    <Shell title={t("inbox.title")}>
      <SecondbStatusHeader
        text={pending > 0 ? t("inbox.headerPending", { count: pending }) : t("inbox.headerEmpty")}
        tip={t("inbox.tip")}
      />
      {loading ? (
        <GraphLoading />
      ) : pending === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>{t("inbox.emptyDone")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.lead}>{t("inbox.remaining", { count: pending })}</Text>
          <Card style={styles.triageCard}>
            <View style={styles.triageMeta}>
              <Text style={styles.tlIcon}>{SOURCE_KIND_ICON[current.kind] ?? "•"}</Text>
              <Text style={styles.metaLabel}>{current.kind}</Text>
            </View>
            <Text style={styles.triageBody} numberOfLines={3}>{sourceTitle(current, t("inbox.untitled"))}</Text>
            {current.tags.length > 0 ? (
              <View style={styles.filterRow}>
                {current.tags.slice(0, 4).map((tag) => (
                  <FilterChip key={tag} label={`#${tag}`} active />
                ))}
              </View>
            ) : null}
            <View style={styles.ctaRow}>
              <Pressable
                style={styles.iconBtn}
                onPress={() => void discard(current)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.a11yDiscard")}
              >
                <Text style={styles.iconBtnText}>🗑</Text>
              </Pressable>
              <Pressable
                style={styles.primary}
                onPress={() => void promote(current)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.a11yArchive")}
              >
                <Text style={styles.primaryText}>{busyId === current.id ? t("inbox.archiving") : t("inbox.archive")}</Text>
              </Pressable>
            </View>
          </Card>
          {queue.length > 0 ? (
            <>
              <Text style={styles.tlLabel}>{t("inbox.nextUp")}</Text>
              <View style={{ gap: 7 }}>
                {queue.slice(0, 8).map((s, i) => (
                  <View key={s.id} style={[styles.queueItem, i > 0 && styles.queueItemDim]}>
                    <Text style={styles.tlIcon}>{SOURCE_KIND_ICON[s.kind] ?? "•"}</Text>
                    <Text style={styles.queueText} numberOfLines={1}>{sourceTitle(s, t("inbox.untitled"))}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </Shell>
  );
}

// Fixed satellite slots around the central god-node; we light up as many as
// there are real hubs (capped at 4). STEP 3 will replace this with true
// clusters — for now it honestly mirrors the top-cited pages.
const RESEARCH_SAT = [
  { cx: 70, cy: 40, r: 5, fill: colors.cyan, stroke: colors.borderHi },
  { cx: 200, cy: 38, r: 4, fill: colors.cyanDim, stroke: colors.borderHi },
  { cx: 95, cy: 92, r: 4, fill: colors.soul, stroke: colors.soulLine },
  { cx: 185, cy: 90, r: 4, fill: colors.cyanDim, stroke: colors.border },
] as const;

export function DeepSpaceResearchScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const view = useMemo(() => buildDeepResearchView(pages, edges), [pages, edges]);

  if (authLoading) {
    return <Shell title={t("research.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const satellites = RESEARCH_SAT.slice(0, Math.max(1, Math.min(view.hubs.length, 4)));
  const headerText =
    view.headline !== null
      ? t("research.headerFound", { count: view.edgeCount })
      : t("research.headerNone");

  return (
    <Shell title={t("research.title")}>
      <SecondbStatusHeader text={headerText} tip={t("research.tip")} mood="positive" />
      <Text style={styles.lead}>{t("research.lead")}</Text>
      {loading ? (
        <GraphLoading />
      ) : view.pageCount === 0 ? (
        <View style={styles.insightViolet}>
          <Text style={styles.insightVioletText}>{t("research.emptyInsight")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {view.clusters.length > 0 ? (
            <View style={styles.filterRow}>
              {view.clusters.map((c, i) => (
                <FilterChip key={c.tag} label={`${c.tag} · ${c.count}`} violet={i === 0} />
              ))}
            </View>
          ) : null}
          <View style={styles.researchGraph}>
            <Svg width="100%" height={118} viewBox="0 0 260 118">
              {satellites.map((s, i) => (
                <Line key={`l${i}`} x1={135} y1={62} x2={s.cx} y2={s.cy} stroke={s.stroke} strokeWidth={1} />
              ))}
              {satellites.map((s, i) => (
                <Circle key={`c${i}`} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />
              ))}
              <Circle cx={135} cy={62} r={8} fill={colors.textTitle} />
            </Svg>
            <Text style={styles.graphTag}>
              {view.clusters.length > 0
                ? t("research.clusterTag", { tag: view.clusters[0].tag })
                : t("research.clusterDefault")}
            </Text>
          </View>
          {view.headline !== null ? (
            <View style={styles.insightViolet}>
              <Text style={styles.insightVioletText}>{t("research.headline", { title: view.headline.title })}</Text>
              <View style={styles.evRow}>
                <Text style={styles.evChip}>📎 {t("research.chipPages", { count: view.pageCount })}</Text>
                <Text style={styles.evChip}>{t("research.chipLinks", { count: view.headline.inDegree })}</Text>
                {view.orphanCount > 0 ? <Text style={styles.evChip}>{t("research.chipOrphans", { count: view.orphanCount })}</Text> : null}
              </View>
            </View>
          ) : (
            <View style={styles.insightViolet}>
              <Text style={styles.insightVioletText}>{t("research.noLinks")}</Text>
            </View>
          )}
          {view.surprise !== null ? (
            <View style={styles.insightViolet}>
              <Text style={styles.insightVioletText}>
                {t("research.surprise", { from: view.surprise.fromTitle, to: view.surprise.toTitle })}
              </Text>
              <View style={styles.evRow}>
                <Text style={styles.evChip}>{t("research.islandChip", { count: view.islandCount })}</Text>
              </View>
            </View>
          ) : null}
        </>
      )}
    </Shell>
  );
}

export function DeepSpaceFormatsScreen() {
  // Static export-format picker; the export pipeline wiring is a follow-up.
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("formats.title")}>
      <SecondbStatusHeader text={t("formats.status")} tip={t("formats.tip")} />
      <Text style={styles.lead}>{t("formats.lead")}</Text>
      <View style={styles.formatGrid}>
        <View style={[styles.formatCard, styles.formatCardSel]}><Text style={[styles.formatName, styles.formatNameSel]}>.iden</Text><Text style={styles.formatDesc}>{t("formats.idenDesc")}</Text></View>
        <View style={styles.formatCard}><Text style={styles.formatName}>Markdown</Text><Text style={styles.formatDesc}>{t("formats.markdownDesc")}</Text></View>
        <View style={styles.formatCard}><Text style={styles.formatName}>JSON</Text><Text style={styles.formatDesc}>{t("formats.jsonDesc")}</Text></View>
        <View style={styles.formatCard}><Text style={styles.formatName}>PDF</Text><Text style={styles.formatDesc}>{t("formats.pdfDesc")}</Text></View>
      </View>
      <Text style={styles.tlLabel}>{t("formats.scopeLabel")}</Text>
      <Card>
        <Toggle label={t("formats.scope1")} on />
        <Toggle label={t("formats.scope2")} on />
        <Toggle label={t("formats.scope3", { count: 248 })} on={false} />
      </Card>
      <Pressable style={styles.soulPrimary}><Text style={styles.primaryText}>{t("formats.exportIden")}</Text></Pressable>
    </Shell>
  );
}

export function DeepSpaceImportScreen() {
  // Static import mockup; external connectors + review-before-import are a follow-up.
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("import.title")}>
      <SecondbStatusHeader text={t("import.status")} tip={t("import.tip")} />
      <Text style={styles.lead}>{t("import.lead")}</Text>
      <View style={{ gap: 8 }}>
        <View style={styles.sourceRow}><Text style={styles.tlIcon}>🗒</Text><View style={{ flex: 1 }}><Text style={styles.sourceName}>Notion</Text><Text style={styles.sourceDesc}>{t("import.notionDesc")}</Text></View><Text style={styles.sourceCta}>{t("import.connect")}</Text></View>
        <View style={styles.sourceRow}><Text style={styles.tlIcon}>🔮</Text><View style={{ flex: 1 }}><Text style={styles.sourceName}>Obsidian</Text><Text style={styles.sourceDesc}>{t("import.obsidianDesc")}</Text></View><Text style={styles.sourceCta}>{t("import.connect")}</Text></View>
        <View style={[styles.sourceRow, styles.sourceRowDim]}><Text style={styles.tlIcon}>❤</Text><View style={{ flex: 1 }}><Text style={styles.sourceNameDim}>{t("import.healthName")}</Text><Text style={styles.sourceDesc}>{t("import.healthDesc")}</Text></View><Text style={styles.sourceSoon}>{t("import.soon")}</Text></View>
      </View>
      <Card>
        <Text style={styles.reviewLabel}>{t("import.reviewLabel")}</Text>
        <View style={styles.mapRow}><Text style={styles.mapFrom}>{t("import.mapFrom1")}</Text><Text style={styles.mapArrow}>→</Text><Text style={styles.mapTo}>{t("import.mapTo1")}</Text></View>
        <View style={styles.mapRow}><Text style={styles.mapFrom}>{t("import.mapFrom2")}</Text><Text style={styles.mapArrow}>→</Text><Text style={styles.mapTo}>{t("import.mapTo2")}</Text></View>
        <View style={styles.mapRow}><Text style={styles.mapFrom}>{t("import.mapFrom3")}</Text><Text style={styles.mapArrow}>→</Text><Text style={styles.mapTo}>{t("import.mapTo3")}</Text></View>
        <Text style={styles.footerLeft}>{t("import.footer", { count: 42 })}</Text>
      </Card>
      <View style={styles.ctaRow}>
        <Pressable style={styles.secondary}><Text style={styles.secondaryText}>{t("import.cancel")}</Text></Pressable>
        <Pressable style={[styles.primary, styles.primaryWide]}><Text style={styles.primaryText}>{t("import.importCount", { count: 42 })}</Text></Pressable>
      </View>
    </Shell>
  );
}

interface DetailRecord {
  id: string;
  kind: string;
  body: string | null;
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
          <Text style={styles.wikiBody}>{t("recordDetail.notFound")}</Text>
          <Pressable style={styles.primary} onPress={() => router.replace("/records")}>
            <Text style={styles.primaryText}>{t("recordDetail.toArchive")}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  const related = relatedByTag(record.id, record.tags, all);
  const kindKey = RECORD_KIND_KEY[record.kind];
  const kindLabel = kindKey ? t(kindKey) : t("recordDetail.kindFallback");
  const kindIcon = RECORD_KIND_ICON[record.kind] ?? "•";
  const recencyOpts = { labels: dsRecencyLabels(t) };

  return (
    <Shell title={t("recordDetail.title")}>
      <SecondbStatusHeader
        text={related.length > 0 ? t("recordDetail.headerLinked", { count: related.length }) : t("recordDetail.headerAlone")}
        tip={t("recordDetail.tip")}
      />
      <View style={styles.recMetaRow}>
        <Text style={styles.recMetaType}>{kindIcon} {kindLabel}</Text>
        <Text style={styles.recMetaDot}>·</Text>
        <Text style={styles.recMeta}>{recencyLabel(record.created_at, recencyOpts) || t("recordDetail.kindFallback")}</Text>
        <Text style={styles.recMetaDot}>·</Text>
        <Text style={styles.recMeta}>{t("recordDetail.author")}</Text>
      </View>
      <Text style={styles.recTitle}>{recordTitle(record, t("recordDetail.kindFallback"))}</Text>
      {record.body && record.body.trim().length > 0 ? (
        <View style={styles.recBody}>
          <Text style={styles.recBodyText}>{record.body}</Text>
        </View>
      ) : null}
      {record.tags && record.tags.length > 0 ? (
        <View style={styles.filterRow}>
          {record.tags.slice(0, 5).map((tag) => (
            <FilterChip key={tag} label={`#${tag}`} active />
          ))}
        </View>
      ) : null}
      {record.conclusion && record.conclusion.trim().length > 0 ? (
        <View style={styles.insightViolet}>
          <Text style={styles.insightVioletText}>{record.conclusion}</Text>
        </View>
      ) : null}
      {related.length > 0 ? (
        <>
          <Text style={styles.tlLabel}>{t("recordDetail.linkedRecords")}</Text>
          <View style={styles.tlGroup}>
            {related.map((r) => (
              <TimelineRow
                key={r.id}
                icon={RECORD_KIND_ICON[r.kind] ?? "•"}
                title={recordTitle(r as DetailRecord, t("recordDetail.kindFallback"))}
                time={recencyLabel(r.created_at, recencyOpts) || undefined}
                dim
              />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.ctaRow}>
        <Pressable style={styles.secondary} onPress={() => router.push("/capture")}>
          <Text style={styles.secondaryText}>{t("recordDetail.newRecord")}</Text>
        </Pressable>
        <Pressable
          style={[styles.iconBtn, styles.iconBtnDanger]}
          onPress={() => void handleDelete()}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel={t("recordDetail.a11yDelete")}
        >
          <Text style={styles.iconBtnText}>🗑</Text>
        </Pressable>
      </View>
    </Shell>
  );
}

// Calendar hand-off needs a start time even for untimed ideas; "tomorrow 9am"
// is an honest, editable default (the calendar app shows the form before save).
function opsNextMorningIso(now: Date = new Date()): string {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
}

type OpsRunState = "idle" | "working" | "empty" | "error" | "limit" | "off";

export function DeepSpaceOpsScreen() {
  const { t, i18n } = useTranslation("ops");
  const { userId, loading: authLoading, isMinor, hasProfile } = useAuth();
  const progression = useProgression();
  const locale = systemLocaleFor(i18n.language);
  // The model anchors on the EN canonical domain label regardless of UI language.
  const tEn = useMemo(() => i18n.getFixedT("en", "ops"), [i18n]);

  const [group, setGroup] = useState<OpsGroupId | null>(null);
  const [domain, setDomain] = useState<OpsDomainId | null>(null);
  const [recs, setRecs] = useState<OpsRecommendation[]>([]);
  const [runState, setRunState] = useState<OpsRunState>("idle");
  const [usedToday, setUsedToday] = useState(0);
  const [recommendations, setRecommendations] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchPrivacyPrefs(userId).then((v) => {
      if (!cancelled) setRecommendations(v?.recommendations ?? false);
    });
    void readOpsUsage(userId).then((c) => {
      if (!cancelled) setUsedToday(c);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (authLoading) {
    return <Shell title="루틴"><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const dailyLimit = OPS_DAILY_LIMIT[progression.tier];
  const limitReached = usedToday >= dailyLimit;
  const domains = group ? domainsForGroup(group) : [];

  async function runRecommend() {
    if (!userId || !domain || runState === "working") return;
    // D-20 / PROTOCOL §36: honor the minor recommendations lock at the gate
    // (mirrors OpsLegacy). Adults are unaffected; a server-locked minor never
    // reaches the LLM snapshot.
    if (!recommendationsAllowed(isMinor, recommendations)) {
      setRunState("off");
      return;
    }
    if (limitReached) {
      setRunState("limit");
      return;
    }
    setRunState("working");
    setRecs([]);
    try {
      const out = await recommendForDomain({
        userId,
        locale,
        domainId: domain,
        domainLabel: tEn(`domains.${domain}`),
        minor: isMinor === true,
      });
      const used = await bumpOpsUsage(userId);
      setUsedToday(used);
      setRecs(out);
      setRunState(out.length === 0 ? "empty" : "idle");
    } catch {
      setRunState("error");
    }
  }

  function addToCalendar(rec: OpsRecommendation) {
    const url = buildGoogleCalendarUrl({
      title: rec.title,
      description: rec.reason,
      startsAtIso: rec.startsAtIso ?? opsNextMorningIso(),
      durationMinutes: rec.durationMinutes,
      recurrence: rec.recurrence,
    });
    if (url) void Linking.openURL(url).catch(() => {});
  }

  function shareStep(rec: OpsRecommendation) {
    void Share.share({ message: `${rec.title}\n${rec.reason}` }).catch(() => {});
  }

  return (
    <Shell title="루틴">
      <SecondbStatusHeader text="오늘은 어떤 영역을 챙겨볼까요?" tip="받은 걸음은 캘린더로 보낼 수 있어요." />
      <Text style={styles.lead}>내 기록에서 뽑은 다음 한 걸음</Text>
      <View style={styles.filterRow}>
        {OPS_GROUP_IDS.map((id) => (
          <FilterChip
            key={id}
            label={t(`groups.${id}`)}
            active={group === id}
            onPress={() => {
              setGroup(id);
              setDomain(null);
              setRecs([]);
              setRunState("idle");
            }}
          />
        ))}
      </View>
      {group ? (
        <View style={styles.filterRow}>
          {domains.map((id) => (
            <FilterChip key={id} label={t(`domains.${id}`)} active={domain === id} violet onPress={() => setDomain(id)} />
          ))}
        </View>
      ) : null}
      {domain ? (
        <Pressable
          style={[styles.primary, (runState === "working" || limitReached) && { opacity: 0.6 }]}
          disabled={runState === "working" || limitReached}
          onPress={() => void runRecommend()}
          accessibilityRole="button"
          accessibilityState={{ disabled: runState === "working" || limitReached, busy: runState === "working" }}
        >
          <Text style={styles.primaryText}>{runState === "working" ? t("recommend.working") : t("recommend.cta")}</Text>
        </Pressable>
      ) : null}
      {runState === "limit" || (domain && limitReached) ? <Text style={styles.opsReason}>{t("recommend.limit")}</Text> : null}
      {runState === "empty" ? <Text style={styles.opsReason}>{t("recommend.empty")}</Text> : null}
      {runState === "error" ? <Text style={styles.opsReason}>{t("recommend.error")}</Text> : null}
      {runState === "off" ? <Text style={styles.opsReason}>{t("recommend.off")}</Text> : null}
      {recs.map((rec, i) => (
        <View key={`${i}-${rec.title}`} style={styles.opsStep}>
          <View style={styles.opsStepHead}>
            <Text style={styles.opsStepTitle}>{rec.title}</Text>
            {rec.recurrence ? (
              <Text style={styles.timeChipMint}>{rec.recurrence === "daily" ? t("card.daily") : t("card.weekly")}</Text>
            ) : null}
          </View>
          <Text style={styles.opsReason}>{rec.reason}</Text>
          <View style={styles.opsStepFoot}>
            <Pressable style={styles.smallBtnGhost} onPress={() => shareStep(rec)} accessibilityRole="button" accessibilityLabel="이 걸음 공유">
              <Text style={styles.smallBtnGhostText}>공유</Text>
            </Pressable>
            <Pressable style={styles.smallBtn} onPress={() => addToCalendar(rec)} accessibilityRole="button" accessibilityLabel="캘린더에 추가">
              <Text style={styles.smallBtnText}>캘린더에 추가</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {recs.length > 0 ? <Text style={styles.footerLeft}>{t("recommend.disclaimerBody")}</Text> : null}
    </Shell>
  );
}

export function DeepSpaceWikiScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const view = useMemo(() => buildDeepWikiView(pages, edges, { activeTag }), [pages, edges, activeTag]);

  if (authLoading) {
    return <Shell title={t("wiki.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const headerText =
    view.pageCount > 0 ? t("wiki.headerGrowing", { count: view.pageCount }) : t("wiki.headerEmpty");
  const [first, ...rest] = view.pages;

  return (
    <Shell title={t("wiki.title")}>
      <SecondbStatusHeader text={headerText} tip={t("wiki.tip")} mood="positive" />
      <View style={styles.wikiStatRow}>
        <View style={styles.wikiStat}><Text style={styles.wikiStatNum}>{view.pageCount}</Text><Text style={styles.wikiStatCap}>{t("wiki.statPages")}</Text></View>
        <View style={styles.wikiStat}><Text style={[styles.wikiStatNum, styles.wikiStatNumCyan]}>{view.edgeCount}</Text><Text style={styles.wikiStatCap}>{t("wiki.statLinks")}</Text></View>
      </View>
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
      ) : view.pages.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>{activeTag !== null ? t("wiki.emptyTag") : t("wiki.emptyAll")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {first ? (
            <View style={styles.wikiPageOpen}>
              <View style={styles.wikiPageHead}>
                <Text style={styles.wikiPageTitle}>{first.title}</Text>
                <Text style={styles.wikiCaret}>⌄</Text>
              </View>
              {first.snippet.length > 0 ? (
                <Text style={styles.wikiBody}>{first.snippet}</Text>
              ) : null}
              <View style={styles.wikiBacklinkRow}>
                <Text style={styles.wikiBacklink}>↩ {t("wiki.backlinks", { count: first.connections })}</Text>
                {first.tags[0] ? <Text style={styles.tlTag}>{first.tags[0]}</Text> : null}
              </View>
            </View>
          ) : null}
          {rest.map((p) => (
            <View key={p.id} style={styles.wikiPageRow}>
              <View style={styles.wikiRowHead}>
                <Text style={styles.wikiRowTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={styles.wikiRowConn}>{t("wiki.connections", { count: p.connections })}</Text>
              </View>
              {p.snippet.length > 0 ? (
                <Text style={styles.wikiRowDesc} numberOfLines={1}>{p.snippet}</Text>
              ) : null}
            </View>
          ))}
        </>
      )}
    </Shell>
  );
}

export function DeepSpaceDomainsScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const view = useMemo(() => buildDomainsView(pages, edges), [pages, edges]);

  if (authLoading) {
    return <Shell title={t("domains.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const recencyOpts = { labels: dsRecencyLabels(t) };
  return (
    <Shell title={t("domains.title")}>
      <SecondbStatusHeader
        text={view.domains.length > 0 ? t("domains.headerHas") : t("domains.headerEmpty")}
        tip={t("domains.tip")}
      />
      <Text style={styles.lead}>{t("domains.lead")}</Text>
      {loading ? (
        <GraphLoading />
      ) : view.domains.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>{t("domains.empty")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("domains.addData")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.formatGrid}>
            {view.domains.map((d, i) => {
              const active = i === 0;
              return (
                <View
                  key={d.tag}
                  style={[styles.domainCard, active && styles.domainCardActive, !d.recent && styles.domainCardDim]}
                >
                  <Text style={d.recent ? styles.domainName : styles.domainNameDim} numberOfLines={1}>{d.tag}</Text>
                  <View style={styles.domainNumRow}>
                    <Text style={[styles.domainNum, active && styles.domainNumActive, !d.recent && styles.domainNumDim]}>{d.count}</Text>
                    <Text style={styles.domainUnit}>{t("domains.unit")}</Text>
                  </View>
                  <Text style={styles.domainSub}>{recencyLabel(d.lastActivity, recencyOpts) || t("domains.noActivity")}</Text>
                </View>
              );
            })}
          </View>
          {view.topTopics !== null && view.topTopics.titles.length > 0 ? (
            <>
              <Text style={styles.tlLabel}>{t("domains.topicsLabel", { tag: view.topTopics.tag })}</Text>
              <View style={styles.topicCol}>
                {view.topTopics.titles.map((title, i) => (
                  <View key={title} style={styles.topicRow}>
                    <View style={[styles.topicDot, i > 0 && styles.topicDotDim]} />
                    <Text style={i > 0 ? styles.topicTextDim : styles.topicText} numberOfLines={1}>{title}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("domains.addData")}</Text>
          </Pressable>
        </>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:colors.bgDeep}, stars:{...StyleSheet.absoluteFill,overflow:'hidden'}, star:{position:'absolute',width:3,height:3,borderRadius:2,backgroundColor:colors.cyanSoft}, scroll:{padding:spacing.lg,paddingBottom:40,gap:spacing.md}, titleRow:{flexDirection:'row',alignItems:'center',gap:spacing.md,marginBottom:spacing.xs}, back:{color:colors.cyanSoft,fontSize:34,lineHeight:38,fontFamily:fontFamilies.pixelKo}, title:{color:colors.textTitle,fontSize:18,lineHeight:24,fontFamily:fontFamilies.pixelKo}, subtitle:{color:colors.textLo,fontSize:11,lineHeight:17,fontFamily:fontFamilies.readable}, card:{backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm}, graphCard:{height:332,overflow:'hidden'}, centerCaption:{position:'absolute',left:0,right:0,top:156,textAlign:'center',color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:11}, clusterLabel:{position:'absolute',color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:11}, ctaRow:{flexDirection:'row',gap:spacing.sm}, primary:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.cyan,borderRadius:radius.md,paddingVertical:spacing.md}, primaryText:{color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:13}, secondary:{flex:1,alignItems:'center',justifyContent:'center',borderColor:colors.borderHi,borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.md}, secondaryText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13}, section:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13,marginBottom:spacing.xs}, action:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:colors.border,paddingVertical:spacing.sm}, actionLabel:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:14}, actionValue:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:12}, chev:{color:colors.cyanSoft,fontSize:22}, toggle:{width:42,height:24,borderRadius:12,backgroundColor:colors.border,justifyContent:'center',padding:3}, toggleOn:{backgroundColor:colors.cyan}, knob:{width:18,height:18,borderRadius:9,backgroundColor:colors.textLo}, knobOn:{alignSelf:'flex-end',backgroundColor:colors.bgDeep}, footer:{color:colors.textLo,textAlign:'center',fontFamily:fontFamilies.readable,fontSize:12,lineHeight:18}, center:{alignItems:'center',gap:spacing.sm}, prompt:{color:colors.textHi,fontFamily:fontFamilies.pixelKo,fontSize:16,lineHeight:24,textAlign:'center'}, avatar:{width:92,height:92,borderRadius:46,borderWidth:1,borderColor:colors.borderHi,alignItems:'center',justifyContent:'center',backgroundColor:colors.cardBg}, danger:{alignSelf:'center',padding:spacing.md},dangerText:{color:colors.clay,fontFamily:fontFamilies.readable,fontSize:13}, lead:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:14,lineHeight:21,textAlign:'center'}, authHero:{alignItems:'center',paddingTop:32,gap:spacing.md}, big:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:24,lineHeight:32}, input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,color:colors.textHi,fontFamily:fontFamilies.readable,backgroundColor:colors.bgDeep}, link:{color:colors.cyanSoft,textAlign:'center',fontFamily:fontFamilies.readable,paddingTop:spacing.sm}, mail:{fontSize:44,color:colors.cyanSoft}, codeRow:{flexDirection:'row',justifyContent:'center',gap:spacing.xs}, codeCell:{width:40,height:48,borderRadius:radius.sm,borderWidth:1,borderColor:colors.borderHi,backgroundColor:colors.cardBg}, pill:{borderWidth:1,borderColor:colors.border,borderRadius:radius.pill,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs},pillText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelEn,fontSize:8}, compareRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:spacing.lg,paddingVertical:spacing.sm}, compareCol:{alignItems:'center',gap:spacing.xs}, compareNum:{color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:30}, compareNumHi:{color:colors.cyan}, compareCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, delta:{color:colors.mint,textAlign:'center',fontFamily:fontFamilies.readable,fontSize:13}, statRow:{flexDirection:'row',gap:spacing.sm}, statBox:{flex:1,alignItems:'center',gap:spacing.xs,backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,paddingVertical:spacing.md}, statNum:{color:colors.cyan,fontFamily:fontFamilies.pixelKo,fontSize:28}, statCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, sizeRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm}, sizeCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:12}, sizeCapLg:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:18}, sizeTrack:{flex:1,height:4,borderRadius:2,backgroundColor:colors.border,justifyContent:'center'}, sizeKnob:{width:18,height:18,borderRadius:9,backgroundColor:colors.cyan,marginLeft:'46%'}, searchBox:{backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.md}, searchText:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:13}, planPro:{borderColor:colors.borderHi}, planHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, planName:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:15}, planBadge:{color:colors.bgDeep,backgroundColor:colors.cyan,fontFamily:fontFamilies.pixelEn,fontSize:8,paddingHorizontal:spacing.sm,paddingVertical:3,borderRadius:radius.sm,overflow:'hidden'}, planPrice:{color:colors.textHi,fontFamily:fontFamilies.pixelKo,fontSize:22,marginVertical:spacing.xs}, planPer:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:12}, planFeat:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:22}, planFeatDim:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:20}, trendHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, primaryWide:{flex:1.6}, filterRow:{flexDirection:'row',flexWrap:'wrap',gap:6}, fchip:{paddingVertical:6,paddingHorizontal:11,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, fchipActive:{borderColor:colors.cyan,backgroundColor:colors.cardBg}, fchipViolet:{borderColor:colors.soulLine,backgroundColor:colors.cardBg}, fchipText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:11}, fchipTextActive:{color:colors.textTitle}, fchipTextViolet:{color:colors.soul}, tlLabel:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:7,letterSpacing:0.7,marginTop:spacing.sm}, tlGroup:{paddingLeft:16,borderLeftWidth:1,borderLeftColor:colors.border,gap:12,marginTop:spacing.xs}, tlRow:{flexDirection:'row',alignItems:'center',gap:9}, tlDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.cyan}, tlDotDim:{backgroundColor:colors.cyanDim}, tlIcon:{fontSize:14}, tlTitle:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:12.5}, tlTitleDim:{color:colors.textMid}, tlTime:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:10}, tlTagRow:{flexDirection:'row',paddingLeft:32}, tlTag:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:5,letterSpacing:0.4,paddingHorizontal:6,paddingVertical:3,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, progressRow:{flexDirection:'row',alignItems:'center',gap:10}, progressTrack:{flex:1,height:6,borderRadius:3,backgroundColor:colors.border,overflow:'hidden'}, progressFill:{height:'100%',borderRadius:3,backgroundColor:colors.cyan}, progressLabel:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:11}, triageCard:{borderColor:colors.borderHi}, triageMeta:{flexDirection:'row',alignItems:'center',gap:9}, metaLabel:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:6,letterSpacing:0.5}, triageBody:{color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:13.5,lineHeight:21}, footerLeft:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11,lineHeight:16}, iconBtn:{width:46,paddingVertical:11,borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.md,alignItems:'center',backgroundColor:colors.bgDeep}, iconBtnText:{fontSize:15}, queueItem:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:9,paddingHorizontal:11,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm,backgroundColor:colors.cardBg}, queueItemDim:{opacity:0.6}, queueText:{flex:1,color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:12}, researchGraph:{height:118,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.bgDeep,overflow:'hidden',justifyContent:'center',alignItems:'center'}, graphTag:{position:'absolute',bottom:14,color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:10}, insightViolet:{borderWidth:1,borderColor:colors.soulLine,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, insightVioletText:{color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:20}, evRow:{flexDirection:'row',gap:6}, evChip:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:10,paddingHorizontal:8,paddingVertical:4,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, formatGrid:{flexDirection:'row',flexWrap:'wrap',gap:9}, formatCard:{width:'47%',padding:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,gap:4}, formatCardSel:{borderColor:colors.soulLine}, formatName:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13}, formatNameSel:{color:colors.soul}, formatDesc:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10.5,lineHeight:15}, soulPrimary:{alignItems:'center',justifyContent:'center',backgroundColor:colors.soul,borderRadius:radius.md,paddingVertical:spacing.md}, sourceRow:{flexDirection:'row',alignItems:'center',gap:11,paddingVertical:11,paddingHorizontal:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg}, sourceRowDim:{opacity:0.7}, sourceName:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13}, sourceNameDim:{color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:13}, sourceDesc:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10}, sourceCta:{color:colors.cyan,fontFamily:fontFamilies.pixelKo,fontSize:11}, sourceSoon:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:10}, reviewLabel:{color:colors.cyanBright,fontFamily:fontFamilies.pixelEn,fontSize:7,letterSpacing:0.7,marginBottom:spacing.xs}, mapRow:{flexDirection:'row',alignItems:'center',gap:8}, mapFrom:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:12}, mapArrow:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:12}, mapTo:{color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:12}, recMetaRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'}, recMetaType:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:11}, recMetaDot:{color:colors.textLo,fontSize:11}, recMeta:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, recTitle:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:17,lineHeight:24}, recBody:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,padding:spacing.md}, recBodyText:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:12.5,lineHeight:20}, iconBtnDanger:{borderColor:colors.clay}, opsStep:{borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, opsStepHead:{flexDirection:'row',alignItems:'flex-start',gap:spacing.sm}, opsStepTitle:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13.5,lineHeight:19}, timeChipMint:{color:colors.mint,fontFamily:fontFamilies.readable,fontSize:10,borderWidth:1,borderColor:colors.mint,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:3,overflow:'hidden'}, timeChipCyan:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:10,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:3,overflow:'hidden'}, opsReason:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:11.5,lineHeight:17}, opsStepFoot:{flexDirection:'row',alignItems:'center',gap:spacing.sm}, smallBtn:{marginLeft:'auto',backgroundColor:colors.cyan,borderRadius:radius.sm,paddingHorizontal:12,paddingVertical:7}, smallBtnText:{color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:11}, smallBtnGhost:{marginLeft:'auto',borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.sm,paddingHorizontal:12,paddingVertical:7}, smallBtnGhostText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:11}, wikiStatRow:{flexDirection:'row',gap:spacing.sm}, wikiStat:{flex:1,flexDirection:'row',alignItems:'baseline',gap:6,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,paddingHorizontal:13,paddingVertical:11}, wikiStatNum:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:20}, wikiStatNumCyan:{color:colors.cyan}, wikiStatCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10.5}, wikiPageOpen:{borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, wikiPageHead:{flexDirection:'row',alignItems:'center',gap:7}, wikiPageTitle:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13.5}, wikiCaret:{color:colors.cyanDim,fontSize:14}, wikiBody:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:11.5,lineHeight:18}, wikiBacklinkRow:{flexDirection:'row',gap:6,flexWrap:'wrap',alignItems:'center'}, wikiBacklink:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:9.5,borderWidth:1,borderColor:colors.soulLine,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:4,overflow:'hidden'}, wikiPageRow:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,paddingHorizontal:13,paddingVertical:11,gap:5}, wikiRowHead:{flexDirection:'row',alignItems:'center',gap:7}, wikiRowTitle:{flex:1,color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13}, wikiRowConn:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:9.5}, wikiRowDesc:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, domainCard:{width:'47%',padding:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,gap:8}, domainCardActive:{borderColor:colors.cyan}, domainCardDim:{borderStyle:'dashed',borderColor:colors.borderHi,opacity:0.65}, domainName:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:14}, domainNameDim:{color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:14}, domainNumRow:{flexDirection:'row',alignItems:'baseline',gap:5}, domainNum:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:22}, domainNumActive:{color:colors.cyan}, domainNumDim:{color:colors.textLo}, domainUnit:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10}, domainSub:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:9.5}, topicCol:{gap:8}, topicRow:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:10,paddingHorizontal:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg}, topicDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.cyan}, topicDotDim:{backgroundColor:colors.cyanDim}, topicText:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:12.5}, topicTextDim:{flex:1,color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:12.5}});
