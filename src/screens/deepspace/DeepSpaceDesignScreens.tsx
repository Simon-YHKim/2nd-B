import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Line, Path, SvgXml } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/theme/tokens";
import { ddsStyles as styles } from "./dds-styles";
import { canonMore } from "@/lib/canon";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { MdButton, MdCard, MdChip, ProgressLinear, m3TextStyle } from "@/components/m3";
import { TIERS, TIER_PRICE_KRW } from "@/lib/entitlements/tiers";
import { remainingReasoning } from "@/lib/entitlements/reasoning-cap";
import { getReasoningUsage } from "@/lib/entitlements/usage";
import { Text } from "@/components/ui/Text";
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
import { proposeAllRelatedLinks } from "@/lib/wiki/embeddings";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { pickImportFiles } from "@/lib/wiki/capture-file";
import { splitImportNotes, previewTitle } from "@/lib/wiki/import-notes";
import { exportIden } from "@/lib/iden/iden-export";
import { buildIdenDoc } from "@/lib/iden/build-iden";
import { listRecentRecords } from "@/lib/records/create";
import { summarizeWeeklyInsights } from "@/lib/insights/weekly";
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
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 52 }]} keyboardShouldPersistTaps="handled">
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
function Action({ label, value, onPress }: Row) { return <Pressable onPress={onPress} style={styles.action}><Text variant="body" style={styles.actionLabel}>{label}</Text>{value ? <Text variant="body" style={styles.actionValue}>{value}</Text> : <RNText style={styles.chev}>›</RNText>}</Pressable>; }
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
  return <Shell title={t("graph.title")} subtitle={t("graph.subtitle", { nodes: nodeCount, edges: edgeCount })}><SecondbStatusHeader text={t("graph.status")} tip={t("graph.tip")} /><Card style={styles.graphCard}><Svg width="100%" height={310} viewBox="0 0 300 310"><Circle cx={150} cy={160} r={34} fill={colors.soul} opacity={.95} onPress={() => router.push('/account')}/>{clusters.map((c,i)=><Line key={'l'+i} x1={150} y1={160} x2={c.x} y2={c.y} stroke={colors.borderHi} strokeWidth={1.4}/>) }{clusters.map((c,i)=><Circle key={'c'+i} cx={c.x} cy={c.y} r={22} fill={colors.cyan} opacity={.22} onPress={() => router.push(c.route)}/>) }<Circle cx={150} cy={160} r={9} fill={colors.textHi} onPress={() => router.push('/account')}/>{[42,86,118,244,257,188,72].map((x,i)=><Circle key={i} cx={x} cy={70+i*30%190} r={4} fill={colors.cyanSoft} opacity={.75}/>)}</Svg><Text variant="caption" style={styles.centerCaption}>{t("graph.me")}</Text>{clusters.map((c)=><Pressable key={c.t} onPress={() => router.push(c.route)} accessibilityRole="button" accessibilityLabel={c.t} style={{position:'absolute',left:c.x-18,top:c.y+23}}><Text variant="body" style={[styles.clusterLabel,{position:'relative'}]}>{c.t}</Text></Pressable>)}</Card><View style={styles.ctaRow}><Pressable style={styles.primary} onPress={() => router.push('/records')}><Text variant="caption" style={styles.primaryText}>{t("graph.viewClusters")}</Text></Pressable><Pressable style={styles.secondary} onPress={() => router.push('/research')}><Text variant="caption" style={styles.secondaryText}>{t("graph.findConnections")}</Text></Pressable></View></Shell>;
}

