import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Line, Path, SvgXml } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { colors, radius, spacing } from "@/theme/tokens";
import { ddsStyles as styles } from "./dds-styles";
import { canonGaps, canonMore } from "@/lib/canon";
import { kstDateToday } from "@/lib/chat/limits";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { MdButton, MdCard, MdChip, ProgressLinear, m3TextStyle } from "@/components/m3";
import { TIERS, TIER_PRICE_KRW } from "@/lib/entitlements/tiers";
import { remainingReasoning } from "@/lib/entitlements/reasoning-cap";
import { getReasoningUsage } from "@/lib/entitlements/usage";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme/ThemeContext";
import { useFontStyle } from "@/lib/settings/readable-font";
import { useLiteMode } from "@/lib/settings/lite-mode";
import { DeepSpaceLoader, SecondbHead, SecondbStatusHeader } from "@/components/deepspace";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { FilterChip } from "./dds-wiki-records-screens";
import { buildInfoLine } from "@/lib/build-info";
import { useAuth } from "@/lib/auth/AuthContext";
import { useSignInForm } from "@/lib/auth/useSignInForm";
import { useSignUpForm } from "@/lib/auth/useSignUpForm";
import { useResetPasswordForm } from "@/lib/auth/useResetPasswordForm";
import {
  ageInYears,
  MIN_SELF_CONSENT_AGE,
  signOut,
  type OAuthProvider,
} from "@/lib/supabase/auth";
import { deleteAllUserData, requestAccountDeletion } from "@/lib/records/delete-bulk";
import { buildPersona } from "@/lib/persona/build";
import { proposalContextForStar } from "@/lib/persona/proposal-context";
import { proposeSelfModelChange } from "@/lib/persona/propose-self-model";
import { applyRatify, type RatifyDecision, type SelfModelProposal } from "@/lib/persona/proposal";
import type { LadderLevel } from "@/lib/persona/brightness";
import { recordStarTiers } from "@/lib/persona/record-star-tiers";
import { loadEvidenceShards } from "@/lib/persona/load-evidence-shards";
import { type EvidenceShard } from "@/lib/persona/evidence";
import { RatifySheet } from "@/components/persona/RatifySheet";
import {
  allRequiredAcksChecked,
  setAllRequiredAcks,
  type ConsentSelections,
} from "@/lib/auth/consent-selections";
import { formatBirthDateInput } from "@/lib/account/dob";
import { useProgression } from "@/lib/progression/useProgression";
import {
  arePurchasesAvailable,
  configurePurchases,
  getOfferings,
  getProStatus,
  purchasePackage,
  restorePurchases,
} from "@/lib/payments/purchases";
import type { PurchasesPackage } from "react-native-purchases";
import { systemLocaleFor } from "@/lib/i18n/locales";
import { fetchPrivacyPrefs, savePrivacyPrefs } from "@/lib/supabase/privacy";
import { clearRecordEmbeddings } from "@/lib/records/records-embeddings";
import { recordHealthImportConsent, recordRecommendationsConsent } from "@/lib/supabase/consent";
import { healthImportAllowed, ingestHealthSamples } from "@/lib/health/ingest";
import { mockSamplesForRange } from "@/lib/health/sources/mock";
import { availableHealthSources } from "@/lib/health/registry";
import { OPS_GROUP_IDS, domainsForGroup, type OpsDomainId, type OpsGroupId } from "@/lib/ops/domains";
import { opsRouteForDomain } from "@/lib/ops/nav";
import { gatherAdherenceStats } from "@/lib/ops/signals";
import { adherenceChip } from "@/lib/ops/grounding";
import { recommendForDomain, recommendationsAllowed, type OpsRecommendation } from "@/lib/ops/recommend";
import { buildGoogleCalendarUrl } from "@/lib/ops/push";
import { notifyNow, scheduleRoutineReminder, type ReminderResult } from "@/lib/ops/reminders";
import {
  applyFocusSessionComplete,
  applyLanguageReviewComplete,
  createRoutineFromRecommendation,
  deriveReminder,
  listCompletionsSince,
  listTodayRoutines,
  localDayKey,
  logRoutineCompletion,
  weekStreak,
  type OpsRoutine,
} from "@/lib/ops/routines";
import { createCard, listDueCards, recordReview, type SrsCardRow } from "@/lib/srs/queries";
import type { SrsRating } from "@/lib/srs/scheduler";
import {
  createPomodoro,
  focusJustCompleted,
  pause,
  reset,
  start,
  tick,
  type PomodoroState,
} from "@/lib/ops/pomodoro";
import { OPS_DAILY_LIMIT, bumpOpsUsage, readOpsUsage } from "@/lib/ops/usage";
import {
  deleteSource,
  listAllWikiLinks,
  listInferredLinkDetails,
  listSources,
  listWikiPages,
  ratifyLink,
  rejectInferredLink,
  updateSourceTags,
  type InferredLinkDetail,
} from "@/lib/wiki/queries";
import { generateSourcePage } from "@/lib/wiki/phase2";
import { runPhase1 } from "@/lib/wiki/phase1";
import { suggestedTags } from "@/lib/wiki/suggest-tags";
import { exportUserWiki } from "@/lib/wiki/export";
import { backfillEmbeddings, proposeAllRelatedLinks } from "@/lib/wiki/embeddings";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { pickImportFiles } from "@/lib/wiki/capture-file";
import { splitImportNotes, previewTitle } from "@/lib/wiki/import-notes";
import { exportIden } from "@/lib/iden/iden-export";
import { buildIdenDoc } from "@/lib/iden/build-iden";
import { listRecentRecords } from "@/lib/records/create";
import { summarizeWeeklyInsights, weeklyDomainFocus } from "@/lib/insights/weekly";
import type { SourceRow, WikiPageRow } from "@/lib/wiki/types";
import {
  buildDeepResearchView,
  buildDomainsView,
  recencyLabel,
  type RecencyLabels,
  type WikiEdge,
} from "./wiki-graph-view";
import {
  type TimelineLabels,
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

// TODO(loading): the standalone ActivityIndicator blocks below (inline loaders
// inside individual sub-screens) can also move to DeepSpaceLoader variant "dots".
// Swapped here once on the shared GraphLoading helper, which covers the bulk of
// deep-space loading states with no layout regression.
function GraphLoading() {
  return (
    <View style={styles.center}>
      <DeepSpaceLoader variant="dots" />
    </View>
  );
}

// rev2 windowed stack shell: the M3 top app bar carries the title and the
// screen floats as a radius-24 window over the shared sky (sb-app §4). Routes
// moving from Shell to DockShell must also join DEEP_SPACE_DOCK_PATHS so the
// floating BackArrow chip yields to the top bar.
function DockShell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title ?? ""} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {subtitle ? <Text variant="subtle" style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

function Shell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.stars}><View style={[styles.star,{left:"12%",top:42}]} /><View style={[styles.star,{right:"18%",top:118,opacity:.55}]} /><View style={[styles.star,{left:"42%",bottom:92,opacity:.5}]} /></View>
      {/* Shell has no dock/SafeAreaView, so it must reserve BOTH insets: the top
          was handled but the Android bottom nav-bar inset was omitted, clipping
          bottom-anchored CTAs under the 3-button nav on edge-to-edge. */}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 52, paddingBottom: 40 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {title ? <View style={styles.titleRow}><View><Text variant="heading" style={styles.title}>{title}</Text>{subtitle ? <Text variant="subtle" style={styles.subtitle}>{subtitle}</Text> : null}</View></View> : null}
        {children}
      </ScrollView>
    </View>
  );
}

// Scroll-only body for screens that already sit inside DeepSpaceScreen (which
// supplies the star-field background, SecondbStatusHeader, and the dock). Same
// ScrollView + back/title row as Shell but WITHOUT the root background, so the
// chrome is not doubled. Flexes to fill DeepSpaceScreen's body slot.
function DockBody({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {title ? <View style={styles.titleRow}><View><Text variant="heading" style={styles.title}>{title}</Text>{subtitle ? <Text variant="subtle" style={styles.subtitle}>{subtitle}</Text> : null}</View></View> : null}
      {children}
    </ScrollView>
  );
}

function Card({ children, style }: { children: ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }
function Action({ label, value, onPress }: Row) {
  return (
    // label carries the value too (an explicit label replaces flattened children
    // for screen readers, #891), and the decorative chevron is hidden from a11y.
    <Pressable onPress={onPress} style={styles.action} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label}>
      <Text variant="body" style={styles.actionLabel}>{label}</Text>
      {value ? (
        <Text variant="body" style={styles.actionValue}>{value}</Text>
      ) : (
        <RNText style={styles.chev} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">›</RNText>
      )}
    </Pressable>
  );
}
function Toggle({ label, value, on = true, onPress }: Row) {
  const body = (
    <>
      <View><Text variant="body" style={styles.actionLabel}>{label}</Text>{value ? <Text variant="body" style={styles.actionValue}>{value}</Text> : null}</View>
      <View style={[styles.toggle,on&&styles.toggleOn]}><View style={[styles.knob,on&&styles.knobOn]} /></View>
    </>
  );
  if (onPress) {
    return <Pressable style={styles.action} onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label}>{body}</Pressable>;
  }
  return <View style={styles.action}>{body}</View>;
}

export function DeepSpaceGraphDesignScreen() {
  const { t } = useTranslation("deepspace");
  // Real graph scale (node = wiki page, edge = wiki link) from the same hook
  // /research and /wiki use. The CONSTELLATION node POSITIONS below stay mock
  // (no real coordinates exist yet); only the subtitle count numbers are real.
  const { pages, edges, loading } = useWikiGraphData();
  const nodeCount = loading ? 0 : pages.length;
  const edgeCount = loading ? 0 : edges.length;
  const clusters = [
    { x: 63, y: 135, t: t("graph.clRecords"), route: "/records" as const }, { x: 136, y: 92, t: t("graph.clRelations"), route: "/research" as const }, { x: 219, y: 134, t: t("graph.clKnowledge"), route: "/wiki" as const }, { x: 106, y: 226, t: t("graph.clTaste"), route: "/trinity" as const }, { x: 207, y: 225, t: t("graph.clGrowth"), route: "/growth" as const },
  ];
  return <Shell title={t("graph.title")} subtitle={t("graph.subtitle", { nodes: nodeCount, edges: edgeCount })}><SecondbStatusHeader text={t("graph.status")} tip={t("graph.tip")} /><Card style={styles.graphCard}><View style={styles.graphStage}><Svg width={300} height={310} viewBox="0 0 300 310"><Circle cx={150} cy={160} r={34} fill={colors.soul} opacity={.95} onPress={() => router.push('/account')}/>{clusters.map((c,i)=><Line key={'l'+i} x1={150} y1={160} x2={c.x} y2={c.y} stroke={colors.borderHi} strokeWidth={1.4}/>) }{clusters.map((c,i)=><Circle key={'c'+i} cx={c.x} cy={c.y} r={22} fill={colors.cyan} opacity={.22} onPress={() => router.push(c.route)}/>) }<Circle cx={150} cy={160} r={9} fill={colors.textHi} onPress={() => router.push('/account')}/>{[42,86,118,244,257,188,72].map((x,i)=><Circle key={i} cx={x} cy={70+i*30%190} r={4} fill={colors.cyanSoft} opacity={.75}/>)}</Svg><Text variant="caption" style={styles.centerCaption}>{t("graph.me")}</Text>{clusters.map((c)=><Pressable key={c.t} onPress={() => router.push(c.route)} accessibilityRole="button" accessibilityLabel={c.t} style={{position:'absolute',left:c.x-18,top:c.y+23}}><Text variant="body" style={[styles.clusterLabel,{position:'relative'}]}>{c.t}</Text></Pressable>)}</View></Card><View style={styles.ctaRow}><Pressable style={styles.primary} onPress={() => router.push('/records')}><Text variant="caption" style={styles.primaryText}>{t("graph.viewClusters")}</Text></Pressable><Pressable style={styles.secondary} onPress={() => router.push('/research')}><Text variant="caption" style={styles.secondaryText}>{t("graph.findConnections")}</Text></Pressable></View></Shell>;
}

// rev2 clone (28-connect / reference ConnectScreen): a windowed 데이터 연동 list.
// Real per-source OAuth is not built yet, so "연결" hands off to the working
// file-import flow (/import-hub); a connected source toggles back off (no dead
// switch). No provider is seeded as 연결됨 — every row starts disconnected until
// a real connection exists, so the screen never claims a link that isn't there.
export function DeepSpaceIntegrationsScreen() {
  const { t } = useTranslation("deepspace");
  const [conn, setConn] = useState<Record<string, boolean>>({ cal: false, health: false, notion: false, photos: false, gpt: false });
  const sources: { id: string; icon: keyof typeof CLONE_ICON; k: string; sub: string }[] = [
    { id: "cal", icon: "forum", k: t("connect.sources.cal.name"), sub: t("connect.sources.cal.sub") },
    { id: "health", icon: "bedtime", k: t("connect.sources.health.name"), sub: t("connect.sources.health.sub") },
    { id: "notion", icon: "book", k: "Notion", sub: t("connect.sources.notion.sub") },
    { id: "photos", icon: "camera", k: t("connect.sources.photos.name"), sub: t("connect.sources.photos.sub") },
    { id: "gpt", icon: "bubble", k: t("connect.sources.gpt.name"), sub: t("connect.sources.gpt.sub") },
  ];
  const toggle = (id: string) => {
    if (conn[id]) { setConn((s) => ({ ...s, [id]: false })); return; }
    setConn((s) => ({ ...s, [id]: true }));
    router.push("/import-hub");
  };
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={t("connect.title")} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={cx.body} keyboardShouldPersistTaps="handled">
        <RNText style={[m3TextStyle("headlineSmall"), { color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 8 }]}>{t("connect.title")}</RNText>
        <RNText style={[m3TextStyle("bodyMedium"), cx.lead]}>{t("connect.lead")}</RNText>
        <MdCard variant="filled" style={cx.consentCard}>
          <View style={cx.consentRow}>
            <CloneIcon name="lock" color={m3.color.onSecondaryContainer} size={20} />
            <RNText style={[m3TextStyle("bodySmall"), cx.consentText]}>{t("connect.consent")}</RNText>
          </View>
        </MdCard>
        <View style={cx.stack8}>
          {sources.map((s) => {
            const on = conn[s.id];
            return (
              <MdCard key={s.id} variant="outlined" style={cx.sourceCard}>
                <View style={cx.sourceRow}>
                  <View style={[cx.iconBox, on ? cx.iconBoxOn : cx.iconBoxOff]}>
                    <CloneIcon name={s.icon} color={on ? m3.color.onPrimary : m3.color.onSurfaceVariant} size={22} />
                  </View>
                  <View style={cx.flex1}>
                    <RNText style={[m3TextStyle("titleSmall"), cx.sourceName]}>{s.k}</RNText>
                    <RNText style={[m3TextStyle("bodySmall"), cx.sourceSub]}>{s.sub}</RNText>
                  </View>
                  <MdButton
                    label={on ? t("connect.connected") : t("connect.connect")}
                    variant={on ? "tonal" : "filled"}
                    icon={on ? <CloneIcon name="check" color={m3.color.onSecondaryContainer} size={16} /> : undefined}
                    onPress={() => toggle(s.id)}
                    style={cx.connectBtn}
                    accessibilityLabel={t("connect.a11yStatus", { name: s.k, status: on ? t("connect.a11yConnected") : t("connect.a11yConnect") })}
                  />
                </View>
              </MdCard>
            );
          })}
        </View>
      </ScrollView>
    </DeepSpaceScreen>
  );
}