// rev2 clone (28-connect / reference ConnectScreen): a windowed 데이터 연동 list.
// Real per-source OAuth is not built yet, so "연결" hands off to the working
// file-import flow (/import-hub); a connected source toggles back off (no dead
// switch). Apple 건강 seeds as 연결됨 to match the capture.
export function DeepSpaceIntegrationsScreen() {
  const { i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const [conn, setConn] = useState<Record<string, boolean>>({ cal: false, health: true, notion: false, photos: false, gpt: false });
  const sources: { id: string; icon: keyof typeof CLONE_ICON; k: string; sub: string }[] = [
    { id: "cal", icon: "forum", k: ko ? "Google 캘린더" : "Google Calendar", sub: ko ? "일정에서 리듬·관계 신호" : "Rhythm and relationship signals from your schedule" },
    { id: "health", icon: "bedtime", k: ko ? "Apple 건강" : "Apple Health", sub: ko ? "수면·활동으로 건강 별" : "Sleep and activity feed the health star" },
    { id: "notion", icon: "book", k: "Notion", sub: ko ? "메모·문서 가져오기" : "Import notes and documents" },
    { id: "photos", icon: "camera", k: ko ? "사진 앨범" : "Photo album", sub: ko ? "장면에서 휴식·관계" : "Rest and relationships from scenes" },
    { id: "gpt", icon: "bubble", k: ko ? "ChatGPT 내보내기" : "ChatGPT export", sub: ko ? "대화 기록 불러오기" : "Bring in your chat history" },
  ];
  const toggle = (id: string) => {
    if (conn[id]) { setConn((s) => ({ ...s, [id]: false })); return; }
    setConn((s) => ({ ...s, [id]: true }));
    router.push("/import-hub");
  };
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={ko ? "데이터 연동" : "Data sync"} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={cx.body} keyboardShouldPersistTaps="handled">
        <RNText style={[m3TextStyle("headlineSmall"), { color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 8 }]}>{ko ? "데이터 연동" : "Data sync"}</RNText>
        <RNText style={[m3TextStyle("bodyMedium"), cx.lead]}>{ko ? "연결하면 별이 더 빨리 밝아져요. 모든 처리는 기기 안에서 먼저 일어나요." : "Connecting brightens your stars faster. All processing happens on your device first."}</RNText>
        <MdCard variant="filled" style={cx.consentCard}>
          <View style={cx.consentRow}>
            <CloneIcon name="lock" color={m3.color.onSecondaryContainer} size={20} />
            <RNText style={[m3TextStyle("bodySmall"), cx.consentText]}>{ko ? "원문은 저장하지 않아요. 도출된 신호만 암호화해 남기고, 언제든 연결을 끊고 지울 수 있어요." : "Raw content is never stored; only derived signals are kept, encrypted, and you can disconnect and erase anytime."}</RNText>
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
                    label={on ? (ko ? "연결됨" : "Connected") : (ko ? "연결" : "Connect")}
                    variant={on ? "tonal" : "filled"}
                    icon={on ? <CloneIcon name="check" color={m3.color.onSecondaryContainer} size={16} /> : undefined}
                    onPress={() => toggle(s.id)}
                    style={cx.connectBtn}
                    accessibilityLabel={ko ? `${s.k} ${on ? "연결됨" : "연결"}` : `${s.k} ${on ? "connected" : "connect"}`}
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

export function DeepSpaceSupportDesignScreen() { const { t } = useTranslation("deepspace"); return <Shell title={t("support.title")}><View style={styles.center}><SecondbHead size={104} mood="positive" /><Text variant="heading" style={styles.prompt}>{t("support.prompt")}</Text></View><Card>{[{label:t("support.askSecondb"),onPress:()=>router.push('/secondb')},{label:t("support.viewManual"),onPress:()=>router.push('/manual')},{label:t("support.emailUs"),onPress:()=>Linking.openURL('mailto:support@2nd-brain.app')},{label:t("support.reportBug"),onPress:()=>Linking.openURL('mailto:support@2nd-brain.app?subject=Bug%20report')}].map((r)=><Action key={r.label} {...r}/>)}</Card><Text variant="subtle" style={styles.footer}>{t("support.footer")}</Text></Shell>; }

export function DeepSpaceAccountDesignScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
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
          <Action label={ko ? "프로필" : "Profile"} onPress={() => router.push("/profile")} />
          <Action label={ko ? "설정" : "Settings"} onPress={() => router.push("/settings")} />
          <Action label={ko ? "내 데이터" : "My data"} onPress={() => router.push("/data")} />
          <Action label="IDEN" onPress={() => router.push("/iden")} />
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
      if (!cancelled) setRecOn(p.recommendations === true);
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

  return (
    <Shell title={t("privacy.title")}>
      <SecondbStatusHeader text={t("privacy.status")} tip={t("privacy.tip")} />
      <Text variant="body" style={styles.lead}>{t("privacy.lead")}</Text>
      <Card>
        <Toggle label={t("privacy.toggleAnalysis")} value={t("privacy.on")} />
        <Toggle label={t("privacy.toggleStats")} value={t("privacy.off")} on={false} />
        <Toggle label={t("privacy.toggleLock")} value={t("privacy.on")} />
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
            {ko ? "이번 주 데이터를 불러오지 못했어요." : "Could not load this week's data."}
          </Text>
          <Pressable
            style={styles.primary}
            onPress={() => setReloadKey((k) => k + 1)}
            accessibilityRole="button"
            accessibilityLabel={ko ? "다시 시도" : "Try again"}
          >
            <Text variant="caption" style={styles.primaryText}>{ko ? "다시 시도" : "Try again"}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  // 3) Empty / first-week state — no prior week to compare against yet.
  if (summary.isFirstWeek) {
    return (
      <Shell title={t("insights.title")}>
        <SecondbStatusHeader text={t("insights.status")} tip={t("insights.tip")} mood="neutral" />
        <View style={styles.wikiPageOpen}>
          <Text variant="body" style={styles.wikiBody}>
            {ko
              ? "한 주만 채우면 지난주와 이번주를 비교해 드릴게요."
              : "Fill one week and I'll compare this week with last week."}
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
        ? (ko ? `▼ ${Math.abs(summary.deltaPct)}% 적게 저장` : `▼ ${Math.abs(summary.deltaPct)}% less saved`)
        : (ko ? "지난주와 같은 양" : "Same as last week");

  return (
    <Shell title={t("insights.title")}>
      <SecondbStatusHeader text={t("insights.status")} tip={t("insights.tip")} mood="positive" />
      <Pressable
        onPress={() => router.push("/records")}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
        accessibilityRole="button"
        accessibilityLabel={t("insights.sectionNow")}
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
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
        accessibilityRole="button"
        accessibilityLabel={t("insights.sectionFinding")}
      >
        <Card>
          <Text variant="heading" style={styles.section}>{t("insights.sectionFinding")}</Text>
          <Text variant="body" style={styles.lead}>{t("insights.finding")}</Text>
        </Card>
      </Pressable>
    </Shell>
  );
}

// rev2 clone (30-datareview / reference DataReviewScreen): a windowed 내 데이터
// 리뷰. Stored-data tallies, the derived-signal ledger (열람·삭제권), and the
// 내 권리 rights rows. 근거 opens the real ratifications receipt; 삭제 drops the
// signal from view; the rights rows route to the real export/erase surfaces.
export function DeepSpaceDataDesignScreen() {
  const { i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const stores: { icon: keyof typeof CLONE_ICON; label: string; n: string; tone: string }[] = [
    { icon: "box", label: ko ? "원문 조각" : "Raw pieces", n: ko ? "124개" : "124", tone: m3.color.primary },
    { icon: "hub", label: ko ? "파생 신호" : "Derived signals", n: ko ? "38개" : "38", tone: m3.color.tertiary },
    { icon: "cloud_sync", label: ko ? "연동 캐시" : "Sync cache", n: "2.4MB", tone: m3.color.secondary },
  ];
  const [signals, setSignals] = useState([
    { id: "s1", from: ko ? "통화·메모 12건" : "12 calls and notes", to: ko ? "먼저 다가가는 성향 (관계)" : "Reaches out first (relationships)", conf: ko ? "확신 52%" : "52% confidence" },
    { id: "s2", from: ko ? "캘린더 야간 일정" : "Late calendar events", to: ko ? "수면 리듬 불규칙 (건강)" : "Irregular sleep rhythm (health)", conf: ko ? "확신 41%" : "41% confidence" },
    { id: "s3", from: ko ? "독서 메모 8건" : "8 reading notes", to: ko ? "개방성 높음 (성장)" : "High openness (growth)", conf: ko ? "확신 63%" : "63% confidence" },
  ]);
  const rights: { icon: keyof typeof CLONE_ICON; label: string; sub: string; route: string; danger?: boolean }[] = [
    { icon: "download", label: ko ? "내 데이터 전체 내보내기" : "Export all my data", sub: ko ? "IDEN · 원문 · 파생 신호" : "IDEN, raw, derived signals", route: "/iden" },
    { icon: "cloud_off", label: ko ? "파생 신호만 초기화" : "Reset derived signals only", sub: ko ? "원문은 두고 추정만 지우기" : "Keep raw, clear inferences", route: "/privacy" },
    { icon: "trash", label: ko ? "계정·데이터 영구 삭제" : "Delete account and data", sub: ko ? "되돌릴 수 없어요" : "This cannot be undone", route: "/privacy", danger: true },
  ];
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={ko ? "내 데이터 리뷰" : "My data review"} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={cx.body} keyboardShouldPersistTaps="handled">
        <RNText style={[m3TextStyle("bodyMedium"), cx.lead]}>{ko ? "내 데이터가 어떻게 쓰이는지 전부 보여줘요. 무엇이든 열람하고 지울 수 있어요." : "I show exactly how your data is used. You can open and delete anything."}</RNText>

        <View style={cx.statGrid}>
          {stores.map((s) => (
            <MdCard key={s.label} variant="filled" style={cx.statCard}>
              <CloneIcon name={s.icon} color={s.tone} size={20} />
              <RNText style={cx.statNum}>{s.n}</RNText>
              <RNText style={[m3TextStyle("labelSmall"), cx.statCap]}>{s.label}</RNText>
            </MdCard>
          ))}
        </View>

        <RNText style={[m3TextStyle("titleSmall"), cx.sectionLabel]}>{ko ? "파생 신호 · 무엇을 추정했나" : "Derived signals · what was inferred"}</RNText>
        <View style={cx.stack8}>
          {signals.map((sg) => (
            <MdCard key={sg.id} variant="outlined" style={cx.sourceCard}>
              <View style={cx.signalHead}>
                <RNText style={[m3TextStyle("bodySmall"), cx.signalFrom]}>{sg.from}</RNText>
                <CloneIcon name="arrow_forward" color={m3.color.outline} size={14} />
                <RNText style={[m3TextStyle("bodyMedium"), cx.signalTo]}>{sg.to}</RNText>
              </View>
              <View style={cx.signalFoot}>
                <RNText style={[m3TextStyle("labelSmall"), cx.signalConf]}>{sg.conf}</RNText>
                <MdButton label={ko ? "근거" : "Evidence"} variant="text" onPress={() => router.push("/ratifications")} style={cx.smallBtnCompact} />
                <MdButton
                  label={ko ? "삭제" : "Delete"}
                  variant="text"
                  icon={<CloneIcon name="trash" color={m3.color.error} size={16} />}
                  onPress={() => setSignals((xs) => xs.filter((x) => x.id !== sg.id))}
                  style={cx.smallBtnCompact}
                  accessibilityLabel={ko ? `${sg.to} 파생 신호 삭제` : `Delete derived signal ${sg.to}`}
                />
              </View>
            </MdCard>
          ))}
        </View>

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

export function DeepSpaceThemeScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("theme.title")}>
      <SecondbStatusHeader text={t("theme.status")} tip={t("theme.tip")} />
      <Card>
        <Text variant="heading" style={styles.section}>{t("theme.sectionTheme")}</Text>
        <View style={styles.action}><Text variant="body" style={styles.actionLabel}>{t("theme.themeDeepspace")}</Text><Text variant="body" style={styles.actionValue}>✓</Text></View>
        <View style={styles.action}><Text variant="body" style={styles.actionLabel}>{t("theme.themeMidnight")}</Text></View>
      </Card>
      <Card>
        <Text variant="heading" style={styles.section}>{t("theme.sectionFont")}</Text>
        <View style={styles.action}><Text variant="body" style={styles.actionLabel}>{t("theme.fontPixel")}</Text><Text variant="body" style={styles.actionValue}>✓</Text></View>
        <View style={styles.action}><Text variant="body" style={styles.actionLabel}>{t("theme.fontReadable")}</Text></View>
      </Card>
      <Card>
        <Text variant="heading" style={styles.section}>{t("theme.sectionSize")}</Text>
        <View style={styles.sizeRow}>
          <Text variant="subtle" style={styles.sizeCap}>{t("theme.small")}</Text>
          <View style={styles.sizeTrack}><View style={styles.sizeKnob} /></View>
          <Text variant="body" style={styles.sizeCapLg}>{t("theme.large")}</Text>
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
    </Shell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
export { DeepSpacePlansScreen } from "./dds-plans-screen";

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
      <Pressable style={styles.primary} onPress={() => router.back()}><Text variant="caption" style={styles.primaryText}>{t("permissions.continue")}</Text></Pressable>
    </Shell>
  );
}

export function DeepSpaceDiscoverScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("discover.title")}>
      <SecondbStatusHeader text={t("discover.status")} tip={t("discover.tip")} mood="positive" />
      <Text variant="body" style={styles.lead}>{t("discover.lead")}</Text>
      <Pressable
        onPress={() => router.push("/attachment")}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
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
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
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
        setResult(locale === "ko" ? "지금은 제안할 변화가 없어요." : "No change to propose right now.");
      }
    } catch {
      setResult(locale === "ko" ? "제안을 불러오지 못했어요. 다시 시도해 주세요." : "Couldn't load a proposal. Try again.");
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
        ? locale === "ko"
          ? `승인됐어요. 실행가능(L${r.resultingLevel})으로 올라갔어요.`
          : `Ratified. Moved to actionable (L${r.resultingLevel}).`
        : locale === "ko"
          ? "이번엔 그대로 둘게요."
          : "Left as is for now.",
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
        accessibilityLabel={locale === "ko" ? "제안 받기" : "Get a proposal"}
      >
        <Text variant="caption" style={styles.primaryText}>
          {loading ? (locale === "ko" ? "불러오는 중…" : "Loading…") : locale === "ko" ? "제안 받기" : "Get a proposal"}
        </Text>
      </Pressable>
      {result ? <Text variant="subtle" style={styles.footer}>{result}</Text> : null}
      {receipts.length > 0 ? (
        <Card>
          <Text variant="heading" style={styles.section}>
            {locale === "ko" ? "이 제안의 근거가 된 기록" : "The records behind this"}
          </Text>
          <Text variant="body" style={styles.planFeatDim}>
            {locale === "ko" ? "탭하면 원본 기록을 직접 확인할 수 있어요." : "Tap to check the original record yourself."}
          </Text>
          <View style={styles.topicCol}>
            {receipts.map((ev) => (
              <Pressable
                key={ev.id}
                style={styles.topicRow}
                onPress={() => router.push({ pathname: "/record/[id]", params: { id: ev.id } })}
                accessibilityRole="button"
                accessibilityLabel={locale === "ko" ? `${ev.title} 기록 열기` : `Open record ${ev.title}`}
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
      setAnnounce(i18n.language === "ko" ? "연결을 확인했어요." : "Connection confirmed.");
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
      setAnnounce(i18n.language === "ko" ? "제안을 보류했어요." : "Suggestion dismissed.");
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
      <SecondbStatusHeader text={headerText} tip={t("research.tip")} mood="positive" />
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
              style={({ pressed }) => [styles.insightViolet, pressed ? { opacity: 0.6 } : null]}
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
              style={({ pressed }) => [styles.insightViolet, pressed ? { opacity: 0.6 } : null]}
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
                    style={({ pressed }) => [styles.mapRow, { minHeight: 44 }, pressed ? { opacity: 0.6 } : null]}
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
        title={i18n.language === "ko" ? "오늘의 비서" : "Today's assistant"}
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

  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  // Hero ring is driven by the REAL today list (not the reference mock counts).
  const totalR = todayRoutines.length;
  const doneR = todayRoutines.filter((r) => completedIds.has(r.id)).length;
  const pct = totalR > 0 ? doneR / totalR : 0;
  const HERO_R = 22;
  const HERO_C = 2 * Math.PI * HERO_R;
  const opsTools: { icon: keyof typeof CLONE_ICON; label: string; sub: string; route: string }[] = [
    { icon: "timer", label: ko ? "일일 집중" : "Daily focus", sub: ko ? "포모도로" : "Pomodoro", route: "/focus" },
    { icon: "schedule", label: ko ? "예약 리마인더" : "Reminders", sub: ko ? "알림 일정" : "Scheduled", route: "/reminders" },
    { icon: "lightbulb", label: ko ? "공상하기" : "Imagine", sub: ko ? "멀리 던지기" : "Throw far", route: "/imagine" },
    { icon: "share", label: ko ? "공유 카드" : "Share card", sub: ko ? "1080 카드" : "1080 card", route: "/share-card" },
  ];

  return (
    // Primary "비서" hub: render inside the persistent deep-space chrome so the
    // rev2 windowed sub-screen: the M3 top app bar carries TITLES verbatim
    // (오늘의 비서). The reference OpsScreen leads with the routine ring hero.
    <DeepSpaceScreen
      active="ops"
      header="none"
      variant="windowed"
      title={ko ? "오늘의 비서" : "Today's assistant"}
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
            <RNText style={[m3TextStyle("labelMedium"), cx.heroLabel]}>{ko ? "오늘의 루틴" : "Today's routines"}</RNText>
            <RNText style={[m3TextStyle("headlineSmall"), cx.heroCount]}>{ko ? `${doneR} / ${totalR} 완료` : `${doneR} / ${totalR} done`}</RNText>
          </View>
          {streak > 0 ? (
            <View style={cx.heroStreak}>
              <View style={cx.heroStreakRow}>
                <CloneIcon name="fire" color={m3.accent.alertDot} size={22} fill />
                <RNText style={cx.heroStreakNum}>{streak}</RNText>
              </View>
              <RNText style={[m3TextStyle("labelSmall"), cx.heroStreakCap]}>{ko ? "일 연속" : "day streak"}</RNText>
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
            <RNText style={[m3TextStyle("bodyLarge"), cx.analysisTitle]}>{ko ? "이번 주 패턴 분석" : "This week's patterns"}</RNText>
            <RNText style={[m3TextStyle("bodySmall"), cx.analysisSub]}>{ko ? "분석은 백그라운드로 돌아요. 계속 써도 돼요." : "Analysis runs in the background. Keep using the app."}</RNText>
          </View>
          <MdButton label={ko ? "돌리기" : "Run"} variant="tonal" onPress={() => router.push("/insights")} style={cx.smallBtnCompact} />
        </View>
      </MdCard>

      {/* 오늘의 종합 의견 — the real recommendation engine (C9 classifier + the
          C1/C3 LLM gateway inside recommendForDomain). Reference-app leads this
          section with a 세컨비 head + the "one important thing" framing. */}
      <RNText style={[m3TextStyle("labelSmall"), cx.eyebrow]}>{ko ? "오늘의 종합 의견" : "TODAY'S TAKE"}</RNText>
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
      <RNText style={[m3TextStyle("titleSmall"), cx.sectionLabel]}>{ko ? "비서 도구" : "Assistant tools"}</RNText>
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
const FOCUS_STARS_EN = ["Growth", "Career", "Learning", "Relations", "Health"];

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
  const ringSub = idle ? (ko ? "준비됨" : "Ready") : timer.running ? (ko ? "집중 중" : "Focusing") : (ko ? "일시정지" : "Paused");
  const starName = ko ? FOCUS_STARS[starIdx] : FOCUS_STARS_EN[starIdx];
  const target = 4;
  const filled = Math.min(doneToday, target);
  const setPreset = (m: number) => setTimer(createPomodoro({ ...timer.config, focusMinutes: m }));

  return (
    <DockShell title={t("focus.title")}>
      <RNText style={[m3TextStyle("bodyMedium"), cx.focusLead]}>
        {ko ? "한 가지에만 집중하는 시간이에요. 끝나면 " : "Time to focus on one thing. When it ends, one step toward your "}
        <RNText style={cx.leadStrong}>{ko ? `${starName} 별` : `${starName} star`}</RNText>
        {ko ? "에 한 걸음." : "."}
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
              label={ko ? `${m}분` : `${m} min`}
              icon={on ? <CloneIcon name="check" color={m3.color.onSecondaryContainer} size={16} /> : undefined}
              onPress={() => setPreset(m)}
            />
          );
        })}
      </View>

      {/* controls */}
      <View style={cx.controlsRow}>
        <MdButton
          label={timer.running ? (ko ? "일시정지" : "Pause") : (ko ? "집중 시작" : "Start focus")}
          variant={timer.running ? "tonal" : "filled"}
          icon={<CloneIcon name={timer.running ? "timer" : "sparkle"} color={timer.running ? m3.color.onSecondaryContainer : m3.color.onPrimary} size={18} />}
          onPress={() => setTimer((s) => (s.running ? pause(s) : start(s)))}
          style={{ flex: 2 }}
        />
        <MdButton
          label={ko ? "리셋" : "Reset"}
          variant="outlined"
          icon={<CloneIcon name="refresh" color={m3.color.primary} size={18} />}
          onPress={() => setTimer((s) => reset(s))}
          style={{ flex: 1 }}
        />
      </View>

      {/* linked star */}
      <RNText style={[m3TextStyle("titleSmall"), cx.sectionLabel]}>{ko ? "어떤 별을 위해?" : "For which star?"}</RNText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cx.chipScroll}>
        {(ko ? FOCUS_STARS : FOCUS_STARS_EN).map((s, i) => (
          <MdChip
            key={s}
            kind="filter"
            selected={starIdx === i}
            label={s}
            icon={<CloneIcon name="sparkle" color={starIdx === i ? m3.color.onSecondaryContainer : m3.color.onSurfaceVariant} size={15} />}
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
          <RNText style={[m3TextStyle("bodyLarge"), cx.summaryTitle]}>{ko ? `오늘 ${doneToday}회 집중` : `${doneToday} focus sessions today`}</RNText>
          <RNText style={[m3TextStyle("bodySmall"), cx.summarySub]}>{ko ? `약 ${doneToday * focusMin}분 · 목표 ${target}회` : `About ${doneToday * focusMin} min · goal ${target}`}</RNText>
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
          />
          <Text variant="caption" pixelEn style={styles.authLabel}>{t("srs.backLabel")}</Text>
          <TextInput
            style={styles.input}
            value={back}
            onChangeText={setBack}
            placeholder={t("srs.backPlaceholder")}
            placeholderTextColor={colors.textLo}
            accessibilityLabel={t("srs.backLabel")}
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
          <SecondbHead size={104} mood="positive" />
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