// ── gaps.json canon content (support / privacy / manual) ──────────────────
// KO copy renders straight from canonGaps (pixel contract, verbatim). EN mirrors
// are index-aligned against the SAME canon arrays (museum/iden bilingual pattern),
// so no new locale keys are added (avoids 5-locale key-parity churn).
const GAPS_FAQ_EN: { q: string; a: string }[] = [
  { q: "What's the difference between brightness (starlight) and confidence?", a: "Starlight is how much you've captured in that area; confidence is how well SecondB's estimate has been verified. The two move independently." },
  { q: "Does a paid plan make it smarter?", a: "No. Answer quality is the same on every plan. Only the limits on counts, retention, and export differ." },
  { q: "Is call recording safe?", a: "Recordings are transcribed on your device and deleted right away. Only the text and signals are kept, encrypted." },
];
const GAPS_NOTICE_EN: { t: string; tag: string }[] = [
  { t: "SecondB three modes launched", tag: "New" },
  { t: "AI Museum: 8 collections now open", tag: "Content" },
  { t: "On-device speech-to-text improved", tag: "Improved" },
];
const GAPS_FACT_EN: { label: string; v: string }[] = [
  { label: "On-device first", v: "Raw content is analyzed on your device; only derived signals are kept, encrypted." },
  { label: "What we collect", v: "Captured stardust, lens scores, usage patterns. Location and comms only with consent." },
  { label: "Retention", v: "While your account is active; fully removed within 30 days of leaving." },
  { label: "Right to delete", v: "You can remove individual items or everything, anytime." },
];
const GAPS_CONCEPT_EN: { title: string; body: string }[] = [
  { title: "Star = an area of life", body: "The seven Big Dipper stars are career, finances, growth, relationships, health, rest, and capturing. Tap a star to see yourself in that area." },
  { title: "North Star = your whole self", body: "It gathers the seven stars into one sentence about who you are. The more evenly they brighten, the clearer it gets." },
  { title: "Starlight is not confidence", body: "Starlight is how much you've captured; confidence is how well it's verified. If it doesn't know, it says so." },
  { title: "Ratify (propose then ratify)", body: "SecondB's estimates are only proposals. Only what you ratify with \"that's right\" is reflected in you." },
  { title: "Capturing", body: "Capture notes, links, photos, voice, and to-dos instead of letting them slip by. SecondB helps sort them." },
  { title: "SecondB three modes", body: "SecondB (knows you), MetaB (objective), TwB (creative). Switch between them as the moment needs." },
];

// Map a canon Material-symbol icon name to a local CLONE_ICON glyph, falling
// back to a sensible sparkle when a name has no glyph yet.
function gapGlyph(name: string): keyof typeof CLONE_ICON {
  return (name in CLONE_ICON ? name : "sparkle") as keyof typeof CLONE_ICON;
}

// Token-only styles for the gaps-pack sections (FAQ / notices / facts / concepts).
const gap = StyleSheet.create({
  flex1: { flex: 1 },
  row: { paddingVertical: spacing.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  qRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  answer: { marginTop: spacing.xs },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  tag: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagText: { color: colors.cyanSoft, fontSize: 11 },
  factRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", paddingVertical: spacing.sm },
  factText: { flex: 1, gap: 2 },
  conceptRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  conceptText: { flex: 1, gap: 3 },
});

export function DeepSpaceSupportDesignScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  return (
    <Shell title={t("support.title")}>
      <View style={styles.center}><SecondbHead size={104} mood="neutral" /><Text variant="heading" style={styles.prompt}>{t("support.prompt")}</Text></View>
      <Card>{[{label:t("support.askSecondb"),onPress:()=>router.push('/secondb')},{label:t("support.viewManual"),onPress:()=>router.push('/manual')},{label:t("support.emailUs"),onPress:()=>Linking.openURL('mailto:support@2nd-brain.app')},{label:t("support.reportBug"),onPress:()=>Linking.openURL('mailto:support@2nd-brain.app?subject=Bug%20report')}].map((r)=><Action key={r.label} {...r}/>)}</Card>

      {/* FAQ (canonGaps.faqs) — tap a question to reveal its answer. */}
      <Card>
        <Text variant="caption" style={styles.section}>{t("support.faqTitle")}</Text>
        {canonGaps.faqs.map((f, i) => {
          const q = ko ? f.q : GAPS_FAQ_EN[i]?.q ?? f.q;
          const a = ko ? f.a : GAPS_FAQ_EN[i]?.a ?? f.a;
          const open = openFaq === i;
          return (
            <View key={f.q} style={[gap.row, i < canonGaps.faqs.length - 1 && gap.rowDivider]}>
              <Pressable
                onPress={() => setOpenFaq(open ? null : i)}
                style={gap.qRow}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={q}
              >
                <Text variant="body" style={[styles.actionLabel, gap.flex1]}>{q}</Text>
                <RNText style={styles.chev}>{open ? "⌄" : "›"}</RNText>
              </Pressable>
              {open ? <Text variant="body" style={[styles.planFeatDim, gap.answer]}>{a}</Text> : null}
            </View>
          );
        })}
      </Card>

      {/* 공지사항 / Notices (canonGaps.notices) — tag + title + date. */}
      <Card>
        <Text variant="caption" style={styles.section}>{t("support.noticesTitle")}</Text>
        {canonGaps.notices.map((n, i) => {
          const title = ko ? n.t : GAPS_NOTICE_EN[i]?.t ?? n.t;
          const tag = ko ? n.tag : GAPS_NOTICE_EN[i]?.tag ?? n.tag;
          return (
            <View key={n.t} style={[gap.noticeRow, i < canonGaps.notices.length - 1 && gap.rowDivider]}>
              <View style={gap.tag}><Text variant="caption" style={gap.tagText}>{tag}</Text></View>
              <Text variant="body" style={[styles.actionLabel, gap.flex1]}>{title}</Text>
              <Text variant="subtle" style={styles.actionValue}>{n.d}</Text>
            </View>
          );
        })}
      </Card>

      <Text variant="subtle" style={styles.footer}>{t("support.footer")}</Text>
    </Shell>
  );
}

export function DeepSpaceAccountDesignScreen() {
  const { t } = useTranslation("deepspace");
  // The "나" hub (SCREEN_TREE_SPEC §8): four working nav rows. Was a static
  // mockup with hardcoded PII and dead rows; now every row routes.
  return (
    // Primary "나" hub: render inside the persistent deep-space chrome so the
    // bottom dock shows. DeepSpaceScreen supplies the star-field background +
    // SecondbStatusHeader (ds.head.account), so the screen's own header/root are
    // dropped to avoid double chrome.
    <DeepSpaceScreen active="account">
      <DockBody title={t("account.title")}>
        <View style={styles.center}>
          <View style={styles.avatar}><SecondbHead size={72} mood="neutral" /></View>
          <Text variant="heading" style={styles.prompt}>{t("account.title")}</Text>
        </View>
        <Card>
          <Action label={t("account.navProfile")} onPress={() => router.push("/profile")} />
          <Action label={t("account.navSettings")} onPress={() => router.push("/settings")} />
          <Action label={t("account.navData")} onPress={() => router.push("/data")} />
          <Action label="IDEN" onPress={() => router.push("/iden")} />
          <Action label={t("account.navBeyond")} onPress={() => router.push("/beyond")} />
        </Card>
        {/* Build/OTA identifier — lets a tester confirm which bundle is live
            (embedded vs OTA), the ambiguity that prolonged the 2026-06-26 crash. */}
        <Text variant="subtle" style={styles.footer}>{buildInfoLine()}</Text>
      </DockBody>
    </DeepSpaceScreen>
  );
}

export function DeepSpacePrivacyDesignScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const { userId, isMinor } = useAuth();
  const minor = isMinor === true;
  const [recOn, setRecOn] = useState<boolean | null>(null);
  const [understanding, setUnderstanding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recError, setRecError] = useState(false);
  const [embedOn, setEmbedOn] = useState<boolean | null>(null);
  const [embedUnderstanding, setEmbedUnderstanding] = useState(false);
  const [embedErr, setEmbedErr] = useState(false);
  // Right-to-erasure in deep-space (was legacy-only). Terminal + irreversible, so
  // it is gated behind a typed "DELETE" confirm and reuses the proven cascade.
  const [delConfirm, setDelConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState(false);

  async function runDeleteAccount() {
    if (!userId || deleting || delConfirm !== "DELETE") return;
    setDeleting(true);
    setDelError(false);
    try {
      await deleteAllUserData(userId);
      await requestAccountDeletion();
      await signOut();
      router.replace("/sign-in");
    } catch {
      // Some content may already be gone; tell the truth and let them retry.
      setDelError(true);
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchPrivacyPrefs(userId).then((p) => {
      if (!cancelled) {
        setRecOn(p.recommendations === true);
        setEmbedOn(p.records_embedding === true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // D-25 §11-5 follow-up: adult-only opt-in WITH an understanding step. Minors
  // are locked (the recommendations pref is non-promotable for them); adults must
  // read what recommendations do and explicitly confirm before it turns on, and
  // the opt-in is logged to the consent ledger with the LLM + overseas acks.
  async function enableRecommendations() {
    if (!userId || busy || minor) return;
    setBusy(true);
    setRecError(false);
    try {
      const prefs = { ...(await fetchPrivacyPrefs(userId)), recommendations: true };
      await savePrivacyPrefs(userId, prefs);
      await recordRecommendationsConsent({ userId, ageBand: "adult", minorTier: "adult", locale: ko ? "ko" : "en" });
      setRecOn(true);
      setUnderstanding(false);
    } catch {
      setRecError(true);
    } finally {
      setBusy(false);
    }
  }

  async function disableRecommendations() {
    if (!userId || busy) return;
    setBusy(true);
    setRecError(false);
    try {
      const prefs = { ...(await fetchPrivacyPrefs(userId)), recommendations: false };
      await savePrivacyPrefs(userId, prefs);
      setRecOn(false);
      setUnderstanding(false);
    } catch {
      setRecError(true);
    } finally {
      setBusy(false);
    }
  }

  // D5 (J1/J2): records semantic embedding — adult-only opt-in WITH an
  // understanding step (mirrors recommendations). Off deletes the stored vectors.
  async function enableEmbedding() {
    if (!userId || busy || minor) return;
    setBusy(true);
    setEmbedErr(false);
    try {
      const prefs = { ...(await fetchPrivacyPrefs(userId)), records_embedding: true };
      await savePrivacyPrefs(userId, prefs);
      setEmbedOn(true);
      setEmbedUnderstanding(false);
    } catch {
      setEmbedErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function disableEmbedding() {
    if (!userId || busy) return;
    setBusy(true);
    setEmbedErr(false);
    try {
      const prefs = { ...(await fetchPrivacyPrefs(userId)), records_embedding: false };
      await savePrivacyPrefs(userId, prefs);
      // Consent revoked → forget the index (honest "off deletes vectors").
      await clearRecordEmbeddings(userId);
      setEmbedOn(false);
      setEmbedUnderstanding(false);
    } catch {
      setEmbedErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={t("privacy.title")}>
      <SecondbStatusHeader text={t("privacy.status")} tip={t("privacy.tip")} />
      <Text variant="body" style={styles.lead}>{t("privacy.lead")}</Text>

      {/* 한눈에 / At a glance (canonGaps.privacyFacts) — icon + label + value. */}
      <Card>
        <Text variant="caption" style={styles.section}>{ko ? "한눈에" : "At a glance"}</Text>
        {canonGaps.privacyFacts.map((f, i) => {
          const label = ko ? f.label : GAPS_FACT_EN[i]?.label ?? f.label;
          const v = ko ? f.v : GAPS_FACT_EN[i]?.v ?? f.v;
          return (
            <View key={f.label} style={[gap.factRow, i < canonGaps.privacyFacts.length - 1 && gap.rowDivider]}>
              <CloneIcon name={gapGlyph(f.icon)} color={colors.cyanSoft} size={20} />
              <View style={gap.factText}>
                <Text variant="body" style={styles.actionLabel}>{label}</Text>
                <Text variant="body" style={styles.planFeatDim}>{v}</Text>
              </View>
            </View>
          );
        })}
      </Card>

      <Card>
        <Text variant="caption" style={styles.section}>{ko ? "맞춤 추천" : "Recommendations"}</Text>
        {minor ? (
          <Text variant="subtle" style={styles.footer}>
            {ko ? "맞춤 추천은 보호를 위해 꺼져 있고 켤 수 없어요." : "Recommendations are off and locked for your protection."}
          </Text>
        ) : recOn === null ? (
          <Text variant="subtle" style={styles.footer}>{ko ? "불러오는 중…" : "Loading…"}</Text>
        ) : recOn ? (
          <>
            <Text variant="body" style={styles.lead}>
              {ko ? "켜져 있어요. 기록을 분석해 연결을 제안합니다." : "On. Your records are analyzed to suggest connections."}
            </Text>
            <Pressable style={styles.secondary} onPress={() => void disableRecommendations()} disabled={busy} accessibilityRole="button" accessibilityLabel={ko ? "추천 끄기" : "Turn off recommendations"}>
              <Text variant="body" style={styles.secondaryText}>{ko ? "추천 끄기" : "Turn off"}</Text>
            </Pressable>
          </>
        ) : !understanding ? (
          <>
            <Text variant="body" style={styles.lead}>
              {ko ? "꺼져 있어요. 켜면 기록에서 연결·패턴을 제안받을 수 있어요." : "Off. Turn it on to get suggested connections from your records."}
            </Text>
            <Pressable style={styles.secondary} onPress={() => setUnderstanding(true)} disabled={busy} accessibilityRole="button" accessibilityLabel={ko ? "추천 켜기" : "Turn on recommendations"}>
              <Text variant="body" style={styles.secondaryText}>{ko ? "추천 켜기" : "Turn on"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text variant="body" style={styles.lead}>
              {ko
                ? "켜기 전에 알아두세요. 추천을 켜면 당신의 기록 묶음이 분석을 위해 Gemini로 전송돼요(해외에서 처리). 연결·패턴 제안에만 쓰이고 언제든 끌 수 있어요. 동의는 기록에 남습니다."
                : "Before you turn it on. Your records are sent to Gemini for analysis (processed overseas), used only to suggest connections and patterns. You can turn it off anytime. Your consent is logged."}
            </Text>
            <View style={styles.ctaRow}>
              <Pressable style={styles.secondary} onPress={() => setUnderstanding(false)} disabled={busy} accessibilityRole="button" accessibilityLabel={ko ? "취소" : "Cancel"}>
                <Text variant="body" style={styles.secondaryText}>{ko ? "취소" : "Cancel"}</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={() => void enableRecommendations()} disabled={busy} accessibilityRole="button" accessibilityLabel={ko ? "이해했고 켭니다" : "I understand, turn it on"}>
                <Text variant="body" style={styles.primaryText}>{ko ? "이해했고 켜기" : "I understand, turn on"}</Text>
              </Pressable>
            </View>
          </>
        )}
        {recError ? (
          <Text variant="subtle" style={styles.footer}>{ko ? "저장에 실패했어요. 잠시 후 다시 시도해 주세요." : "Couldn't save. Please try again."}</Text>
        ) : null}
      </Card>

      <Card>
        <Text variant="caption" style={styles.section}>{ko ? "기록 의미 연결" : "Semantic record connections"}</Text>
        {minor ? (
          <Text variant="subtle" style={styles.footer}>
            {ko ? "기록 의미 연결은 보호를 위해 꺼져 있고 켤 수 없어요." : "Semantic connections are off and locked for your protection."}
          </Text>
        ) : embedOn === null ? (
          <Text variant="subtle" style={styles.footer}>{ko ? "불러오는 중…" : "Loading…"}</Text>
        ) : embedOn ? (
          <>
            <Text variant="body" style={styles.lead}>
              {ko ? "켜져 있어요. 담는 기록을 의미로 색인해 비슷한 기록을 이어 보여줘요." : "On. New records are indexed by meaning to surface similar ones."}
            </Text>
            <Pressable style={styles.secondary} onPress={() => void disableEmbedding()} disabled={busy} accessibilityRole="button" accessibilityLabel={ko ? "의미 연결 끄기" : "Turn off semantic connections"}>
              <Text variant="body" style={styles.secondaryText}>{ko ? "끄고 벡터 삭제" : "Turn off and delete vectors"}</Text>
            </Pressable>
          </>
        ) : !embedUnderstanding ? (
          <>
            <Text variant="body" style={styles.lead}>
              {ko ? "꺼져 있어요. 켜면 태그가 겹치지 않아도 의미가 비슷한 기록을 이어 보여줘요." : "Off. Turn it on to connect records that are similar in meaning, even without shared tags."}
            </Text>
            <Pressable style={styles.secondary} onPress={() => setEmbedUnderstanding(true)} disabled={busy} accessibilityRole="button" accessibilityLabel={ko ? "의미 연결 켜기" : "Turn on semantic connections"}>
              <Text variant="body" style={styles.secondaryText}>{ko ? "의미 연결 켜기" : "Turn on"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text variant="body" style={styles.lead}>
              {ko
                ? "켜기 전에 알아두세요. 켜면 앞으로 담는 기록의 내용이 의미 벡터로 변환·저장돼, 서로 비슷한 기록을 이어 보여드려요. 변환을 위해 기록 텍스트가 Gemini(해외)로 전송됩니다. 위기 관련 내용은 전송되지 않아요. 성인만 켤 수 있고, 끄면 이후 색인이 멈추고 저장된 벡터도 삭제돼요. 동의는 기록에 남습니다."
                : "Before you turn it on. New records will be turned into meaning vectors and stored so similar records can be linked. To do that, record text is sent to Gemini (processed overseas). Crisis-related content is not sent. Adults only; turning it off stops indexing and deletes the stored vectors. Your consent is logged."}
            </Text>
            <View style={styles.ctaRow}>
              <Pressable style={styles.secondary} onPress={() => setEmbedUnderstanding(false)} disabled={busy} accessibilityRole="button" accessibilityLabel={ko ? "취소" : "Cancel"}>
                <Text variant="body" style={styles.secondaryText}>{ko ? "취소" : "Cancel"}</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={() => void enableEmbedding()} disabled={busy} accessibilityRole="button" accessibilityLabel={ko ? "이해했고 켭니다" : "I understand, turn it on"}>
                <Text variant="body" style={styles.primaryText}>{ko ? "이해했고 켜기" : "I understand, turn on"}</Text>
              </Pressable>
            </View>
          </>
        )}
        {embedErr ? (
          <Text variant="subtle" style={styles.footer}>{ko ? "저장에 실패했어요. 잠시 후 다시 시도해 주세요." : "Couldn't save. Please try again."}</Text>
        ) : null}
      </Card>

      <Card>
        <Action label={t("privacy.policy")} value={t("privacy.view")}/>
        <Action label={t("privacy.processingLog")} value={t("privacy.last7")}/>
        <Action label={t("privacy.thirdParty")} value={t("privacy.none")}/>
      </Card>

      <Card>
        <Text variant="caption" style={styles.section}>{ko ? "계정 삭제" : "Delete account"}</Text>
        <Text variant="subtle" style={styles.footer}>
          {ko
            ? "기록·캡처·위키·세컨비 사용량과 계정이 영구 삭제돼요. 되돌릴 수 없어요. 필요한 내용은 먼저 내보내기로 챙겨두세요."
            : "Your records, captures, wiki, usage and account are permanently erased. This cannot be undone. Export anything you need first."}
        </Text>
        <Text variant="subtle" style={styles.footer}>
          {ko ? '진행하려면 "DELETE" 라고 입력하세요.' : 'Type "DELETE" to proceed.'}
        </Text>
        <TextInput
          value={delConfirm}
          onChangeText={setDelConfirm}
          placeholder="DELETE"
          placeholderTextColor={colors.textLo}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel={ko ? "삭제 확인 입력" : "Deletion confirmation"}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (delConfirm === "DELETE" && !deleting) void runDeleteAccount();
          }}
        />
        <Pressable
          style={[styles.danger, (delConfirm !== "DELETE" || deleting) && { opacity: 0.5 }]}
          onPress={() => void runDeleteAccount()}
          disabled={delConfirm !== "DELETE" || deleting}
          accessibilityRole="button"
          accessibilityLabel={ko ? "계정 영구 삭제" : "Delete account permanently"}
        >
          <Text variant="body" style={styles.dangerText}>
            {deleting ? (ko ? "삭제 중…" : "Deleting…") : ko ? "계정 영구 삭제" : "Delete account"}
          </Text>
        </Pressable>
        {delError ? (
          <Text variant="subtle" style={styles.footer}>
            {ko
              ? "삭제를 끝내지 못했어요. 일부 데이터가 남아 있을 수 있어요. 잠시 후 다시 시도해 주세요."
              : "Couldn't finish deletion. Some data may remain. Please try again shortly."}
          </Text>
        ) : null}
      </Card>
      <Text variant="subtle" style={styles.footer}>{t("privacy.footer")}</Text>
    </Shell>
  );
}

export function DeepSpaceInsightsScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language === "ko";
  const { userId, loading: authLoading } = useAuth();

  // Real week-over-week data. We reuse listRecentRecords (the same client other
  // deep-space screens use) — it returns a ~90-day window of the user's records,
  // which covers both comparison weeks — and feed the rows to the pure summary.
  const [rows, setRows] = useState<Array<{ created_at: string }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    setErrored(false);
    listRecentRecords(userId)
      .then((data) => {
        if (alive) setRows((data ?? []) as Array<{ created_at: string }>);
      })
      .catch(() => {
        if (alive) {
          setRows(null);
          setErrored(true);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, reloadKey]);

  const summary = useMemo(
    () => (rows ? summarizeWeeklyInsights(rows) : null),
    [rows],
  );
  const focus = useMemo(
    () => (rows ? weeklyDomainFocus(rows) : null),
    [rows],
  );

  if (authLoading) {
    return <Shell title={t("insights.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  // 1) Loading state.
  if (loading) {
    return <Shell title={t("insights.title")}><GraphLoading /></Shell>;
  }

  // 2) Error state — single retry CTA.
  if (errored || !summary) {
    return (
      <Shell title={t("insights.title")}>
        <View style={styles.wikiPageOpen}>
          <Text variant="body" style={styles.wikiBody}>
            {t("insights.errorBody")}
          </Text>
          <Pressable
            style={styles.primary}
            onPress={() => setReloadKey((k) => k + 1)}
            accessibilityRole="button"
            accessibilityLabel={t("insights.retry")}
          >
            <Text variant="caption" style={styles.primaryText}>{t("insights.retry")}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  // 3) Empty / first-week state — no prior week to compare against yet.
  if (summary.isFirstWeek) {
    return (
      <Shell title={t("insights.title")}>
        <SecondbStatusHeader text={t("insights.statusFirstWeek")} tip={t("insights.tip")} mood="neutral" />
        <View style={styles.wikiPageOpen}>
          <Text variant="body" style={styles.wikiBody}>
            {t("insights.firstWeekBody")}
          </Text>
          <Pressable
            style={styles.primary}
            onPress={() => router.push("/capture")}
            accessibilityRole="button"
            accessibilityLabel={t("wiki.addPiece")}
          >
            <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  // 4) Filled state — real week-over-week. Bar heights scale to the larger of
  // the two counts so the taller bar always fills the track.
  const lastWeek = summary.lastWeek;
  const thisWeek = summary.thisWeek;
  const maxCount = Math.max(lastWeek, thisWeek, 1);
  const lastHeight = Math.max(6, Math.round((lastWeek / maxCount) * 84));
  const thisHeight = Math.max(6, Math.round((thisWeek / maxCount) * 84));
  const deltaLabel =
    summary.direction === "up"
      ? t("insights.delta", { percent: summary.deltaPct })
      : summary.direction === "down"
        ? t("insights.deltaDown", { percent: Math.abs(summary.deltaPct) })
        : t("insights.deltaFlat");

  // The header restates the delta, so it has to move with it. It used to say "you saved
  // more this week" on every branch, including the down week the bars right below it show.
  const statusText =
    summary.direction === "up"
      ? t("insights.statusUp")
      : summary.direction === "down"
        ? t("insights.statusDown")
        : t("insights.statusFlat");

  // The finding card claimed a majority ("records about making things passed the halfway
  // mark") that nothing ever computed. weeklyDomainFocus measures it, and says less when
  // the counts support less. Domain names come from the constellation's own labels.
  const findingText =
    focus === null || focus.kind === "empty"
      ? t("insights.findingEmpty")
      : focus.kind === "majority"
        ? t("insights.findingMajority", {
            percent: focus.percent,
            domain: t(`home:ds.home.domainName.${focus.domain}`),
          })
        : t("insights.findingSpread");

  return (
    <Shell title={t("insights.title")}>
      <SecondbStatusHeader text={statusText} tip={t("insights.tip")} mood="neutral" />
      {/* No explicit accessibilityLabel: an explicit label REPLACES the flattened
          child text, so TalkBack announced only "지금 상태, button" and never the
          week counts, delta, or honesty copy. Without it, RN concatenates the
          children - which is the full card content. */}
      <Pressable
        onPress={() => router.push("/records")}
        android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
        accessibilityRole="button"
      >
        <Card>
          <Text variant="heading" style={styles.section}>{t("insights.sectionNow")}</Text>
          <Text variant="body" style={styles.lead}>{t("insights.lead")}</Text>
          <Text variant="subtle" style={styles.insightsWeeklyLabel}>{t("insights.weeklyCap")}</Text>
          <View style={styles.insightsBars}>
            <View style={styles.insightsBarCol}>
              <Text variant="heading" style={styles.compareNum}>{lastWeek}</Text>
              <View style={styles.insightsBarTrack}>
                <View style={[styles.insightsBarFillMuted, { height: lastHeight }]} />
              </View>
              <Text variant="subtle" style={styles.compareCap}>{t("insights.lastWeek")}</Text>
            </View>
            <View style={styles.insightsBarCol}>
              <Text variant="heading" style={[styles.compareNum, styles.compareNumHi]}>{thisWeek}</Text>
              <View style={styles.insightsBarTrack}>
                <View style={[styles.insightsBarFillActive, { height: thisHeight }]} />
              </View>
              <Text variant="subtle" style={styles.compareCap}>{t("insights.thisWeek")}</Text>
            </View>
          </View>
          <Text variant="body" style={styles.delta}>{deltaLabel}</Text>
        </Card>
      </Pressable>
      <Pressable
        onPress={() => router.push("/research")}
        android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
        accessibilityRole="button"
      >
        <Card>
          <Text variant="heading" style={styles.section}>{t("insights.sectionFinding")}</Text>
          <Text variant="body" style={styles.lead}>{findingText}</Text>
        </Card>
      </Pressable>
    </Shell>
  );
}

// rev2 clone (30-datareview / reference DataReviewScreen): a windowed 내 데이터
// 리뷰 with the 내 권리 rights rows routing to the real export/erase surfaces.
// HONESTY: the reference fills this with example stored-data tallies (124 원문,
// 38 파생) and fabricated derived signals ("먼저 다가가는 성향, 확신 52%"). None
// of that is wired to real data, so rendering it would fabricate a data-rights
// report; until a real data-usage pipeline lands we show a neutral empty state
// and keep only the rights rows, which are real (same real-or-neutral pattern
// as AxisCheck.tsx, canon:186-190).
export function DeepSpaceDataDesignScreen() {
  const { i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const rights: { icon: keyof typeof CLONE_ICON; label: string; sub: string; route: string; danger?: boolean }[] = [
    { icon: "download", label: ko ? "내 데이터 전체 내보내기" : "Export all my data", sub: ko ? "IDEN · 원문 · 파생 신호" : "IDEN, raw, derived signals", route: "/iden" },
    { icon: "cloud_off", label: ko ? "파생 신호만 초기화" : "Reset derived signals only", sub: ko ? "원문은 두고 추정만 지우기" : "Keep raw, clear inferences", route: "/privacy" },
    { icon: "trash", label: ko ? "계정·데이터 영구 삭제" : "Delete account and data", sub: ko ? "되돌릴 수 없어요" : "This cannot be undone", route: "/privacy", danger: true },
  ];
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={ko ? "내 데이터 리뷰" : "My data review"} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={cx.body} keyboardShouldPersistTaps="handled">
        <RNText style={[m3TextStyle("bodyMedium"), cx.lead]}>{ko ? "내 데이터가 어떻게 쓰이는지 전부 보여줘요. 무엇이든 열람하고 지울 수 있어요." : "I show exactly how your data is used. You can open and delete anything."}</RNText>

        <MdCard variant="outlined" style={cx.sourceCard}>
          <RNText style={[m3TextStyle("titleSmall"), cx.signalTo]}>
            {ko ? "아직 모아둔 데이터가 없어요" : "No data gathered yet"}
          </RNText>
          <RNText style={[m3TextStyle("bodySmall"), cx.lead]}>
            {ko
              ? "기록이 쌓이면 원문 조각과 파생 신호를 여기서 열람하고 지울 수 있어요."
              : "As your records build up, you can review and delete the raw pieces and derived signals here."}
          </RNText>
        </MdCard>

        <RNText style={[m3TextStyle("titleSmall"), cx.sectionLabel]}>{ko ? "내 권리" : "My rights"}</RNText>
        <MdCard variant="filled" style={cx.rightsCard}>
          {rights.map((r, i) => (
            <Pressable
              key={r.label}
              onPress={() => router.push(r.route as never)}
              style={[cx.rightsRow, i > 0 && cx.rightsDivider]}
              accessibilityRole="button"
              accessibilityLabel={r.label}
            >
              <CloneIcon name={r.icon} color={r.danger ? m3.color.error : m3.color.onSurfaceVariant} size={21} />
              <View style={cx.flex1}>
                <RNText style={[m3TextStyle("bodyLarge"), r.danger ? cx.rightsLabelDanger : cx.rightsLabel]}>{r.label}</RNText>
                <RNText style={[m3TextStyle("bodySmall"), cx.rightsSub]}>{r.sub}</RNText>
              </View>
              <CloneIcon name="chevron_right" color={m3.color.onSurfaceVariant} size={20} />
            </Pressable>
          ))}
        </MdCard>
      </ScrollView>
    </DeepSpaceScreen>
  );
}

// Radio-style select row: reflects the real setting, tap changes it, and marks
// the active choice with the reference ✓. Used by the theme + font pickers.
function SelectRow({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      style={styles.action}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      <Text variant="body" style={styles.actionLabel}>{label}</Text>
      {selected ? <Text variant="body" style={styles.actionValue}>✓</Text> : null}
    </Pressable>
  );
}

export function DeepSpaceThemeScreen() {
  const { t } = useTranslation("deepspace");
  // Same hooks the legacy ThemeScreenLegacy (src/app/theme.tsx) drives, so the
  // deep-space rows read and write the real settings. Theme labels map to the
  // ThemeContext modes: 딥스페이스 = dark (default), 미드나잇 = light.
  const { mode, setMode } = useTheme();
  const { fontStyle, setFontStyle } = useFontStyle();
  const { liteMode, setLiteMode } = useLiteMode();
  return (
    <Shell title={t("theme.title")}>
      <SecondbStatusHeader text={t("theme.status")} tip={t("theme.tip")} />
      <Card>
        <Text variant="heading" style={styles.section}>{t("theme.sectionTheme")}</Text>
        <SelectRow selected={mode === "dark"} label={t("theme.themeDeepspace")} onPress={() => setMode("dark")} />
        <SelectRow selected={mode === "light"} label={t("theme.themeMidnight")} onPress={() => setMode("light")} />
      </Card>
      <Card>
        <Text variant="heading" style={styles.section}>{t("theme.sectionFont")}</Text>
        <SelectRow selected={fontStyle === "pixel"} label={t("theme.fontPixel")} onPress={() => setFontStyle("pixel")} />
        <SelectRow selected={fontStyle === "readable"} label={t("theme.fontReadable")} onPress={() => setFontStyle("readable")} />
      </Card>
      {/* The reference "글자 크기" slider had no backing setting (no in-app
          font-scale exists — OS Dynamic Type drives size, capped in ui/Text),
          so the dead painted knob is dropped rather than faked. Reduce-motion is
          the one real control here, wired to lite mode (motion chokepoint). */}
      <Card>
        <Toggle label={t("theme.reduceMotion")} on={liteMode} onPress={() => setLiteMode(!liteMode)} />
      </Card>
    </Shell>
  );
}

export function DeepSpaceManualScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  return (
    <Shell title={t("manual.title")}>
      <SecondbStatusHeader text={t("manual.status")} tip={t("manual.tip")} />
      <View style={styles.searchBox}><Text variant="body" style={styles.searchText}>{t("manual.search")}</Text></View>
      <Card>
        <Text variant="heading" style={styles.section}>{t("manual.sectionStart")}</Text>
        <Action label={t("manual.q1")} onPress={() => router.push("/support")} />
        <Action label={t("manual.q2")} onPress={() => router.push("/support")} />
        <Action label={t("manual.q3")} onPress={() => router.push("/support")} />
      </Card>
      <Card>
        <Text variant="heading" style={styles.section}>{t("manual.sectionData")}</Text>
        <Action label={t("manual.q4")} onPress={() => router.push("/support")} />
        <Action label={t("manual.q5")} onPress={() => router.push("/support")} />
        <Action label={t("manual.askDirect")} onPress={() => router.push('/secondb')} />
      </Card>

      {/* 핵심 개념 / Core concepts (canonGaps.manualConcepts) — icon + title + body. */}
      <Text variant="heading" style={styles.section}>{t("manual.conceptsTitle")}</Text>
      {canonGaps.manualConcepts.map((c, i) => {
        const title = ko ? c.title : GAPS_CONCEPT_EN[i]?.title ?? c.title;
        const body = ko ? c.body : GAPS_CONCEPT_EN[i]?.body ?? c.body;
        return (
          <Card key={c.title}>
            <View style={gap.conceptRow}>
              <CloneIcon name={gapGlyph(c.icon)} color={colors.cyanSoft} size={20} />
              <View style={gap.conceptText}>
                <Text variant="body" style={styles.actionLabel}>{title}</Text>
                <Text variant="body" style={styles.planFeatDim}>{body}</Text>
              </View>
            </View>
          </Card>
        );
      })}
    </Shell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
export { DeepSpacePlansScreen } from "./dds-plans-screen";

// ── Deep-space permissions: real OS status + request ───────────────────────
// The rows now reflect the ACTUAL permission state and act on tap. Notifications
// and image-picker are lazy-required (never evaluated in the web bundle, and
// Expo Go throws on require of expo-notifications — same guarded pattern as
// src/lib/ops/daily-review.ts and wiki/capture-image.ts); expo-audio ships a
// web build so its permission fns import directly. Rows render on native only.
type PermStatus = { granted: boolean; canAskAgain: boolean };

function loadNotifications(): typeof import("expo-notifications") | null {
  try {
    return require("expo-notifications") as typeof import("expo-notifications");
  } catch {
    return null;
  }
}
function loadImagePicker(): typeof import("expo-image-picker") | null {
  try {
    return require("expo-image-picker") as typeof import("expo-image-picker");
  } catch {
    return null;
  }
}

const permissionAdapters = {
  notif: {
    get: async (): Promise<PermStatus | null> => loadNotifications()?.getPermissionsAsync() ?? null,
    request: async (): Promise<PermStatus | null> => loadNotifications()?.requestPermissionsAsync() ?? null,
  },
  photo: {
    get: async (): Promise<PermStatus | null> => loadImagePicker()?.getCameraPermissionsAsync() ?? null,
    request: async (): Promise<PermStatus | null> => loadImagePicker()?.requestCameraPermissionsAsync() ?? null,
  },
  mic: {
    get: (): Promise<PermStatus> => getRecordingPermissionsAsync(),
    request: (): Promise<PermStatus> => requestRecordingPermissionsAsync(),
  },
} as const;

function PermissionRow({ kind, label, value }: { kind: keyof typeof permissionAdapters; label: string; value: string }) {
  const adapter = permissionAdapters[kind];
  const [status, setStatus] = useState<PermStatus | null>(null);

  const refresh = useCallback(() => {
    void Promise.resolve(adapter.get())
      .then((s) => setStatus(s ? { granted: s.granted, canAskAgain: s.canAskAgain } : null))
      .catch(() => setStatus(null));
  }, [adapter]);

  // Real status on mount + on every foreground return — the user may flip the
  // permission in OS Settings while away, so the toggle never shows a stale on/off.
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const onPress = useCallback(() => {
    // Granted, or denied with no re-prompt left → OS Settings is the only lever.
    // Otherwise fire the real permission prompt.
    if (status?.granted || (status && !status.canAskAgain)) {
      void Linking.openSettings();
      return;
    }
    void Promise.resolve(adapter.request())
      .then((s) => {
        if (s) setStatus({ granted: s.granted, canAskAgain: s.canAskAgain });
      })
      .catch(() => {});
  }, [adapter, status]);

  return <Toggle label={label} value={value} on={status?.granted ?? false} onPress={onPress} />;
}

export function DeepSpacePermissionsScreen() {
  const { t } = useTranslation("deepspace");
  // Web has no equivalent OS permission model for these capture features, so the
  // rows are hidden there rather than shown as controls that cannot act.
  const native = Platform.OS !== "web";
  return (
    <Shell title={t("permissions.title")}>
      <SecondbStatusHeader text={t("permissions.status")} tip={t("permissions.tip")} />
      {native ? (
        <Card>
          <PermissionRow kind="notif" label={t("permissions.notif")} value={t("permissions.notifValue")} />
          <PermissionRow kind="photo" label={t("permissions.photo")} value={t("permissions.photoValue")} />
          <PermissionRow kind="mic" label={t("permissions.mic")} value={t("permissions.micValue")} />
        </Card>
      ) : null}
      <Pressable
        style={styles.primary}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t("permissions.continue")}
      >
        <Text variant="caption" style={styles.primaryText}>{t("permissions.continue")}</Text>
      </Pressable>
    </Shell>
  );
}

export function DeepSpaceDiscoverScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("discover.title")}>
      <SecondbStatusHeader text={t("discover.status")} tip={t("discover.tip")} mood="neutral" />
      <Text variant="body" style={styles.lead}>{t("discover.lead")}</Text>
      <Pressable
        onPress={() => router.push("/attachment")}
        android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
        accessibilityRole="button"
        accessibilityLabel={t("discover.card1Head")}
      >
        <Card>
          <View style={styles.trendHead}><Text variant="heading" style={styles.section}>{t("discover.card1Head")}</Text><Text variant="body" style={styles.delta}>{t("discover.card1Delta", { percent: 32 })}</Text></View>
          <Text variant="body" style={styles.planFeatDim}>{t("discover.card1Body")}</Text>
        </Card>
      </Pressable>
      <Pressable
        onPress={() => router.push("/capture")}
        android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
        accessibilityRole="button"
        accessibilityLabel={t("discover.card2Head")}
      >
        <Card>
          <View style={styles.trendHead}><Text variant="heading" style={styles.section}>{t("discover.card2Head")}</Text><Text variant="body" style={styles.delta}>{t("discover.card2Delta", { percent: 18 })}</Text></View>
          <Text variant="body" style={styles.planFeatDim}>{t("discover.card2Body")}</Text>
        </Card>
      </Pressable>
      <Text variant="subtle" style={styles.footer}>{t("discover.footer")}</Text>
    </Shell>
  );
}

export function DeepSpaceReviewScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { userId, isMinor } = useAuth();
  // Real propose -> ratify (was a static mockup with hardcoded 61->68 and dead
  // buttons). Reuses the same engine as legacy /review; nothing applies until the
  // user ratifies in the sheet. LLM calls go through the C1/C9/C3 gateway inside.
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<SelfModelProposal | null>(null);
  // The star's ACTUAL current ladder tier captured when the proposal is built,
  // so applyRatify reports the right resultingLevel on decline (ratify always
  // -> L5). Falls back to L1 (the ladder default) if the card has no level yet.
  const [currentLevel, setCurrentLevel] = useState<LadderLevel>(1);
  // Real `record:<id>` refs behind the proposal (0060), captured at build time so
  // a ratify cites the records the card was built from — not LLM-invented labels.
  const [evidenceRefs, setEvidenceRefs] = useState<string[]>([]);
  // Openable receipt rows for those refs — so the user can tap a cited record and
  // CHECK the proposal against the original (research 2026-06-28: a "grounded in
  // your data" claim is not self-proving; showing the source span is the honest,
  // anti-Barnum move). Loaded when a proposal is generated.
  const [receipts, setReceipts] = useState<EvidenceShard[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function generate() {
    if (!userId || loading) return;
    setLoading(true);
    setResult(null);
    setReceipts([]);
    try {
      const card = await buildPersona(userId, locale, isMinor === true);
      const ctx = proposalContextForStar(card, "now");
      setCurrentLevel(card.starLevels?.now ?? 1);
      setEvidenceRefs(ctx.evidenceRefs);
      setReceipts(await loadEvidenceShards(ctx.evidenceRefs, locale));
      const p = await proposeSelfModelChange(userId, { kind: "star", star: "now" }, ctx.before, ctx.evidence, 5, locale, isMinor === true);
      if (p) {
        setProposal(p);
        setSheetOpen(true);
      } else {
        setResult(t("reviewNoChange"));
      }
    } catch {
      setResult(t("reviewLoadError"));
    } finally {
      setLoading(false);
    }
  }

  function handleDecision(decision: RatifyDecision) {
    const r = applyRatify(currentLevel, decision);
    setSheetOpen(false);
    if (decision === "ratify" && userId && proposal?.target.kind === "star") {
      // Cite evidenceRefs (real `record:<id>` for the records this card was built
      // from), NOT proposal.citations — those are Gemini-emitted labels with no
      // real-id whitelist. The write boundary re-sanitizes to resolvable refs
      // only, so a fabricated string can never be persisted (0060).
      void recordStarTiers(userId, { [proposal.target.star]: r.resultingLevel }, "journal", {
        origin: "ratify",
        citations: evidenceRefs,
      });
    }
    setResult(
      decision === "ratify"
        ? t("reviewRatifiedMoved", { level: r.resultingLevel })
        : t("reviewLeftAsIs"),
    );
  }

  return (
    <Shell title={t("review.title")}>
      <SecondbStatusHeader text={t("review.status")} tip={t("review.tip")} />
      <Text variant="body" style={styles.lead}>{t("review.lead")}</Text>
      <Card>
        <Text variant="heading" style={styles.section}>{t("review.section")}</Text>
        <Text variant="body" style={styles.planFeatDim}>{t("review.body")}</Text>
      </Card>
      <Pressable
        style={[styles.primary, loading ? { opacity: 0.5 } : null]}
        onPress={() => void generate()}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={t("reviewGetProposal")}
      >
        <Text variant="caption" style={styles.primaryText}>
          {loading ? (t("reviewLoading")) : t("reviewGetProposal")}
        </Text>
      </Pressable>
      {result ? <Text variant="subtle" style={styles.footer}>{result}</Text> : null}
      {receipts.length > 0 ? (
        <Card>
          <Text variant="heading" style={styles.section}>
            {t("reviewRecordsBehind")}
          </Text>
          <Text variant="body" style={styles.planFeatDim}>
            {t("reviewTapCheck")}
          </Text>
          <View style={styles.topicCol}>
            {receipts.map((ev) => (
              <Pressable
                key={ev.id}
                style={styles.topicRow}
                onPress={() => router.push({ pathname: "/record/[id]", params: { id: ev.id } })}
                accessibilityRole="button"
                accessibilityLabel={t("reviewOpenRecord", { title: ev.title })}
              >
                <View style={styles.topicDot} />
                <Text variant="body" style={styles.topicText} numberOfLines={1}>{ev.title}</Text>
                {ev.dateLabel ? <Text variant="subtle" style={styles.tlTime}>{ev.dateLabel}</Text> : null}
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}
      <RatifySheet proposal={proposal} locale={locale} visible={sheetOpen} onDecision={handleDecision} onClose={() => setSheetOpen(false)} />
    </Shell>
  );
}

export { DeepSpaceInboxScreen, DeepSpaceImportScreen } from "./dds-import-inbox-screens";

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
  const { t, i18n } = useTranslation("deepspace");
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const view = useMemo(() => buildDeepResearchView(pages, edges), [pages, edges]);
  // Cluster chip selection. The research view derives from graph-stats (no
  // server-side re-cluster), so selecting a chip drives the highlight + the
  // graph's focused tag label rather than refetching.
  const [activeCluster, setActiveCluster] = useState<string | null>(null);

  // propose->ratify: AI-proposed (inferred) links awaiting the user's verdict.
  const [proposals, setProposals] = useState<InferredLinkDetail[]>([]);
  const [proposing, setProposing] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  // Screen-reader feedback for ratify/reject: the row removal alone is silent,
  // so announce the outcome via a polite live region (persona-sim a11y, D-25).
  const [announce, setAnnounce] = useState("");

  const loadProposals = useMemo(
    () => async (uid: string) => {
      const rows = await listInferredLinkDetails(uid).catch(() => [] as InferredLinkDetail[]);
      setProposals(rows);
    },
    [],
  );

  useEffect(() => {
    if (!userId) return;
    void loadProposals(userId);
  }, [userId, loadProposals]);

  async function findProposals() {
    if (!userId || proposing) return;
    setProposing(true);
    try {
      // P0-2 (D-26 A19): build the index before reading it. Pages without a
      // vector (all of them right after migration 0068 nulled the dead
      // text-embedding-004 space) are embedded here in one batched call —
      // this button is the wired regeneration path for the semantic layer.
      await backfillEmbeddings(userId, { locale: i18n.language === "ko" ? "ko" : "en" }).catch(() => {
        /* best-effort: propose still runs over whatever vectors exist */
      });
      await proposeAllRelatedLinks(userId);
      await loadProposals(userId);
    } catch {
      // best-effort; nothing new appears
    } finally {
      setProposing(false);
    }
  }

  async function ratify(p: InferredLinkDetail) {
    if (!userId) return;
    const key = `${p.from_page}|${p.to_page}`;
    setActingKey(key);
    try {
      await ratifyLink(userId, p.from_page, p.to_page);
      setAnnounce(t("connectionConfirmed"));
      await loadProposals(userId);
    } catch {
      // best-effort
    } finally {
      setActingKey(null);
    }
  }

  async function reject(p: InferredLinkDetail) {
    if (!userId) return;
    const key = `${p.from_page}|${p.to_page}`;
    setActingKey(key);
    try {
      await rejectInferredLink(userId, p.from_page, p.to_page);
      setAnnounce(t("suggestionDismissed"));
      await loadProposals(userId);
    } catch {
      // best-effort
    } finally {
      setActingKey(null);
    }
  }

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
      <SecondbStatusHeader text={headerText} tip={t("research.tip")} mood="neutral" />
      <Text variant="body" style={styles.lead}>{t("research.lead")}</Text>
      {loading ? (
        <GraphLoading />
      ) : view.pageCount === 0 ? (
        <View style={styles.insightViolet}>
          <Text variant="body" style={styles.insightVioletText}>{t("research.emptyInsight")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {view.clusters.length > 0 ? (
            <View style={styles.filterRow}>
              {view.clusters.map((c, i) => (
                <FilterChip
                  key={c.tag}
                  label={`${c.tag} · ${c.count}`}
                  active={activeCluster === c.tag}
                  violet={activeCluster === null ? i === 0 : false}
                  onPress={() => setActiveCluster((prev) => (prev === c.tag ? null : c.tag))}
                />
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
            <Text variant="caption" style={styles.graphTag}>
              {view.clusters.length > 0
                ? t("research.clusterTag", { tag: activeCluster ?? view.clusters[0].tag })
                : t("research.clusterDefault")}
            </Text>
          </View>
          {view.headline !== null ? (
            <Pressable
              style={styles.insightViolet}
              android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
              onPress={() => router.push({ pathname: "/record/[id]", params: { id: view.headline!.id } })}
              accessibilityRole="button"
              accessibilityLabel={view.headline.title}
            >
              <Text variant="body" style={styles.insightVioletText}>{t("research.headline", { title: view.headline.title })}</Text>
              <View style={styles.evRow}>
                <Text variant="subtle" style={styles.evChip}>{t("research.chipPages", { count: view.pageCount })}</Text>
                <Text variant="subtle" style={styles.evChip}>{t("research.chipLinks", { count: view.headline.inDegree })}</Text>
                {view.orphanCount > 0 ? <Text variant="subtle" style={styles.evChip}>{t("research.chipOrphans", { count: view.orphanCount })}</Text> : null}
              </View>
            </Pressable>
          ) : (
            <View style={styles.insightViolet}>
              <Text variant="body" style={styles.insightVioletText}>{t("research.noLinks")}</Text>
            </View>
          )}
          {view.surprise !== null ? (
            <Pressable
              style={styles.insightViolet}
              android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
              onPress={() => router.push({ pathname: "/record/[id]", params: { id: view.surprise!.fromId } })}
              accessibilityRole="button"
              accessibilityLabel={t("research.surprise", { from: view.surprise.fromTitle, to: view.surprise.toTitle })}
            >
              <Text variant="body" style={styles.insightVioletText}>
                {t("research.surprise", { from: view.surprise.fromTitle, to: view.surprise.toTitle })}
              </Text>
              <View style={styles.evRow}>
                <Text variant="subtle" style={styles.evChip}>{t("research.islandChip", { count: view.islandCount })}</Text>
              </View>
            </Pressable>
          ) : null}

          {/* propose->ratify: AI proposes semantic links, the user decides. */}
          <Text variant="caption" pixelEn style={styles.tlLabel}>{t("research.proposalsLabel")}</Text>
          {announce ? (
            <RNText
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{ position: "absolute", width: 1, height: 1, left: -1000, overflow: "hidden" }}
            >
              {announce}
            </RNText>
          ) : null}
          {proposals.length === 0 ? (
            <View style={styles.insightViolet}>
              <Text variant="body" style={styles.insightVioletText}>{t("research.noProposals")}</Text>
            </View>
          ) : (
            proposals.map((p) => {
              const key = `${p.from_page}|${p.to_page}`;
              const busy = actingKey === key;
              return (
                <View key={key} style={styles.opsStep}>
                  <Pressable
                    style={[styles.mapRow, { minHeight: 44 }]}
                    android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
                    onPress={() => router.push({ pathname: "/record/[id]", params: { id: p.from_page } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.from_title} ↔ ${p.to_title}`}
                  >
                    <Text variant="body" style={styles.mapFrom} numberOfLines={1}>{p.from_title}</Text>
                    <RNText style={styles.mapArrow}>↔</RNText>
                    <Text variant="body" style={styles.mapTo} numberOfLines={1}>{p.to_title}</Text>
                  </Pressable>
                  <View style={styles.opsStepFoot}>
                    <Text variant="subtle" style={styles.evChip}>{t("research.confidence", { percent: Math.round(p.confidence * 100) })}</Text>
                    <Pressable style={[styles.smallBtnGhost, { minHeight: 44, justifyContent: "center" }]} onPress={() => void reject(p)} disabled={busy} accessibilityRole="button" accessibilityLabel={t("research.reject")}>
                      <Text variant="caption" style={styles.smallBtnGhostText}>{t("research.reject")}</Text>
                    </Pressable>
                    <Pressable style={[styles.smallBtn, { minHeight: 44, justifyContent: "center" }]} onPress={() => void ratify(p)} disabled={busy} accessibilityRole="button" accessibilityLabel={t("research.ratify")}>
                      <Text variant="caption" style={styles.smallBtnText}>{busy ? t("research.ratifying") : t("research.ratify")}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
          <Pressable
            style={[styles.smallBtnGhost, { marginLeft: 0, alignSelf: "flex-start" }, proposing && { opacity: 0.6 }]}
            onPress={() => void findProposals()}
            disabled={proposing}
            accessibilityRole="button"
            accessibilityLabel={t("research.getProposals")}
          >
            <Text variant="caption" style={styles.smallBtnGhostText}>{proposing ? t("research.gettingProposals") : t("research.getProposals")}</Text>
          </Pressable>
        </>
      )}
    </Shell>
  );
}

type ExportFormat = "iden" | "markdown" | "json" | "pdf";
const FORMAT_CARDS: { id: ExportFormat; name: string; descKey: string }[] = [
  { id: "iden", name: ".iden", descKey: "formats.idenDesc" },
  { id: "markdown", name: "Markdown", descKey: "formats.markdownDesc" },
  { id: "json", name: "JSON", descKey: "formats.jsonDesc" },
  { id: "pdf", name: "PDF", descKey: "formats.pdfDesc" },
];

export function DeepSpaceFormatsScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [format, setFormat] = useState<ExportFormat>("iden");
  const [includeRecords, setIncludeRecords] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ text: string; name: string } | null>(null);
  const [note, setNote] = useState<"copied" | "copyFailed" | "error" | null>(null);

  async function runExport() {
    if (!userId || exporting) return;
    setExporting(true);
    setResult(null);
    setNote(null);
    try {
      if (format === "iden") {
        const r = await exportIden(userId, { locale });
        setResult({ text: r.iden, name: r.idenFilename });
      } else if (format === "pdf") {
        const r = await exportIden(userId, { locale });
        setResult({ text: r.html, name: r.htmlFilename });
      } else if (format === "markdown") {
        const r = await exportUserWiki(userId, { locale, includeRecords });
        setResult({ text: r.prompt, name: "2nd-brain-wiki.md" });
      } else {
        const doc = await buildIdenDoc(userId, { locale });
        setResult({ text: JSON.stringify(doc, null, 2), name: "2nd-brain-iden.json" });
      }
    } catch {
      setNote("error");
    } finally {
      setExporting(false);
    }
  }

  async function copyOrShare() {
    if (!result) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(result.text);
        setNote("copied");
      } catch {
        setNote("copyFailed");
      }
    } else {
      void Share.share({ message: result.text }).catch(() => {});
    }
  }

  function download() {
    if (!result || typeof document === "undefined") return;
    try {
      const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // best-effort
    }
  }

  if (authLoading) {
    return <Shell title={t("formats.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const canDownload = typeof document !== "undefined";
  return (
    <Shell title={t("formats.title")}>
      <SecondbStatusHeader text={t("formats.status")} tip={t("formats.tip")} />
      <Text variant="body" style={styles.lead}>{t("formats.lead")}</Text>
      <View style={styles.formatGrid}>
        {FORMAT_CARDS.map((f) => {
          const sel = format === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFormat(f.id)}
              style={[styles.formatCard, sel && styles.formatCardSel]}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={f.name}
            >
              <Text variant="caption" style={[styles.formatName, sel && styles.formatNameSel]}>{f.name}</Text>
              <Text variant="subtle" style={styles.formatDesc}>{t(f.descKey)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" pixelEn style={styles.tlLabel}>{t("formats.scopeLabel")}</Text>
      <Card>
        <Toggle label={t("formats.scope1")} on />
        <Toggle label={t("formats.scope2")} on />
        <Toggle label={t("formats.scope3")} on={includeRecords} onPress={() => setIncludeRecords((v) => !v)} />
      </Card>
      <Pressable style={[styles.soulPrimary, exporting && { opacity: 0.6 }]} onPress={() => void runExport()} disabled={exporting}>
        <Text variant="caption" style={styles.primaryText}>{exporting ? t("formats.exporting") : t("formats.export")}</Text>
      </Pressable>
      {note === "error" ? <Text variant="body" style={styles.opsReason}>{t("formats.exportError")}</Text> : null}
      {result !== null ? (
        <View style={styles.wikiPageOpen}>
          <View style={styles.wikiPageHead}>
            <Text variant="heading" style={styles.wikiPageTitle} numberOfLines={1}>{result.name}</Text>
            <Text variant="subtle" style={styles.wikiRowConn}>{t("formats.previewChars", { count: result.text.length })}</Text>
          </View>
          <ScrollView style={styles.recBody} nestedScrollEnabled>
            <Text variant="body" style={styles.recBodyText} selectable>{result.text.slice(0, 4000)}</Text>
          </ScrollView>
          {note === "copied" ? <Text variant="body" style={styles.delta}>{t("formats.copied")}</Text> : null}
          {note === "copyFailed" ? <Text variant="body" style={styles.opsReason}>{t("formats.copyFailed")}</Text> : null}
          <View style={styles.ctaRow}>
            <Pressable style={styles.smallBtnGhost} onPress={() => void copyOrShare()} accessibilityRole="button">
              <Text variant="caption" style={styles.smallBtnGhostText}>{typeof navigator !== "undefined" && navigator.clipboard ? t("formats.copy") : t("formats.share")}</Text>
            </Pressable>
            {canDownload ? (
              <Pressable style={styles.smallBtnGhost} onPress={download} accessibilityRole="button">
                <Text variant="caption" style={styles.smallBtnGhostText}>{t("formats.download")}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.smallBtnGhost} onPress={() => { setResult(null); setNote(null); }} accessibilityRole="button">
              <Text variant="caption" style={styles.smallBtnGhostText}>{t("formats.close")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
  // A grounding: adherence chip shown with the recommendations.
  const [adherence, setAdherence] = useState<string | null>(null);
  const [runState, setRunState] = useState<OpsRunState>("idle");
  const [usedToday, setUsedToday] = useState(0);
  const [recommendations, setRecommendations] = useState<boolean | null>(null);
  const [todayRoutines, setTodayRoutines] = useState<OpsRoutine[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState(0);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [reminderToast, setReminderToast] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchPrivacyPrefs(userId).then((v) => {
      if (!cancelled) setRecommendations(v?.recommendations ?? false);
    });
    void readOpsUsage(userId).then((c) => {
      if (!cancelled) setUsedToday(c);
    });
    void loadToday();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function loadToday() {
    if (!userId) return;
    try {
      const now = new Date();
      const due = await listTodayRoutines(userId, now);
      setTodayRoutines(due);
      const today = localDayKey(now);
      const logs = await listCompletionsSince(userId, today);
      setCompletedIds(new Set(logs.map((l) => l.routine_id)));
      // 7-day window is enough for the capped weekStreak helper.
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekLogs = await listCompletionsSince(userId, localDayKey(weekAgo));
      setStreak(weekStreak(weekLogs, now));
    } catch {
      // best-effort: the today section just stays as-is
    }
  }

  if (authLoading) {
    return (
      <DeepSpaceScreen
        active="ops"
        header="none"
        variant="windowed"
        title={t("todaysAssistant")}
        onBack={() => router.back()}
      >
        <DockBody title={t("hero.title")}><GraphLoading /></DockBody>
      </DeepSpaceScreen>
    );
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
    setAdherence(null);
    try {
      const out = await recommendForDomain({
        userId,
        locale,
        domainId: domain,
        domainLabel: tEn(`domains.${domain}`),
        minor: isMinor === true,
        recommendationsPref: recommendations,
        // Explicit user run (and a quota bump below) - never serve the cache.
        forceFresh: true,
      });
      const used = await bumpOpsUsage(userId);
      setUsedToday(used);
      setRecs(out);
      setRunState(out.length === 0 ? "empty" : "idle");
      if (out.length > 0) {
        const stats = await gatherAdherenceStats(userId, domain);
        setAdherence(stats ? adherenceChip(stats, i18n.language?.toLowerCase().startsWith("ko") ?? false) : null);
      }
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

  function reminderNote(result: ReminderResult): string {
    if (result === "scheduled") return t("push.reminderSetNote");
    if (result === "denied") return t("push.reminderDeniedNote");
    if (result === "unavailable") return t("push.reminderUnavailableNote");
    return t("push.reminderFailedNote");
  }

  async function saveRoutine(rec: OpsRecommendation, key: string) {
    if (!userId || !domain || savingKey) return;
    setSavingKey(key);
    try {
      await createRoutineFromRecommendation(userId, domain, rec);
      // The reminder fires from the SAME existing scheduler used by the
      // recommendation cards; a non-recurring rec becomes a one-shot at its
      // start (or next morning if it had none).
      const { reminder_time } = deriveReminder(rec);
      const startsAtIso = rec.startsAtIso ?? opsNextMorningIso();
      const result = await scheduleRoutineReminder({
        title: rec.title,
        description: rec.reason,
        startsAtIso,
        durationMinutes: rec.durationMinutes,
        recurrence: rec.recurrence,
      });
      // reminder_time only informs the persisted row; the toast reflects the
      // scheduler outcome regardless.
      void reminder_time;
      setSavedKeys((prev) => new Set(prev).add(key));
      setRunState("idle");
      // Surface the scheduler outcome and refresh the today list.
      setReminderToast(reminderNote(result));
      await loadToday();
    } catch {
      setReminderToast(t("recommend.error"));
    } finally {
      setSavingKey(null);
    }
  }

  async function completeRoutine(routine: OpsRoutine) {
    if (!userId || completedIds.has(routine.id)) return;
    // Optimistic check — the unique-key upsert is idempotent so a failed write
    // is harmless to retry, and the today list reload reconciles either way.
    setCompletedIds((prev) => new Set(prev).add(routine.id));
    try {
      await logRoutineCompletion(userId, routine.id, localDayKey());
      await loadToday();
    } catch {
      setCompletedIds((prev) => {
        const next = new Set(prev);
        next.delete(routine.id);
        return next;
      });
    }
  }

  // Hero ring is driven by the REAL today list (not the reference mock counts).
  const totalR = todayRoutines.length;
  const doneR = todayRoutines.filter((r) => completedIds.has(r.id)).length;
  const pct = totalR > 0 ? doneR / totalR : 0;
  const HERO_R = 22;
  const HERO_C = 2 * Math.PI * HERO_R;
  const opsTools: { icon: keyof typeof CLONE_ICON; label: string; sub: string; route: string }[] = [
    { icon: "timer", label: t("tools.focus.label"), sub: t("tools.focus.sub"), route: "/focus" },
    { icon: "schedule", label: t("tools.reminders.label"), sub: t("tools.reminders.sub"), route: "/reminders" },
    { icon: "lightbulb", label: t("tools.imagine.label"), sub: t("tools.imagine.sub"), route: "/imagine" },
    { icon: "share", label: t("tools.shareCard.label"), sub: t("tools.shareCard.sub"), route: "/share-card" },
  ];

  return (
    // Primary "비서" hub: render inside the persistent deep-space chrome so the
    // rev2 windowed sub-screen: the M3 top app bar carries TITLES verbatim
    // (오늘의 비서). The reference OpsScreen leads with the routine ring hero.
    <DeepSpaceScreen
      active="ops"
      header="none"
      variant="windowed"
      title={t("todaysAssistant")}
      onBack={() => router.back()}
    >
      <DockBody>
      {/* hero — today's routine ring (real counts + streak) */}
      <MdCard variant="elevated" style={cx.opsHero}>
        <View style={cx.heroRow}>
          <Svg width={58} height={58} viewBox="0 0 58 58">
            <Circle cx={29} cy={29} r={HERO_R} fill="none" stroke={m3.color.surfaceVariant} strokeWidth={6} />
            <Circle cx={29} cy={29} r={HERO_R} fill="none" stroke={m3.color.primary} strokeWidth={6} strokeLinecap="round"
              strokeDasharray={HERO_C} strokeDashoffset={HERO_C * (1 - pct)} originX={29} originY={29} rotation={-90} />
          </Svg>
          <View style={cx.flex1}>
            <RNText style={[m3TextStyle("labelMedium"), cx.heroLabel]}>{t("today.heading")}</RNText>
            <RNText style={[m3TextStyle("headlineSmall"), cx.heroCount]}>{t("home.ringCount", { done: doneR, total: totalR })}</RNText>
          </View>
          {streak > 0 ? (
            <View style={cx.heroStreak}>
              <View style={cx.heroStreakRow}>
                <CloneIcon name="fire" color={m3.accent.alertDot} size={22} fill />
                <RNText style={cx.heroStreakNum}>{streak}</RNText>
              </View>
              <RNText style={[m3TextStyle("labelSmall"), cx.heroStreakCap]}>{t("home.streakLabel")}</RNText>
            </View>
          ) : null}
        </View>
        <ProgressLinear value={pct} color={m3.color.primary} style={cx.heroBar} />
      </MdCard>

      {/* routines */}
      {todayRoutines.length === 0 ? (
        <RNText style={[m3TextStyle("bodyMedium"), cx.lead]}>{t("today.empty")}</RNText>
      ) : (
        <View style={cx.stack8}>
          {todayRoutines.map((routine) => {
            const done = completedIds.has(routine.id);
            return (
              <Pressable
                key={routine.id}
                style={cx.routineRow}
                onPress={() => void completeRoutine(routine)}
                disabled={done}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={done ? t("today.doneA11y", { title: routine.title }) : t("today.completeA11y", { title: routine.title })}
              >
                <View style={[cx.routineDot, done && cx.routineDotOn]} />
                <RNText style={[m3TextStyle("bodyLarge"), cx.routineLabel, done && cx.routineLabelDone]}>{routine.title}</RNText>
                <RNText style={[m3TextStyle("labelSmall"), cx.routineStar]}>{routine.recurrence === "daily" ? t("card.daily") : t("card.weekly")}</RNText>
              </Pressable>
            );
          })}
        </View>
      )}
      {reminderToast ? <Text variant="subtle" style={styles.footerLeft}>{reminderToast}</Text> : null}

      {/* 이번 주 패턴 분석 — hands off to the real weekly insights screen */}
      <MdCard variant="filled" style={cx.analysisCard}>
        <View style={cx.rowCenter}>
          <CloneIcon name="sparkle" color={m3.color.tertiary} size={20} />
          <View style={cx.flex1}>
            <RNText style={[m3TextStyle("bodyLarge"), cx.analysisTitle]}>{t("home.patternsTitle")}</RNText>
            <RNText style={[m3TextStyle("bodySmall"), cx.analysisSub]}>{t("home.patternsSub")}</RNText>
          </View>
          <MdButton label={t("home.patternsRun")} variant="tonal" onPress={() => router.push("/insights")} style={cx.smallBtnCompact} />
        </View>
      </MdCard>

      {/* 오늘의 종합 의견 — the real recommendation engine (C9 classifier + the
          C1/C3 LLM gateway inside recommendForDomain). Reference-app leads this
          section with a 세컨비 head + the "one important thing" framing. */}
      <RNText style={[m3TextStyle("labelSmall"), cx.eyebrow]}>{t("home.takeEyebrow")}</RNText>
      <Text variant="body" style={styles.lead}>{t("hero.subtitle")}</Text>
      {/* IA (ops-ia §4): single entry from the /ops hub into the scheduled
          reminders surface. */}
      <Pressable style={styles.secondary} onPress={() => router.push("/reminders")}>
        <Text variant="caption" style={styles.secondaryText}>{t("card.remind")}</Text>
      </Pressable>
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
              setAdherence(null);
              setRunState("idle");
            }}
          />
        ))}
      </View>
      {group ? (
        <View style={styles.filterRow}>
          {domains.map((id) => (
            <FilterChip
              key={id}
              label={t(`domains.${id}`)}
              active={domain === id}
              violet
              onPress={() => {
                // IA (ops-ia §2): the picker is a router. Domains with a
                // dedicated screen push to it (depth 2, Back → /ops); the rest
                // stay in the /ops recommendation flow.
                const route = opsRouteForDomain(id);
                if (route) router.push(route);
                else setDomain(id);
              }}
            />
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
          <Text variant="caption" style={styles.primaryText}>{runState === "working" ? t("recommend.working") : t("recommend.cta")}</Text>
        </Pressable>
      ) : null}
      {runState === "limit" || (domain && limitReached) ? <Text variant="body" style={styles.opsReason}>{t("recommend.limit")}</Text> : null}
      {runState === "empty" ? <Text variant="body" style={styles.opsReason}>{t("recommend.empty")}</Text> : null}
      {runState === "error" ? <Text variant="body" style={styles.opsReason}>{t("recommend.error")}</Text> : null}
      {runState === "off" ? <Text variant="body" style={styles.opsReason}>{t("recommend.off")}</Text> : null}
      {adherence && recs.length > 0 ? (
        <View style={styles.recMetaRow}>
          <Text variant="subtle" style={styles.timeChipMint}>{adherence}</Text>
        </View>
      ) : null}
      {recs.map((rec, i) => (
        <View key={`${i}-${rec.title}`} style={styles.opsStep}>
          <View style={styles.opsStepHead}>
            <Text variant="heading" style={styles.opsStepTitle}>{rec.title}</Text>
            {rec.recurrence ? (
              <Text variant="subtle" style={styles.timeChipMint}>{rec.recurrence === "daily" ? t("card.daily") : t("card.weekly")}</Text>
            ) : null}
          </View>
          <Text variant="body" style={styles.opsReason}>{rec.reason}</Text>
          <View style={styles.opsStepFoot}>
            <Pressable style={styles.smallBtnGhost} onPress={() => shareStep(rec)} accessibilityRole="button" accessibilityLabel={t("card.shareA11y")}>
              <Text variant="caption" style={styles.smallBtnGhostText}>{t("card.share")}</Text>
            </Pressable>
            <Pressable style={styles.smallBtnGhost} onPress={() => addToCalendar(rec)} accessibilityRole="button" accessibilityLabel={t("card.addCalendarA11y")}>
              <Text variant="caption" style={styles.smallBtnGhostText}>{t("card.addCalendar")}</Text>
            </Pressable>
            {(() => {
              const key = `${i}-${rec.title}`;
              const saved = savedKeys.has(key);
              const saving = savingKey === key;
              return (
                <Pressable
                  style={[styles.smallBtn, (saving || saved) && { opacity: 0.6 }]}
                  disabled={saving || saved}
                  onPress={() => void saveRoutine(rec, key)}
                  accessibilityRole="button"
                  accessibilityLabel={t("card.saveRoutineA11y")}
                  accessibilityState={{ disabled: saving || saved, busy: saving }}
                >
                  <Text variant="caption" style={styles.smallBtnText}>
                    {saving ? t("card.saving") : saved ? t("card.saved") : t("card.saveRoutine")}
                  </Text>
                </Pressable>
              );
            })()}
          </View>
        </View>
      ))}
      {recs.length > 0 ? <Text variant="subtle" style={styles.footerLeft}>{t("recommend.disclaimerBody")}</Text> : null}

      {/* 비서 도구 — 2×2 tool grid (real routes) */}
      <RNText style={[m3TextStyle("titleSmall"), cx.sectionLabel]}>{t("home.toolsLabel")}</RNText>
      <View style={cx.toolGrid}>
        {opsTools.map((tool) => (
          <MdCard key={tool.route} variant="filled" onPress={() => router.push(tool.route as never)} style={cx.toolCard} accessibilityLabel={tool.label}>
            <View style={cx.rowCenter}>
              <CloneIcon name={tool.icon} color={m3.color.tertiary} size={20} />
              <View style={cx.flex1}>
                <RNText style={[m3TextStyle("titleSmall"), cx.toolTitle]}>{tool.label}</RNText>
                <RNText style={[m3TextStyle("labelSmall"), cx.toolSub]}>{tool.sub}</RNText>
              </View>
            </View>
          </MdCard>
        ))}
      </View>
      </DockBody>
    </DeepSpaceScreen>
  );
}

export { DeepSpaceRecordsScreen, DeepSpaceRecordDetailScreen, DeepSpaceWikiScreen } from "./dds-wiki-records-screens";

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
      <Text variant="body" style={styles.lead}>{t("domains.lead")}</Text>
      {loading ? (
        <GraphLoading />
      ) : view.domains.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text variant="body" style={styles.wikiBody}>{t("domains.empty")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text variant="caption" style={styles.primaryText}>{t("domains.addData")}</Text>
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
                  <Text variant="caption" style={d.recent ? styles.domainName : styles.domainNameDim} numberOfLines={1}>{d.tag}</Text>
                  <View style={styles.domainNumRow}>
                    <Text variant="heading" style={[styles.domainNum, active && styles.domainNumActive, !d.recent && styles.domainNumDim]}>{d.count}</Text>
                    <Text variant="subtle" style={styles.domainUnit}>{t("domains.unit")}</Text>
                  </View>
                  <Text variant="subtle" style={styles.domainSub}>{recencyLabel(d.lastActivity, recencyOpts) || t("domains.noActivity")}</Text>
                </View>
              );
            })}
          </View>
          {view.topTopics !== null && view.topTopics.titles.length > 0 ? (
            <>
              <Text variant="caption" pixelEn style={styles.tlLabel}>{t("domains.topicsLabel", { tag: view.topTopics.tag })}</Text>
              <View style={styles.topicCol}>
                {view.topTopics.titles.map((title, i) => (
                  <View key={title} style={styles.topicRow}>
                    <View style={[styles.topicDot, i > 0 && styles.topicDotDim]} />
                    <Text variant="body" style={i > 0 ? styles.topicTextDim : styles.topicText} numberOfLines={1}>{title}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text variant="caption" style={styles.primaryText}>{t("domains.addData")}</Text>
          </Pressable>
        </>
      )}
    </Shell>
  );
}

// Wave 1: deep-space Pomodoro focus timer for the daily_focus ops domain.
// One core thing per screen: the big remaining-time readout. Completing a focus
// phase deterministically ticks daily_focus (applyFocusSessionComplete) and fires
// a one-shot local notification (notifyNow) — both reuse existing modules, no AI.
function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

// Deep-space focus-timer canon (focus-timer.dc design): SVG ring drawn with
// stroke-dashoffset, state-toned (focus = cyan, break = cyanDim cool, complete =
// mint), pixel fonts (Galmuri11 numerals / PressStart2P eyebrow), + the
// complete-choice screen and a session-length bottom sheet. Tokens only, no hex.
const RING_R = 120;
const RING_C = 2 * Math.PI * RING_R; // circumference for the dasharray
// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
const FOCUS_PRESETS = canonMore.focusPresets;
const FOCUS_STARS = canonMore.focusStars;

// rev2 clone (25-focus / reference FocusScreen): windowed 일일 집중 timer. The
// proven pomodoro engine + ANDROID_QA single-interval handling are preserved; the
// UI adopts the reference layout (presets, star picker, today summary). A focus
// block auto-completes to a fresh idle block (no break phase in the reference)
// while still ticking daily_focus (applyFocusSessionComplete) + a local notify.
export function DeepSpaceFocusScreen() {
  const { t, i18n } = useTranslation("ops");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const { userId, loading: authLoading, hasProfile } = useAuth();

  const [timer, setTimer] = useState<PomodoroState>(() => createPomodoro());
  // Per-day tally; survives reset (not the in-cycle session count).
  const [doneToday, setDoneToday] = useState(0);
  const [starIdx, setStarIdx] = useState(0);

  // ANDROID_QA §4: a single 1s interval drives tick(); cleared on unmount AND
  // whenever `running` flips off, so a paused/idle timer holds no live interval.
  const timerRef = useRef(timer);
  timerRef.current = timer;

  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => {
      const prev = timerRef.current;
      const next = tick(prev, 1000);
      if (next === prev) return;
      if (focusJustCompleted(prev, next)) {
        // Sensor auto-complete: tick daily_focus + notify, then return to a fresh
        // idle focus block (the reference timer has no break phase).
        setTimer(createPomodoro(prev.config));
        setDoneToday((n) => n + 1);
        if (userId) void applyFocusSessionComplete(userId).catch(() => {});
        void notifyNow(t("focus.alarmFocusTitle"), t("focus.alarmFocusBody")).catch(() => {});
      } else {
        setTimer(next);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timer.running, userId, t]);

  // Per-day tally persists across app restarts (keyed by today's date), so the
  // count reflects all of today's focus sessions, not just this mount's — the
  // previous useState(0) reset the tally to zero every time the screen remounted.
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(`focus_done_${kstDateToday()}`)
      .then((v) => {
        if (alive && v) setDoneToday(Number(v) || 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (doneToday <= 0) return;
    void AsyncStorage.setItem(`focus_done_${kstDateToday()}`, String(doneToday)).catch(() => {});
  }, [doneToday]);

  if (authLoading) {
    return <DockShell title={t("focus.title")}><GraphLoading /></DockShell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const idle = timer.phase === "idle";
  const focusMin = timer.config.focusMinutes;
  const totalMs = focusMin * 60_000;
  const shownMs = idle ? totalMs : timer.remainingMs;
  // The ring FILLS as the session is gathered: offset = C while empty (start).
  const remainingFrac = totalMs > 0 ? Math.max(0, Math.min(1, shownMs / totalMs)) : 0;
  const dashoffset = RING_C * remainingFrac;
  const clock = formatClock(shownMs);
  const ringSub = idle ? t("focus.ringReady") : timer.running ? t("focus.ringFocusing") : t("focus.ringPaused");
  // ko stays on the canon array; other locales resolve focus.stars.s{i} keys.
  const focusStarLabel = (i: number) => (ko ? FOCUS_STARS[i] : t(`focus.stars.s${i}`));
  const starName = focusStarLabel(starIdx);
  const target = 4;
  const filled = Math.min(doneToday, target);
  const setPreset = (m: number) => setTimer(createPomodoro({ ...timer.config, focusMinutes: m }));

  return (
    <DockShell title={t("focus.title")}>
      <RNText style={[m3TextStyle("bodyMedium"), cx.focusLead]}>
        {t("focus.leadPre")}
        <RNText style={cx.leadStrong}>{t("focus.leadStar", { star: starName })}</RNText>
        {t("focus.leadPost")}
      </RNText>

      {/* timer ring */}
      <View style={cx.ringWrap}>
        <Svg width={280} height={280} viewBox="0 0 280 280">
          <Circle cx={140} cy={140} r={RING_R} fill="none" stroke={m3.color.surfaceContainerHighest} strokeWidth={14} />
          <Circle
            cx={140}
            cy={140}
            r={RING_R}
            fill="none"
            stroke={m3.color.primary}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={dashoffset}
            originX={140}
            originY={140}
            rotation={-90}
          />
        </Svg>
        <View style={cx.ringCenter}>
          <RNText style={cx.ringTime}>{clock}</RNText>
          <RNText style={[m3TextStyle("labelLarge"), cx.ringSub]}>{ringSub}</RNText>
        </View>
      </View>

      {/* presets */}
      <View style={cx.chipRowCenter}>
        {FOCUS_PRESETS.map((m) => {
          const on = idle && focusMin === m;
          return (
            <MdChip
              key={m}
              kind="filter"
              selected={on}
              label={t("focus.preset", { min: m })}
              icon={on ? <CloneIcon name="check" color={m3.color.onSecondaryContainer} size={16} /> : undefined}
              onPress={() => setPreset(m)}
            />
          );
        })}
      </View>

      {/* controls */}
      <View style={cx.controlsRow}>
        <MdButton
          label={timer.running ? t("focus.pause") : t("focus.startFocus")}
          variant={timer.running ? "tonal" : "filled"}
          icon={<CloneIcon name={timer.running ? "pause" : "play_arrow"} color={timer.running ? m3.color.onSecondaryContainer : m3.color.onPrimary} size={18} fill={!timer.running} />}
          onPress={() => setTimer((s) => (s.running ? pause(s) : start(s)))}
          style={{ flex: 2 }}
        />
        <MdButton
          label={t("focus.resetBtn")}
          variant="outlined"
          icon={<CloneIcon name="replay" color={m3.color.primary} size={18} />}
          onPress={() => setTimer((s) => reset(s))}
          style={{ flex: 1 }}
        />
      </View>

      {/* linked star */}
      <RNText style={[m3TextStyle("titleSmall"), cx.sectionLabel]}>{t("focus.forWhichStar")}</RNText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cx.chipScroll}>
        {FOCUS_STARS.map((_, i) => (
          <MdChip
            key={i}
            kind="filter"
            selected={starIdx === i}
            label={focusStarLabel(i)}
            icon={<CloneIcon name={starIdx === i ? "check" : "star_shine"} color={starIdx === i ? m3.color.onSecondaryContainer : m3.color.onSurfaceVariant} size={15} />}
            onPress={() => setStarIdx(i)}
          />
        ))}
      </ScrollView>

      {/* today summary */}
      <MdCard variant="filled" style={cx.focusSummary}>
        <View style={cx.dotsRow}>
          {Array.from({ length: target }).map((_, i) => (
            <View key={i} style={[cx.summaryDot, { backgroundColor: i < filled ? m3.color.primary : m3.color.surfaceVariant }]} />
          ))}
        </View>
        <View style={cx.flex1}>
          <RNText style={[m3TextStyle("bodyLarge"), cx.summaryTitle]}>{t("focus.todayCount", { sessions: doneToday })}</RNText>
          <RNText style={[m3TextStyle("bodySmall"), cx.summarySub]}>{t("focus.todaySub", { min: doneToday * focusMin, goal: target })}</RNText>
        </View>
        <CloneIcon name="fire" color={m3.accent.alertDot} size={22} fill />
      </MdCard>
    </DockShell>
  );
}

// /srs - language_practice spaced-repetition review (Wave 1, vision axis 2:
// personal assistant). One screen, one promise: clear today's due cards. ts-fsrs
// owns the scheduling; grading a card advances it and, when the due queue
// reaches empty, deterministically ticks the user's language_practice routine
// (applyLanguageReviewComplete) — exactly like a focus block ticks daily_focus.
// No AI, no animation lock: the flip is a plain state toggle.
const SRS_RATINGS: { rating: SrsRating; key: string; kind: "again" | "hard" | "good" | "easy" }[] = [
  { rating: 1, key: "srs.again", kind: "again" },
  { rating: 2, key: "srs.hard", kind: "hard" },
  { rating: 3, key: "srs.good", kind: "good" },
  { rating: 4, key: "srs.easy", kind: "easy" },
];

export function DeepSpaceSrsScreen() {
  const { t } = useTranslation("ops");
  const { userId, loading: authLoading, hasProfile } = useAuth();

  const [queue, setQueue] = useState<SrsCardRow[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [adding, setAdding] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const backRef = useRef<TextInput>(null);

  // Load the due queue once auth resolves. A null queue = still loading; an
  // empty array = nothing due (the cleared state).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void listDueCards(userId)
      .then((cards) => {
        if (!cancelled) setQueue(cards);
      })
      .catch(() => {
        if (!cancelled) setQueue([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (authLoading) {
    return <Shell title={t("srs.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const current = queue && queue.length > 0 ? queue[0] : null;

  const grade = async (rating: SrsRating) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await recordReview(userId, current.id, rating);
      const rest = (queue ?? []).slice(1);
      setQueue(rest);
      setFlipped(false);
      // Deterministic rule: the due queue reached empty today → tick the
      // language_practice routine (idempotent, reuses logRoutineCompletion).
      if (rest.length === 0) {
        await applyLanguageReviewComplete(userId).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  const addCard = async () => {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b || busy) return;
    setBusy(true);
    try {
      const created = await createCard(userId, { front: f, back: b });
      setQueue((q) => [...(q ?? []), created]);
      setFront("");
      setBack("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  if (adding) {
    return (
      <Shell title={t("srs.addTitle")}>
        <Card>
          <Text variant="caption" pixelEn style={styles.authLabel}>{t("srs.frontLabel")}</Text>
          <TextInput
            style={styles.input}
            value={front}
            onChangeText={setFront}
            placeholder={t("srs.frontPlaceholder")}
            placeholderTextColor={colors.textLo}
            accessibilityLabel={t("srs.frontLabel")}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => backRef.current?.focus()}
          />
          <Text variant="caption" pixelEn style={styles.authLabel}>{t("srs.backLabel")}</Text>
          <TextInput
            ref={backRef}
            style={styles.input}
            value={back}
            onChangeText={setBack}
            placeholder={t("srs.backPlaceholder")}
            placeholderTextColor={colors.textLo}
            accessibilityLabel={t("srs.backLabel")}
            returnKeyType="done"
            onSubmitEditing={() => void addCard()}
          />
        </Card>
        <View style={styles.focusControls}>
          <Pressable style={styles.primary} onPress={() => void addCard()} accessibilityRole="button" accessibilityLabel={t("srs.save")}>
            <Text variant="caption" style={styles.primaryText}>{t("srs.save")}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => setAdding(false)} accessibilityRole="button" accessibilityLabel={t("srs.cancel")}>
            <Text variant="caption" style={styles.secondaryText}>{t("srs.cancel")}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  return (
    <Shell title={t("srs.title")}>
      <SecondbStatusHeader text={t("srs.status")} tip={t("srs.tip")} />
      {current ? (
        <>
          <Pressable
            style={styles.srsCard}
            onPress={() => setFlipped((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={flipped ? t("srs.showFront") : t("srs.flip")}
          >
            <Text variant="caption" pixelEn style={styles.srsFaceLabel}>{flipped ? t("srs.backLabel") : t("srs.frontLabel")}</Text>
            <Text variant="heading" style={styles.srsFaceText}>{flipped ? current.back : current.front}</Text>
            {!flipped ? <Text variant="body" style={styles.srsHint}>{t("srs.flip")}</Text> : null}
          </Pressable>
          {flipped ? (
            <View style={styles.srsRatingRow}>
              {SRS_RATINGS.map((r) => (
                <Pressable
                  key={r.kind}
                  style={styles.srsRatingBtn}
                  disabled={busy}
                  onPress={() => void grade(r.rating)}
                  accessibilityRole="button"
                  accessibilityLabel={t(r.key)}
                >
                  <Text variant="caption" style={styles.srsRatingText}>{t(r.key)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text variant="subtle" style={styles.footerLeft}>{t("srs.remaining", { count: queue?.length ?? 0 })}</Text>
        </>
      ) : (
        <View style={styles.center}>
          {/* The smile belongs to the cleared queue, not to the spinner before it. */}
          <SecondbHead size={104} mood={queue === null ? "neutral" : "positive"} />
          <Text variant="heading" style={styles.prompt}>{queue === null ? t("srs.loading") : t("srs.cleared")}</Text>
        </View>
      )}
      <Pressable style={styles.secondary} onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel={t("srs.addCard")}>
        <Text variant="caption" style={styles.secondaryText}>{t("srs.addCard")}</Text>
      </Pressable>
    </Shell>
  );
}


// P5 megafile split, tranche 1: the auth screens live in their own file now;
// re-exported here so existing route imports keep working unchanged.
export {
  DeepSpaceSignInDesignScreen,
  DeepSpaceSignUpDesignScreen,
  DeepSpaceResetPasswordDesignScreen,
} from "./dds-auth-screens";

// ──────────────────────────────────────────────────────────────────────────
// rev2 M3 clone kit (24-ops / 25-focus / 28-connect / 30-datareview). Shared
// Material-symbol stroke glyphs + a local stylesheet, transcribed 1:1 from the
// reference-app screens. All colors route through m3.* tokens (no hex literals).
const CLONE_ICON: Record<string, string> = {
  fire: '<path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1 .5 2 1.5 2 .8 0 1-.8.5-2C11 8 12 6 12 3Z"/>',
  sparkle: '<path d="M12 3l1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3L12 3Z"/>',
  trending_up: '<path d="M4 15l5-5 3 3 6-6"/><path d="M14 7h5v5"/>',
  timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 13V9M9.5 3.5h5"/>',
  schedule: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  lightbulb: '<path d="M9.2 18h5.6M10 21h4M8.4 14.6A5.6 5.6 0 1 1 17 10a5.4 5.4 0 0 1-1.6 3.9c-.6.6-.9 1-.9 1.7v.4h-5v-.4c0-.7-.3-1.1-.9-1.7Z"/>',
  share: '<path d="M12 3v11M8.5 6.5 12 3l3.5 3.5"/><path d="M6 12v7h12v-7"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  // rev2 FocusScreen glyphs (sb-data.jsx ICON_SVG). play_arrow is rendered filled
  // (reference sb-more.jsx uses it filled); the reference's own ICON_SVG omits
  // play_arrow so its render falls back to `workspaces` (3 circles) — an upstream
  // glyph gap, not a design choice, so we honor the declared intent (a play mark).
  play_arrow: '<path d="M9 6.5v11l9-5.5z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  replay: '<path d="M6 12a6 6 0 1 0 1.8-4.3M7 4v4h4"/>',
  star_shine: '<path d="M12 3c.5 3.8 2.7 6 6.5 6.5-3.8.5-6 2.7-6.5 6.5-.5-3.8-2.7-6-6.5-6.5 3.8-.5 6-2.7 6.5-6.5Z"/>',
  refresh: '<path d="M5 12a7 7 0 0 1 12-5M19 4.5v4h-4"/><path d="M19 12a7 7 0 0 1-12 5M5 19.5v-4h4"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  forum: '<path d="M3 5.5h11v7H8l-3.5 3z"/><path d="M8.5 13v1.4a2 2 0 0 0 2 2h5.7l3.3 2.6v-7.6a2 2 0 0 0-2-2H16"/>',
  bedtime: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
  book: '<path d="M12 6.5C10.5 5 8 4.5 5 5v12c3-.5 5.5 0 7 1.5 1.5-1.5 4-2 7-1.5V5c-3-.5-5.5 0-7 1.5Z"/><path d="M12 6.5v12"/>',
  camera: '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><circle cx="12" cy="13.5" r="3.5"/><path d="M9 7.5l1.2-2h3.6L15 7.5"/>',
  bubble: '<circle cx="9" cy="10" r="4"/><circle cx="16.5" cy="8" r="2.4"/><circle cx="15.5" cy="15.5" r="3"/>',
  box: '<path d="M4 8.5 12 5l8 3.5V17l-8 3.5L4 17z"/><path d="M4 8.5 12 12l8-3.5M12 12v8.5"/>',
  hub: '<circle cx="12" cy="12" r="2.4"/><circle cx="5" cy="6" r="1.8"/><circle cx="19" cy="6" r="1.8"/><circle cx="5" cy="18" r="1.8"/><circle cx="19" cy="18" r="1.8"/><path d="M10.3 10.6 6.3 7.2M13.7 10.6l4-3.4M10.3 13.4l-4 3.4M13.7 13.4l4 3.4"/>',
  cloud_sync: '<path d="M7 18a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.2A3.4 3.4 0 0 1 17 18z"/><path d="M10 14.5l1.5 1.5 3-3"/>',
  arrow_forward: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  trash: '<path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12"/>',
  download: '<path d="M12 4v10M8 11l4 4 4-4"/><path d="M5 19h14"/>',
  cloud_off: '<path d="M7 18a4 4 0 0 1 .5-8 5 5 0 0 1 8.5-.5M18 12a3.4 3.4 0 0 1-1 6H9"/><path d="M4 4l16 16"/>',
  chevron_right: '<path d="M9 5l7 7-7 7"/>',
  // gaps-pack canon glyphs (privacyFacts / manualConcepts icon names).
  badge: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><circle cx="9" cy="11" r="1.9"/><path d="M6 15.4a3 3 0 0 1 6 0"/><path d="M14.5 10.5h3.5M14.5 13.5h2.5"/>',
  inbox: '<path d="M5 5h14l1.5 8v6H3.5v-6z"/><path d="M3.5 13H8l1.5 2.5h5L16 13h4.5"/>',
  delete: '<path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12"/>',
  auto_awesome: '<path d="M11 3l1.6 4.2L16.8 9l-4.2 1.8L11 15l-1.6-4.2L5.2 9l4.2-1.8L11 3Z"/><path d="M18 14l.7 1.8 1.8.7-1.8.7L18 19l-.7-1.8-1.8-.7 1.8-.7z"/>',
  workspaces: '<circle cx="12" cy="7" r="3"/><circle cx="6.5" cy="16" r="3"/><circle cx="17.5" cy="16" r="3"/>',
  bubble_chart: '<circle cx="9" cy="10" r="4"/><circle cx="16.5" cy="8" r="2.4"/><circle cx="15.5" cy="15.5" r="3"/>',
  task_alt: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12l3 3 5-6"/>',
};

function CloneIcon({ name, color, size = 20, fill = false }: { name: keyof typeof CLONE_ICON; color: string; size?: number; fill?: boolean }) {
  const paint = fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${paint}>${CLONE_ICON[name]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

const cx = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  lead: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4, marginBottom: 14 },
  leadStrong: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "700" },
  sectionLabel: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 22, marginBottom: 10 },
  eyebrow: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.4, color: m3.color.primary, marginTop: 22, marginBottom: 8, marginHorizontal: 2 },

  // ── ops hero ──
  opsHero: { padding: 16, marginTop: 4, backgroundColor: m3.color.primaryContainer },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  heroLabel: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  heroCount: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 2 },
  heroStreak: { alignItems: "center" },
  heroStreakRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroStreakNum: { fontFamily: m3.font.mono, fontSize: 22, fontWeight: "800", color: m3.accent.alertDot },
  heroStreakCap: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 2 },
  heroBar: { marginTop: 12 },

  // ── routine rows ──
  routineRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: m3.color.surfaceContainerHighest },
  routineDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: m3.color.outline },
  routineDotOn: { backgroundColor: m3.color.primary, borderColor: m3.color.primary },
  routineLabel: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand },
  routineLabelDone: { color: m3.color.onSurfaceVariant, textDecorationLine: "line-through" },
  routineStar: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  stack8: { gap: 8, marginTop: 12 },

  // ── analysis card ──
  analysisCard: { padding: 14, marginTop: 12 },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex1: { flex: 1, minWidth: 0 },
  analysisTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  analysisSub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },

  // ── 종합 의견 (세컨비 advice) ──
  adviceCard: { padding: 16, backgroundColor: m3.color.surfaceContainerHigh },
  adviceHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  adviceStar: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  adviceHeadline: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 2, lineHeight: 22 },
  adviceRead: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 12, lineHeight: 22 },
  adviceDetail: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 8, lineHeight: 22 },
  evidenceRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 14 },
  evidenceLabel: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginRight: 2 },
  evidenceChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999, backgroundColor: m3.color.surfaceContainerHighest },
  evidenceChipText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  adviceCta: { marginTop: 16 },
  adviceRefreshRow: { flexDirection: "row", justifyContent: "center", marginTop: 4 },

  // ── 비서 도구 grid ──
  toolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toolCard: { width: "48%", padding: 13 },
  toolTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  toolSub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },

  // ── focus ──
  focusLead: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, textAlign: "center", marginTop: 4, marginBottom: 18, lineHeight: 20 },
  ringWrap: { width: 280, height: 280, alignSelf: "center" },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  ringTime: { fontFamily: m3.font.mono, fontSize: 56, fontWeight: "700", color: m3.color.onSurface, letterSpacing: 1 },
  ringSub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 2 },
  chipRowCenter: { flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 18 },
  controlsRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  chipScroll: { gap: 8, paddingRight: 16 },
  focusSummary: { padding: 16, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 16 },
  dotsRow: { flexDirection: "row", gap: 5 },
  summaryDot: { width: 12, height: 12, borderRadius: 6 },
  summaryTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  summarySub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },

  // ── connect / datareview shared ──
  consentCard: { padding: 14, marginBottom: 12, backgroundColor: m3.color.secondaryContainer },
  consentRow: { flexDirection: "row", gap: 10 },
  consentText: { flex: 1, color: m3.color.onSecondaryContainer, fontFamily: m3.font.brand },
  sourceCard: { padding: 14 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconBoxOn: { backgroundColor: m3.color.primary },
  iconBoxOff: { backgroundColor: m3.color.surfaceContainerHighest },
  sourceName: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  sourceSub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  connectBtn: { paddingHorizontal: 16, minHeight: 40 },
  smallBtnCompact: { paddingHorizontal: 12, minHeight: 36 },

  // ── datareview ──
  statGrid: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, padding: 12, alignItems: "center" },
  statNum: { fontFamily: m3.font.mono, fontSize: 18, fontWeight: "700", color: m3.color.onSurface, marginTop: 6 },
  statCap: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 2, textAlign: "center" },
  signalHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  signalFrom: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  signalTo: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "600" },
  signalFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  signalConf: { flex: 1, color: m3.color.tertiary, fontFamily: m3.font.brand },
  rightsCard: { padding: 4 },
  rightsRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: 10 },
  rightsDivider: { borderTopWidth: 1, borderTopColor: m3.color.outlineVariant },
  rightsLabel: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  rightsLabelDanger: { color: m3.color.error, fontFamily: m3.font.brand },
  rightsSub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
});
