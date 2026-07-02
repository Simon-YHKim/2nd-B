import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/theme/tokens";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { parseStructured } from "@/lib/capture/structured";
import { TIERS, TIER_PRICE_KRW } from "@/lib/entitlements/tiers";
import { remainingReasoning } from "@/lib/entitlements/reasoning-cap";
import { getReasoningUsage } from "@/lib/entitlements/usage";
import { fontFamilies } from "@/theme/typography";
import { Text } from "@/components/ui/Text";
import { DeepSpaceLoader, SecondbHead, SecondbStatusHeader } from "@/components/deepspace";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { WikiGraph } from "@/components/deep-space/WikiGraph";
import { SegBtn } from "@/components/m3";
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
  phaseJustChanged,
  reset,
  skipPhase,
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
import { deleteRecord, getRecordById, listRecentRecords } from "@/lib/records/create";
import { summarizeWeeklyInsights } from "@/lib/insights/weekly";
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

export function DeepSpaceIntegrationsScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  // Notion starts "connected" in the mock; Obsidian disconnected. These drive a
  // real disconnect affordance instead of a dead toggle. Real per-source OAuth is
  // not built yet, so connect routes to the working file-import flow (/import-hub).
  const [notionOn, setNotionOn] = useState(true);
  const [obsidianOn, setObsidianOn] = useState(false);
  return (
    <Shell title={t("integrations.title")}>
      <SecondbStatusHeader text={t("integrations.status")} tip={t("integrations.tip")} />
      <Card>
        <Text variant="heading" style={styles.section}>{t("integrations.sectionAssistant")}</Text>
        {/* These are NOT live connections. They hand off to IDEN export. Label
            honestly rather than implying a pending OAuth link. */}
        {["ChatGPT", "Claude", "Gemini"].map((x) => (
          <Action key={x} label={x} value={ko ? "IDEN으로 내보내기" : "Export to IDEN"} onPress={() => router.push("/iden")} />
        ))}
      </Card>
      <Card>
        <Text variant="heading" style={styles.section}>{t("integrations.sectionSources")}</Text>
        <Toggle
          label="Notion"
          value={t("integrations.notionValue")}
          on={notionOn}
          onPress={() => (notionOn ? setNotionOn(false) : router.push("/import-hub"))}
        />
        {notionOn ? (
          <Action label={ko ? "Notion 연결 해제" : "Disconnect Notion"} onPress={() => setNotionOn(false)} />
        ) : null}
        <Toggle
          label="Obsidian"
          value={t("integrations.obsidianValue")}
          on={obsidianOn}
          onPress={() => (obsidianOn ? setObsidianOn(false) : router.push("/import-hub"))}
        />
        {obsidianOn ? (
          <Action label={ko ? "Obsidian 연결 해제" : "Disconnect Obsidian"} onPress={() => setObsidianOn(false)} />
        ) : null}
        <Toggle label={t("integrations.healthLabel")} value={t("integrations.permissionNeeded")} on={false} onPress={() => router.push("/import-hub")} />
      </Card>
      <Text variant="subtle" style={styles.footer}>{t("integrations.footer")}</Text>
    </Shell>
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

// Keyboard-aware shell for the auth screens (sign-in / sign-up / reset). The
// generic Shell above is for in-app graph screens and has no keyboard handling;
// auth forms need KeyboardAvoidingView + scroll padding (ANDROID_QA_GUIDELINES).
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.stars}>
        <View style={[styles.star, { left: "12%", top: 42 }]} />
        <View style={[styles.star, { right: "18%", top: 118, opacity: 0.55 }]} />
        <View style={[styles.star, { left: "42%", bottom: 92, opacity: 0.5 }]} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function AuthToast({ message, tone }: { message: string; tone: "info" | "success" | "danger" }) {
  const toneStyle =
    tone === "success" ? styles.authToastSuccess : tone === "danger" ? styles.authToastDanger : styles.authToastInfo;
  return (
    <View style={styles.authToastWrap} pointerEvents="none">
      <View style={[styles.authToast, toneStyle]} accessibilityRole="alert">
        <Text variant="body" style={styles.authToastText}>{message}</Text>
      </View>
    </View>
  );
}

// Per-provider button label keys live in the auth namespace (full C7 parity),
// reused by both the legacy and deep-space presentations.
const PROVIDER_SIGNIN_KEY: Record<OAuthProvider, string> = {
  google: "auth:signIn.continueWithGoogle",
  apple: "auth:signIn.continueWithApple",
  kakao: "auth:signIn.continueWithKakao",
  facebook: "auth:signIn.continueWithFacebook",
  github: "auth:signIn.continueWithGithub",
};
const PROVIDER_SIGNUP_KEY: Record<OAuthProvider, string> = {
  google: "auth:signUp.continueWithGoogle",
  apple: "auth:signUp.continueWithApple",
  kakao: "auth:signUp.continueWithKakao",
  facebook: "auth:signUp.continueWithFacebook",
  github: "auth:signUp.continueWithGithub",
};
// Per-provider mark shown before the label (design: a bold "G" glyph, not an
// emoji or pill chip). Empty string = no badge (e.g. Apple, whose glyph is not
// portable across platforms; it stays label-only).
const PROVIDER_BADGE: Record<OAuthProvider, string> = {
  google: "G",
  apple: "",
  kakao: "K",
  facebook: "f",
  github: "GH",
};

export function DeepSpaceSignInDesignScreen() {
  const { t, i18n } = useTranslation(["deepspace", "auth", "common"]);
  const {
    userId,
    loading,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    submitting,
    oauthSubmitting,
    canSubmit,
    toast,
    resetHelpVisible,
    resetSubmitting,
    resetEmailSentTo,
    visibleProviders,
    naverEnabled,
    handleSubmit,
    handleOAuth,
    handleNaver,
    handleForgotPassword,
  } = useSignInForm();
  const passwordRef = useRef<TextInput>(null);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }
  if (userId) return <Redirect href="/" />;

  return (
    <AuthShell>
      <View style={styles.authHero}>
        <SecondbHead size={132} mood="positive" />
        <Text variant="heading" style={styles.big}>{t("deepspace:auth.appName")}</Text>
        <Text variant="body" style={styles.lead}>{t("deepspace:auth.signInLead")}</Text>
      </View>
      <Card>
        <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:signIn.email")}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="email@example.com"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signIn.email")}
          style={styles.input}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <View style={styles.authLabelRow}>
          <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:signIn.password")}</Text>
          <Pressable
            onPress={toggleShowPassword}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? t("auth:signIn.hidePasswordLabel") : t("auth:signIn.showPasswordLabel")}
            accessibilityState={{ selected: showPassword }}
            style={styles.eyeBtn}
          >
            <Text variant="body" style={styles.eyeText}>{showPassword ? t("auth:signIn.hidePasswordLabel") : t("auth:signIn.showPasswordLabel")}</Text>
          </Pressable>
        </View>
        <TextInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoComplete="current-password"
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signIn.password")}
          style={styles.input}
          returnKeyType="go"
          onSubmitEditing={() => {
            if (canSubmit) void handleSubmit();
          }}
        />
        <Pressable
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          style={[styles.primary, !canSubmit && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t("auth:signIn.submit")}
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
        >
          <Text variant="caption" style={styles.primaryText}>{submitting ? t("auth:signIn.submitting") : t("auth:signIn.submit")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/sign-up")} style={styles.authLinkRow} accessibilityRole="link" accessibilityLabel={t("auth:signIn.signUpLink")}>
          <Text variant="body" style={styles.link}>{t("deepspace:auth.noAccount")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/jot")} style={styles.authLinkRow} accessibilityRole="link" accessibilityLabel={i18n.language === "ko" ? "먼저 한 줄 적어보기" : "Jot a line first"}>
          <Text variant="body" style={styles.link}>{i18n.language === "ko" ? "먼저 한 줄 적어보기" : "Jot a line first"}</Text>
        </Pressable>

        {visibleProviders.length > 0 || naverEnabled ? (
          <View style={styles.authDividerRow}>
            <View style={styles.authDividerLine} />
            <Text variant="caption" pixelEn style={styles.authDividerLabel}>{t("deepspace:auth.or")}</Text>
            <View style={styles.authDividerLine} />
          </View>
        ) : null}

        {visibleProviders.map((provider) => (
          <Pressable
            key={provider}
            onPress={() => void handleOAuth(provider)}
            disabled={oauthSubmitting || submitting}
            style={[styles.providerBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t(PROVIDER_SIGNIN_KEY[provider])}
            accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
          >
            <View style={styles.providerRow}>
              {PROVIDER_BADGE[provider] ? <Text style={styles.providerBadge}>{PROVIDER_BADGE[provider]}</Text> : null}
              <Text variant="caption" style={styles.providerBtnText}>{oauthSubmitting ? "…" : t(PROVIDER_SIGNIN_KEY[provider])}</Text>
            </View>
          </Pressable>
        ))}
        {naverEnabled ? (
          <Pressable
            onPress={handleNaver}
            disabled={oauthSubmitting || submitting}
            style={[styles.providerBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t("auth:signIn.continueWithNaver")}
          >
            <Text variant="caption" style={styles.providerBtnText}>{t("auth:signIn.continueWithNaver")}</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => void handleForgotPassword()}
          disabled={resetSubmitting}
          hitSlop={14}
          style={[styles.authForgotRow, resetSubmitting && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t("auth:signIn.resetLabel")}
          accessibilityState={{ disabled: resetSubmitting, busy: resetSubmitting }}
        >
          <Text variant="body" style={styles.authHelper}>{resetSubmitting ? t("auth:signIn.resetSending") : t("deepspace:auth.forgotPassword")}</Text>
        </Pressable>

        {resetHelpVisible ? (
          <View style={styles.authHelpCard} accessibilityRole="alert">
            <Text variant="heading" style={styles.authHelpTitle}>{resetEmailSentTo ? t("auth:signIn.resetSentTitle") : t("auth:signIn.resetTitle")}</Text>
            <Text variant="body" style={styles.authHelpBody}>
              {resetEmailSentTo ? t("auth:signIn.resetSentBody", { email: resetEmailSentTo }) : t("auth:signIn.resetBody")}
            </Text>
          </View>
        ) : null}
      </Card>
      {toast ? <AuthToast message={toast.message} tone={toast.tone} /> : null}
    </AuthShell>
  );
}

// Deep-space consent block: drives the SAME ConsentSelections state + helpers the
// legacy ConsentNotice uses, so the C10 ledger (buildSignUpConsentArgs in the
// hook) is byte-for-byte equivalent. Copy comes from the reviewed `consent`
// namespace (notice.*). Styling is deep-space tokens only.
function ConsentCheckRow({ checked, label, emphasize, onToggle }: { checked: boolean; label: string; emphasize?: boolean; onToggle: () => void }) {
  return (
    <Pressable
      style={styles.consentRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View style={[styles.consentCheckbox, checked && styles.consentCheckboxOn]}>
        {checked ? <RNText style={styles.consentCheckmark}>✓</RNText> : null}
      </View>
      <Text variant="body" style={[styles.consentLabel, emphasize && { color: colors.textTitle }]}>{label}</Text>
    </Pressable>
  );
}

function DeepSpaceConsentBlock({ minor, value, onChange }: { minor: boolean; value: ConsentSelections; onChange: (next: ConsentSelections) => void }) {
  const { t } = useTranslation("consent");
  const allChecked = allRequiredAcksChecked(value);
  const toggle = (key: keyof ConsentSelections) => onChange({ ...value, [key]: !value[key] });
  return (
    <Card>
      <Text variant="heading" style={styles.section}>{t("notice.title")}</Text>
      <Text variant="body" style={styles.consentIntro}>{t("notice.intro")}</Text>
      {minor ? (
        <View style={styles.minorBanner}>
          <Text variant="body" style={styles.minorBannerText}>{t("notice.minorBanner")}</Text>
        </View>
      ) : null}
      <Text variant="caption" pixelEn style={styles.consentGroupLabel}>{t("notice.requiredLabel")}</Text>
      <ConsentCheckRow checked={allChecked} label={t("notice.agreeAll")} emphasize onToggle={() => onChange(setAllRequiredAcks(value, !allChecked))} />
      <View style={styles.consentDivider} />
      <ConsentCheckRow checked={value.service} label={t("notice.ackService")} onToggle={() => toggle("service")} />
      <ConsentCheckRow checked={value.llmProcessing} label={t("notice.ackLlm")} onToggle={() => toggle("llmProcessing")} />
      <ConsentCheckRow checked={value.overseasTransfer} label={t("notice.ackOverseas")} onToggle={() => toggle("overseasTransfer")} />
      <ConsentCheckRow checked={value.sensitiveData} label={t("notice.ackSensitive")} onToggle={() => toggle("sensitiveData")} />
      <Text variant="caption" pixelEn style={styles.consentGroupLabel}>{t("notice.optionalLabel")}</Text>
      <ConsentCheckRow checked={value.marketing} label={t("notice.optMarketing")} onToggle={() => toggle("marketing")} />
    </Card>
  );
}

export function DeepSpaceSignUpDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common"]);
  const {
    userId,
    loading,
    submitting,
    judgeWelcome,
    toast,
    email,
    setEmail,
    password,
    setPassword,
    birthDate,
    setBirthDate,
    consent,
    setConsent,
    isMinorAge,
    canSubmit,
    oauthSubmitting,
    existingAccountHelp,
    visibleProviders,
    naverEnabled,
    handleSubmit,
    handleOAuth,
    handleNaver,
  } = useSignUpForm();
  const passwordRef = useRef<TextInput>(null);
  const birthDateRef = useRef<TextInput>(null);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }
  if (userId && !submitting && !judgeWelcome && !toast) return <Redirect href="/" />;

  const birthOk = ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE;
  const showChecklist = email.length > 0 || password.length > 0 || birthDate.length > 0;

  return (
    <AuthShell>
      <View style={styles.authHero}>
        <SecondbHead size={120} mood="neutral" />
        <Text variant="heading" style={styles.big}>{t("deepspace:auth.signUpTitle")}</Text>
        <Text variant="body" style={styles.lead}>{t("deepspace:auth.signUpLead")}</Text>
        <Text variant="body" style={styles.authHelper}>{t("deepspace:auth.ageNotice")}</Text>
      </View>
      <Card>
        <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:signUp.email")}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="email@example.com"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signUp.email")}
          style={styles.input}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:signUp.password")}</Text>
        <TextInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="••••••••"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signUp.password")}
          style={styles.input}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => birthDateRef.current?.focus()}
        />
        <Text variant="body" style={styles.authHelper}>{t("auth:signUp.passwordHelper")}</Text>
        <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:signUp.birthDate")}</Text>
        <TextInput
          ref={birthDateRef}
          value={birthDate}
          onChangeText={(next) => setBirthDate(formatBirthDateInput(next))}
          autoCapitalize="none"
          keyboardType="number-pad"
          maxLength={10}
          placeholder="2010-03-15"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signUp.birthDate")}
          accessibilityHint={t("auth:signUp.birthDateHelper")}
          style={styles.input}
          returnKeyType="done"
        />
        <Text variant="body" style={styles.authHelper}>{t("auth:signUp.birthDateHelper")}</Text>

        {showChecklist ? (
          <View style={{ gap: 6 }}>
            <View style={styles.checklistRow}>
              <View style={[styles.checklistDot, { backgroundColor: email.includes("@") ? colors.mint : colors.textLo }]} />
              <Text variant="body" style={[styles.checklistText, { color: email.includes("@") ? colors.mint : colors.textMid }]}>
                {email.includes("@") ? t("auth:signUp.checkEmail") : t("auth:signUp.checkEmailMissing")}
              </Text>
            </View>
            <View style={styles.checklistRow}>
              <View style={[styles.checklistDot, { backgroundColor: password.length >= 8 ? colors.mint : colors.textLo }]} />
              <Text variant="body" style={[styles.checklistText, { color: password.length >= 8 ? colors.mint : colors.textMid }]}>
                {password.length >= 8 ? t("auth:signUp.checkPassword") : t("auth:signUp.checkPasswordShort")}
              </Text>
            </View>
            <View style={styles.checklistRow}>
              <View style={[styles.checklistDot, { backgroundColor: birthOk ? colors.mint : colors.textLo }]} />
              <Text variant="body" style={[styles.checklistText, { color: birthOk ? colors.mint : colors.textMid }]}>
                {birthOk ? t("auth:signUp.checkAge") : t("auth:signUp.checkAgeBlocked")}
              </Text>
            </View>
          </View>
        ) : null}
      </Card>

      <DeepSpaceConsentBlock minor={isMinorAge} value={consent} onChange={setConsent} />

      {existingAccountHelp ? (
        <View style={styles.authHelpCard} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text variant="heading" style={styles.authHelpTitle}>{t("auth:signUp.existingAccountTitle")}</Text>
          <Text variant="body" style={styles.authHelpBody}>{t("auth:signUp.existingAccountBody")}</Text>
          <Pressable style={styles.providerBtn} onPress={() => router.push("/sign-in")} accessibilityRole="button" accessibilityLabel={t("auth:signUp.existingAccountSignIn")}>
            <Text variant="caption" style={styles.providerBtnText}>{t("auth:signUp.existingAccountSignIn")}</Text>
          </Pressable>
        </View>
      ) : null}

      <Card>
        {visibleProviders.length > 0 || naverEnabled ? (
          <View style={styles.authDividerRow}>
            <View style={styles.authDividerLine} />
            <Text variant="caption" pixelEn style={styles.authDividerLabel}>{t("deepspace:auth.or")}</Text>
            <View style={styles.authDividerLine} />
          </View>
        ) : null}
        {visibleProviders.map((provider) => (
          <Pressable
            key={provider}
            onPress={() => void handleOAuth(provider)}
            disabled={oauthSubmitting || submitting}
            style={[styles.providerBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t(PROVIDER_SIGNUP_KEY[provider])}
            accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
          >
            <View style={styles.providerRow}>
              {PROVIDER_BADGE[provider] ? <Text style={styles.providerBadge}>{PROVIDER_BADGE[provider]}</Text> : null}
              <Text variant="caption" style={styles.providerBtnText}>{t(PROVIDER_SIGNUP_KEY[provider])}</Text>
            </View>
          </Pressable>
        ))}
        {naverEnabled ? (
          <Pressable
            onPress={handleNaver}
            disabled={oauthSubmitting || submitting}
            style={[styles.providerBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t("auth:signUp.continueWithNaver")}
          >
            <Text variant="caption" style={styles.providerBtnText}>{t("auth:signUp.continueWithNaver")}</Text>
          </Pressable>
        ) : null}
      </Card>

      <Pressable
        onPress={() => void handleSubmit()}
        disabled={!canSubmit}
        style={[styles.primary, !canSubmit && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={t("auth:signUp.submit")}
        accessibilityState={{ disabled: !canSubmit, busy: submitting }}
      >
        <Text variant="caption" style={styles.primaryText}>{t("auth:signUp.submit")}</Text>
      </Pressable>

      <Pressable onPress={() => router.push("/sign-in")} style={styles.authLinkRow} accessibilityRole="link" accessibilityLabel={t("auth:signUp.signInLink")}>
        <Text variant="body" style={styles.link}>{t("deepspace:auth.haveAccount")}</Text>
      </Pressable>
      {toast ? <AuthToast message={toast.message} tone={toast.tone} /> : null}
    </AuthShell>
  );
}

export function DeepSpaceResetPasswordDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common"]);
  const {
    userId,
    loading,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    submitting,
    complete,
    toast,
    helperKey,
    canSubmit,
    handleSubmit,
  } = useResetPasswordForm();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  const helperDanger = helperKey !== "resetPassword.passwordHelper";

  return (
    <AuthShell>
      <View style={styles.authHero}>
        <SecondbHead size={120} mood={complete ? "positive" : "neutral"} />
        <Text variant="heading" style={styles.big}>{complete ? t("auth:resetPassword.doneTitle") : t("auth:resetPassword.title")}</Text>
        <Text variant="body" style={styles.lead}>{complete ? t("auth:resetPassword.doneSubtitle") : t("auth:resetPassword.subtitle")}</Text>
      </View>
      <Card>
        {!userId ? (
          <>
            <Text variant="heading" style={styles.authHelpTitle}>{t("auth:resetPassword.expiredTitle")}</Text>
            <Text variant="body" style={styles.authHelpBody}>{t("auth:resetPassword.expiredBody")}</Text>
            <Pressable style={styles.providerBtn} onPress={() => router.replace("/sign-in")} accessibilityRole="link" accessibilityLabel={t("auth:resetPassword.backToSignIn")}>
              <Text variant="caption" style={styles.providerBtnText}>{t("auth:resetPassword.backToSignIn")}</Text>
            </Pressable>
          </>
        ) : complete ? (
          <Pressable style={styles.primary} onPress={() => router.replace("/")} accessibilityRole="button" accessibilityLabel={t("auth:resetPassword.continue")}>
            <Text variant="caption" style={styles.primaryText}>{t("auth:resetPassword.continue")}</Text>
          </Pressable>
        ) : (
          <>
            <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:resetPassword.newPassword")}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
              placeholderTextColor={colors.textLo}
              accessibilityLabel={t("auth:resetPassword.newPassword")}
              style={styles.input}
            />
            <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:resetPassword.confirmPassword")}</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
              placeholderTextColor={colors.textLo}
              accessibilityLabel={t("auth:resetPassword.confirmPassword")}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canSubmit) void handleSubmit();
              }}
            />
            <Text variant="body" style={[styles.authHelper, helperDanger && styles.authDanger]}>{t(`auth:${helperKey}`)}</Text>
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              style={[styles.primary, !canSubmit && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t("auth:resetPassword.submit")}
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            >
              <Text variant="caption" style={styles.primaryText}>{submitting ? t("auth:resetPassword.submitting") : t("auth:resetPassword.submit")}</Text>
            </Pressable>
          </>
        )}
      </Card>
      {toast ? <AuthToast message={toast.message} tone={toast.tone} /> : null}
    </AuthShell>
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

export function DeepSpaceDataDesignScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const ko = locale === "ko";
  const [indexing, setIndexing] = useState(false);
  const [indexed, setIndexed] = useState<number | null>(null);

  async function buildIndex() {
    if (!userId || indexing) return;
    setIndexing(true);
    setIndexed(null);
    try {
      const r = await backfillEmbeddings(userId, { locale, minor: isMinor === true });
      setIndexed(r.embedded);
    } catch {
      setIndexed(0);
    } finally {
      setIndexing(false);
    }
  }

  const indexValue = indexing
    ? t("data.indexing")
    : indexed !== null
      ? t("data.indexed", { count: indexed })
      : undefined;

  return (
    <Shell title={t("data.title")} subtitle={t("data.subtitle")}>
      <SecondbStatusHeader text={t("data.status")} tip={t("data.tip")} />
      <View style={styles.statRow}>
        <View style={styles.statBox}><Text variant="heading" style={styles.statNum}>412</Text><Text variant="subtle" style={styles.statCap}>{t("data.statPieces")}</Text></View>
        <View style={styles.statBox}><Text variant="heading" style={styles.statNum}>7</Text><Text variant="subtle" style={styles.statCap}>{t("data.statChecks")}</Text></View>
      </View>
      <Card>
        <Text variant="heading" style={styles.section}>{t("data.sectionStorage")}</Text>
        <Action label={t("data.onDevice")} value={t("data.encrypted")} />
        <Action label={t("data.cloudSync")} value={t("data.on")} />
      </Card>
      <Card>
        <Action label={t("data.buildIndex")} value={indexValue} onPress={userId && !indexing ? () => void buildIndex() : undefined} />
        <Action label={ko ? "가져오기" : "Import"} onPress={() => router.push("/import-hub")} />
        <Action label={t("data.exportAll")} onPress={() => router.push("/formats")} />
        <Action label={t("data.deleteAll")} onPress={() => router.push("/privacy")} />
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
// Paywall (① 페이월) — re-skinned to the deep-space design canon. Three
// journey-stage tiers (별바라기 / 항해자 / 북극성) NEVER labelled Free/Plus/Pro
// in the UI. Counts + feature gates are pulled from the single source of truth
// (src/lib/entitlements/tiers.ts) so the human phrasing below can never drift
// from what the entitlement engine actually grants. Per that file's HARD
// invariant, money buys MORE/LONGER memory + MORE features — never a better
// answer; this surface must never imply a pricier tier reasons better.
// RevenueCat wiring (getOfferings/purchasePackage/getProStatus/restore) is
// preserved exactly; only the visuals change.
// ──────────────────────────────────────────────────────────────────────────

// Format a KRW integer as ₩6,900 without a hardcoded currency literal in copy.
function krw(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

// Outline-circle bullet (별바라기 tier) — cyan stroke, recedes vs the mint checks.
function CircleBullet() {
  return (
    <Svg width={13} height={13} viewBox="0 0 16 16">
      <Circle cx={8} cy={8} r={6.2} stroke={deepSpace.accentSoft} strokeWidth={1.3} fill="none" />
    </Svg>
  );
}

// Mint check bullet (항해자 / promoted tier) — the only "filled/positive" mark.
function CheckBullet() {
  return (
    <Svg width={13} height={13} viewBox="0 0 16 16">
      <Path d="M3.5 8.5l3 3 6-7" stroke={deepSpace.mint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// Violet diamond bullet (북극성 tier) — soul/북극성 color, sits apart from cyan.
function SoulBullet() {
  return (
    <Svg width={13} height={13} viewBox="0 0 16 16">
      <Path d="M8 2l4 6-4 6-4-6z" stroke={deepSpace.soul} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// Small trust star (mint) for the "무료도 같은 AI 품질" line.
function TrustStar() {
  return (
    <Svg width={12} height={12} viewBox="0 0 16 16">
      <Path d="M8 1.5l1.8 3.8 4.2.5-3 2.9.8 4.1L8 10.9 4.2 12.8l.8-4.1-3-2.9 4.2-.5z" stroke={deepSpace.mint} strokeWidth={1.1} strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

type Bullet = "circle" | "check" | "soul";
function FeatureRow({ kind, label, textStyle }: { kind: Bullet; label: string; textStyle: object }) {
  return (
    <View style={styles.payFeatRow}>
      {kind === "circle" ? <CircleBullet /> : kind === "check" ? <CheckBullet /> : <SoulBullet />}
      <Text variant="body" style={textStyle}>{label}</Text>
    </View>
  );
}

export function DeepSpacePlansScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language === "ko";

  // Current pricing tier — so the paywall shows where the user already is, not a
  // generic upsell. progression.tier is the source of truth (free|soma|cortex|
  // brain); RevenueCat isPro is folded in below so a just-completed purchase
  // reflects immediately even before the users row syncs.
  const { userId } = useAuth();
  const { tier: currentTier } = useProgression();
  // This month's free-tier remaining deep asks, for the 별바라기 caption.
  const [freeRemaining, setFreeRemaining] = useState<number | null>(null);

  // Real native IAP scaffold. RevenueCat routes the Offering to Google Play
  // Billing (Android) / Apple IAP (iOS). On web, or with no public key, or with
  // no configured Offering, purchasesAvailable() is false / packages is empty,
  // so we show an honest "upgrade in the mobile app" notice instead of a dead
  // button. No charging happens until Simon configures store products (see
  // src/lib/payments/purchases.ts header). revenue_events logging is server-side
  // via a RevenueCat webhook (out of scope; C4 schema untouched).
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isPro, setIsPro] = useState(false);
  // Which action is in-flight, so the paywall can show distinct "구매 중" /
  // "복원 중" states on the right control (the 4th state, "restoring").
  const [busyAction, setBusyAction] = useState<"buy" | "restore" | null>(null);
  const busy = busyAction !== null;
  const [error, setError] = useState<string | null>(null);
  const available = arePurchasesAvailable();

  useEffect(() => {
    let alive = true;
    (async () => {
      configurePurchases();
      if (!arePurchasesAvailable()) {
        if (alive) setLoading(false);
        return;
      }
      try {
        const [pkgs, pro] = await Promise.all([getOfferings(), getProStatus()]);
        if (!alive) return;
        setPackages(pkgs);
        setIsPro(pro);
      } catch {
        if (alive) setError(t("plans.loadError"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  // This month's remaining free deep-asks, shown as a caption on the 별바라기
  // card. Only loaded when the user is actually on the free tier (별바라기); for
  // paid tiers the number is irrelevant. Fails open: on any miss it stays null
  // and the caption is simply omitted.
  useEffect(() => {
    if (!userId || currentTier !== "free") {
      setFreeRemaining(null);
      return;
    }
    let alive = true;
    (async () => {
      const usage = await getReasoningUsage(userId);
      if (!alive) return;
      setFreeRemaining(remainingReasoning("free", usage.used, usage.rewardCredits));
    })();
    return () => {
      alive = false;
    };
  }, [userId, currentTier]);

  async function buy(pkg: PurchasesPackage) {
    if (busy) return;
    setBusyAction("buy");
    setError(null);
    const outcome = await purchasePackage(pkg);
    if (outcome.status === "purchased") setIsPro(outcome.isPro);
    else if (outcome.status === "error" || outcome.status === "unavailable") setError(t("plans.purchaseError"));
    // "cancelled" -> stay quiet.
    setBusyAction(null);
  }

  async function restore() {
    if (busy) return;
    setBusyAction("restore");
    setError(null);
    const outcome = await restorePurchases();
    if (outcome.status === "restored") {
      setIsPro(outcome.isPro);
      if (!outcome.isPro) setError(t("plans.restoredNone"));
    } else {
      setError(t("plans.restoreError"));
    }
    setBusyAction(null);
  }

  // No native store available (web / no key) OR no Offering configured yet:
  // honest notice, keep a /support fallback link. Never a dead checkout button.
  const showStoreNotice = !available || (!loading && packages.length === 0);

  // The "항해자" CTA buys the plus offering. RevenueCat hands us the current
  // Offering's packages; pick the one whose product reads as the monthly plus
  // tier (id/price hint), else the first available package. The on-card price
  // still shows TIER_PRICE_KRW so copy never drifts; the store charges the real
  // localized priceString.
  const plusPkg = useMemo(() => {
    if (packages.length === 0) return undefined;
    const hint = packages.find((p) => {
      const id = `${p.identifier} ${p.product.identifier}`.toLowerCase();
      return id.includes("plus") || id.includes("voyager") || id.includes("monthly") || id.includes("month");
    });
    return hint ?? packages[0];
  }, [packages]);

  // ── Tier copy — counts/features pulled from TIERS so it can't drift. ──
  const free = TIERS.free;
  const plus = TIERS.plus;
  const pro = TIERS.pro;
  const freeFeatures: string[] = ko
    ? [
        `한 달에 ${free.reasoningPerMonth}번 깊이 묻기`,
        `렌즈 ${free.lenses}개로 시작`,
        `기억이 ${free.historyDays}일 머무름`,
      ]
    : [
        `${free.reasoningPerMonth} deep asks a month`,
        `Start with ${free.lenses} lenses`,
        `Memory stays ${free.historyDays} days`,
      ];
  const plusFeatures: string[] = ko
    ? [
        `한 달에 ${plus.reasoningPerMonth}번 깊이 묻기`,
        `7개 렌즈 모두 열기`,
        `기억이 영원히 머무름`,
        `내보내기와 다른 앱 연동`,
      ]
    : [
        `${plus.reasoningPerMonth} deep asks a month`,
        `Open all 7 lenses`,
        `Memory stays forever`,
        `Export and connect other apps`,
      ];
  const proFeatures: string[] = ko
    ? ["모든 길 끝까지 열기", "가족과 함께 떠나기", "더 깊은 내보내기"]
    : ["Open every path to the end", "Journey together with family", "Deeper export"];

  // Pro tier is the 북극성 stage; tap routes through the same buy() so the
  // existing RevenueCat flow handles it (store charges the right product).
  const proPkg = useMemo(() => {
    if (packages.length === 0) return undefined;
    const hint = packages.find((p) => {
      const id = `${p.identifier} ${p.product.identifier}`.toLowerCase();
      return id.includes("pro") || id.includes("northstar") || id.includes("north") || id.includes("year") || id.includes("annual");
    });
    return hint && hint !== plusPkg ? hint : undefined;
  }, [packages, plusPkg]);

  // Resolve which pricing card the user is currently on. brain = 북극성,
  // cortex/soma = 항해자 (soma is the lifetime variant of the voyager journey),
  // free = 별바라기. RevenueCat isPro promotes a free-looking row to at-least
  // 항해자 so a just-purchased user never sees themselves as 별바라기.
  const onNorthStar = currentTier === "brain";
  const onVoyager = !onNorthStar && (currentTier === "cortex" || currentTier === "soma" || isPro);
  const onStargazer = !onNorthStar && !onVoyager;
  // The "현재 플랜" marker — subtle accent text, never a pill.
  const currentMarker = ko ? "현재 플랜" : "Current";

  return (
    <Shell title={t("plans.title")}>
      <SecondbStatusHeader
        text={isPro ? t("plans.proActive") : t("plans.status")}
        tip={t("plans.tip")}
        mood="positive"
      />

      {/* Subtle north-star soul glow + faint starfield over the hero. */}
      <View pointerEvents="none" style={styles.paySoulGlow} />
      <View pointerEvents="none" style={styles.payStars}>
        <View style={[styles.payStar, { left: "18%", top: 8 }]} />
        <View style={[styles.payStar, { right: "16%", top: 14, opacity: 0.7 }]} />
        <View style={[styles.payStarSoul, { left: "62%", top: 4 }]} />
      </View>

      {/* HERO — dominant, no transactional words. */}
      <View style={styles.payHero}>
        <Text pixelEn style={styles.payEyebrow}>JOURNEY TO YOUR NORTH STAR</Text>
        <Text style={styles.payTitle}>
          {ko ? "나에 대해 더\n이해하고 싶나요?" : "Want to understand\nyourself more?"}
        </Text>
        <Text style={styles.paySub}>
          {ko
            ? "더 오래, 더 깊이 기억할수록\n당신의 북극성이 또렷해져요."
            : "The longer and deeper you remember,\nthe clearer your north star becomes."}
        </Text>
      </View>

      {onNorthStar ? (
        // 북극성 — every path is open. No purchase CTA; reuse the isPro
        // confirmation path with the north-star copy.
        <View style={[styles.payCard, styles.payCardPro]}>
          <View style={styles.payCardHead}>
            <Text style={styles.payTierNamePro}>{ko ? "북극성" : "North Star"}</Text>
            <Text variant="caption" style={styles.payCurrentMarker}>{currentMarker}</Text>
          </View>
          {proFeatures.map((x) => (
            <FeatureRow key={x} kind="soul" label={x} textStyle={styles.payFeatPro} />
          ))}
          <Text variant="subtle" style={styles.footer}>
            {ko ? "북극성 이용 중 · 모든 길이 열려 있어요" : "On North Star · every path is open"}
          </Text>
        </View>
      ) : onVoyager ? (
        // 항해자 — confirm current journey, offer the 북극성 upgrade if a
        // distinct pro package exists; otherwise just confirm, no checkout.
        <View style={[styles.payCard, styles.payCardPlus]}>
          <View style={styles.payCardHead}>
            <Text style={styles.payTierNamePlus}>{ko ? "항해자" : "Voyager"}</Text>
            <Text variant="caption" style={styles.payCurrentMarker}>{currentMarker}</Text>
          </View>
          {plusFeatures.map((x) => (
            <FeatureRow key={x} kind="check" label={x} textStyle={styles.payFeatPlus} />
          ))}
          <Text variant="subtle" style={styles.footer}>
            {proPkg
              ? t("plans.nowPro")
              : ko ? "현재 항해자 이용 중" : "Currently on Voyager"}
          </Text>
        </View>
      ) : (
        <>
          {/* 별바라기 — ₩0, cyan outline bullets. */}
          <View style={[styles.payCard, styles.payCardFree]}>
            <View style={styles.payCardHead}>
              <View style={styles.payNameRow}>
                <Text style={styles.payTierNameFree}>{ko ? "별바라기" : "Stargazer"}</Text>
                {onStargazer ? (
                  <Text variant="caption" style={styles.payCurrentMarker}>{currentMarker}</Text>
                ) : null}
              </View>
              <Text style={styles.payPriceFree}>{krw(TIER_PRICE_KRW.free)}</Text>
            </View>
            <View style={styles.payFeatList}>
              {freeFeatures.map((x) => (
                <FeatureRow key={x} kind="circle" label={x} textStyle={styles.payFeatFree} />
              ))}
            </View>
            {onStargazer && freeRemaining !== null ? (
              <Text variant="caption" style={styles.payFreeCaption}>
                {ko
                  ? `이번 달 ${freeRemaining}/${free.reasoningPerMonth}회 깊이 묻기 남음`
                  : `${freeRemaining}/${free.reasoningPerMonth} deep asks left this month`}
              </Text>
            ) : null}
          </View>

          {/* 항해자 — promoted: thicker cyan border + glow + "추천" rect tag. */}
          <View style={[styles.payCard, styles.payCardPlus]}>
            <Text pixelEn style={styles.payRecTag}>{ko ? "추천" : "PICK"}</Text>
            <View style={[styles.payCardHead, styles.payCardHeadPlus]}>
              <Text style={styles.payTierNamePlus}>{ko ? "항해자" : "Voyager"}</Text>
              <Text style={styles.payPricePlus}>
                <Text style={styles.payPriceStrong}>{krw(TIER_PRICE_KRW.plus)}</Text>
                {ko ? " /월" : " /mo"}
              </Text>
            </View>
            <View style={styles.payFeatList}>
              {plusFeatures.map((x) => (
                <FeatureRow key={x} kind="check" label={x} textStyle={styles.payFeatPlus} />
              ))}
            </View>
          </View>

          {/* 북극성 — violet border + violet bullets. */}
          <Pressable
            style={[styles.payCard, styles.payCardPro]}
            onPress={proPkg ? () => void buy(proPkg) : undefined}
            disabled={!proPkg || busy}
            accessibilityRole={proPkg ? "button" : undefined}
            accessibilityLabel={ko ? "북극성으로 떠나기" : "Set out as North Star"}
          >
            <View style={styles.payCardHead}>
              <Text style={styles.payTierNamePro}>{ko ? "북극성" : "North Star"}</Text>
              <Text style={styles.payPricePro}>
                <Text style={styles.payPriceStrongPro}>{krw(TIER_PRICE_KRW.pro)}</Text>
                {ko ? " /월" : " /mo"}
              </Text>
            </View>
            <View style={styles.payFeatList}>
              {proFeatures.map((x) => (
                <FeatureRow key={x} kind="soul" label={x} textStyle={styles.payFeatPro} />
              ))}
            </View>
          </Pressable>

          {showStoreNotice ? (
            <View style={styles.payCard}>
              <Text variant="heading" style={styles.section}>{t("plans.notAvailableTitle")}</Text>
              <Text variant="body" style={styles.planFeatDim}>{t("plans.notAvailableBody")}</Text>
              <Pressable
                onPress={() => router.push("/support")}
                accessibilityRole="button"
                accessibilityLabel={t("plans.support")}
              >
                <Text variant="caption" style={styles.planSupportLink}>{t("plans.support")}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      {/* Loading state (가격 조회) — sits where the CTA will be, never overlaps. */}
      {loading ? (
        <View style={styles.plansLoading}>
          <ActivityIndicator color={deepSpace.accent} />
          <Text variant="subtle" style={styles.footer}>{ko ? "가격 조회 중…" : "Loading prices…"}</Text>
        </View>
      ) : null}

      {/* Inline error (결제 실패) — calm, functional, above the CTA. */}
      {error ? <Text variant="subtle" style={styles.planError}>{error}</Text> : null}

      {/* CTA BLOCK — below the cards in normal flow (marginTop:'auto' so it sinks
          to the bottom when the body is short, but never overlaps long copy).
          By current tier: 별바라기 → buy 항해자; 항해자 → upgrade to 북극성 (only
          when a distinct pro package exists); 북극성 → no CTA. */}
      {!loading && (onStargazer || (onVoyager && proPkg)) ? (
        // Stargazer buys 항해자 (plusPkg); Voyager upgrades to 북극성 (proPkg).
        (() => {
          const ctaPkg = onVoyager ? proPkg : plusPkg;
          const ctaIdle = onVoyager
            ? (ko ? "북극성으로 (Pro 업그레이드)" : "Go North Star (Pro upgrade)")
            : (ko ? "항해자로 떠나기" : "Set out as Voyager");
          return (
        <View style={styles.payCtaBlock}>
          <View style={styles.payTrustRow}>
            <TrustStar />
            <Text style={styles.payTrust}>{ko ? "무료도 같은 AI 품질" : "Same AI quality, even free"}</Text>
          </View>
          <Pressable
            style={[styles.payPrimary, busy ? styles.planBtnBusy : null, !ctaPkg ? styles.payPrimaryDisabled : null]}
            onPress={ctaPkg ? () => void buy(ctaPkg) : undefined}
            disabled={busy || !ctaPkg}
            accessibilityRole="button"
            accessibilityLabel={ctaIdle}
          >
            <Text style={styles.payPrimaryText}>
              {busyAction === "buy" ? (ko ? "구매 중…" : "Purchasing…") : ctaIdle}
            </Text>
          </Pressable>
          {available ? (
            <Pressable
              style={busy ? styles.planBtnBusy : null}
              onPress={() => void restore()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t("plans.restore")}
            >
              <Text style={styles.paySecondaryText}>
                {busyAction === "restore" ? (ko ? "복원 중…" : "Restoring…") : t("plans.restore")}
              </Text>
            </Pressable>
          ) : null}
        </View>
          );
        })()
      ) : null}
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

function FilterChip({ label, active, violet, onPress }: { label: string; active?: boolean; violet?: boolean; onPress?: () => void }) {
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
  // restyle — the row visual is unchanged; only a ≥44px hit target is added.
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{ minHeight: 44, justifyContent: "center" }, pressed ? { opacity: 0.6 } : null]}>
      {content}
    </Pressable>
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
    let filtered = kind === null ? records : records.filter((r) => r.kind === kind);
    if (tagFilter.length > 0) {
      filtered = filtered.filter((r) => (r.tags ?? []).some((tag) => tagFilter.includes(tag.toLowerCase())));
    }
    return buildRecordsTimeline(filtered, { labels: dsTimeLabels(t) });
  }, [records, kind, tagFilter, t]);

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
      <Text variant="body" style={styles.lead}>{t("records.lead")}</Text>
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
          <Text variant="body" style={styles.wikiBody}>{kind === null ? t("records.emptyAll") : t("records.emptyKind")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.label}>
            <Text variant="caption" pixelEn style={styles.tlLabel}>{g.label}</Text>
            <View style={styles.tlGroup}>
              {g.items.map((it) => (
                <TimelineRow key={it.id} title={it.title} time={it.timeLabel || undefined} tag={it.tag} dim={it.dim} onPress={() => router.push({ pathname: "/record/[id]", params: { id: it.id } })} />
              ))}
            </View>
          </View>
        ))
      )}
    </Shell>
  );
}

// Anti-slop: source kinds are marked by a tinted dot (shared tlDot), not emoji.
const SOURCE_KIND_TINT: Record<string, string> = {
  inbox: colors.cyanSoft,
  article: colors.cyan,
  video: colors.soul,
  paper: colors.mint,
  reddit: colors.amber,
  code: colors.cyanBright,
  ai_tool: colors.soul,
  self_knowledge: colors.mint,
};

function TrashGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M4 7h16M10 7V5h4v2M7 7l1 13h8l1-13M10 11v6M14 11v6" stroke={colors.clay} strokeWidth={1.7} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function sourceTitle(s: SourceRow, fallback: string): string {
  const title = s.title?.trim();
  return title && title.length > 0 ? title : fallback;
}

export function DeepSpaceInboxScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading: authLoading, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suggestBusyId, setSuggestBusyId] = useState<string | null>(null);

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

  // Accept one AI-suggested tag onto the source before promotion.
  async function acceptTag(s: SourceRow, tag: string) {
    if (!userId || s.tags.includes(tag)) return;
    setBusyId(s.id);
    try {
      await updateSourceTags(userId, s.id, [...s.tags, tag]);
      await load(userId);
    } catch {
      // best-effort; the tag just doesn't stick
    } finally {
      setBusyId(null);
    }
  }

  // On-demand Phase 1 (C1/C3/C9 inside) so the suggestion chips have something
  // to show when nothing was extracted at capture time.
  async function getSuggestions(s: SourceRow) {
    if (!userId) return;
    setSuggestBusyId(s.id);
    try {
      await runPhase1({ userId, sourceId: s.id, locale, minor: isMinor === true });
      await load(userId);
    } catch {
      // best-effort; the button can be tapped again
    } finally {
      setSuggestBusyId(null);
    }
  }

  if (authLoading) {
    return <Shell title={t("inbox.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const pending = sources.length;
  const [current, ...queue] = sources;
  const suggestions = current ? suggestedTags(current) : [];

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
          <Text variant="body" style={styles.wikiBody}>{t("inbox.emptyDone")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text variant="body" style={styles.lead}>{t("inbox.remaining", { count: pending })}</Text>
          <Card style={styles.triageCard}>
            <View style={styles.triageMeta}>
              <View style={[styles.tlDot, { backgroundColor: SOURCE_KIND_TINT[current.kind] ?? colors.cyanDim }]} />
              <Text variant="caption" pixelEn style={styles.metaLabel}>{current.kind}</Text>
            </View>
            <Text variant="body" style={styles.triageBody} numberOfLines={3}>{sourceTitle(current, t("inbox.untitled"))}</Text>
            {current.tags.length > 0 ? (
              <View style={styles.filterRow}>
                {current.tags.slice(0, 6).map((tag) => (
                  <FilterChip key={tag} label={`#${tag}`} active />
                ))}
              </View>
            ) : null}
            {suggestions.length > 0 ? (
              <>
                <Text variant="subtle" style={styles.footerLeft}>{t("inbox.suggestedLabel")}</Text>
                <View style={styles.filterRow}>
                  {suggestions.map((tag) => (
                    <FilterChip
                      key={tag}
                      label={`+ ${tag}`}
                      onPress={() => void acceptTag(current, tag)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => void getSuggestions(current)}
                disabled={busyId !== null || suggestBusyId !== null}
                style={styles.smallBtnGhost}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.getSuggestions")}
              >
                <Text variant="caption" style={styles.smallBtnGhostText}>
                  {suggestBusyId === current.id ? t("inbox.gettingSuggestions") : t("inbox.getSuggestions")}
                </Text>
              </Pressable>
            )}
            <View style={styles.ctaRow}>
              <Pressable
                style={styles.iconBtn}
                onPress={() => void discard(current)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.a11yDiscard")}
              >
                <TrashGlyph />
              </Pressable>
              <Pressable
                style={styles.primary}
                onPress={() => void promote(current)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.a11yArchive")}
              >
                <Text variant="caption" style={styles.primaryText}>{busyId === current.id ? t("inbox.archiving") : t("inbox.archive")}</Text>
              </Pressable>
            </View>
          </Card>
          {queue.length > 0 ? (
            <>
              <Text variant="caption" pixelEn style={styles.tlLabel}>{t("inbox.nextUp")}</Text>
              <View style={{ gap: 7 }}>
                {queue.slice(0, 8).map((s, i) => (
                  <View key={s.id} style={[styles.queueItem, i > 0 && styles.queueItemDim]}>
                    <View style={[styles.tlDot, { backgroundColor: SOURCE_KIND_TINT[s.kind] ?? colors.cyanDim }]} />
                    <Text variant="body" style={styles.queueText} numberOfLines={1}>{sourceTitle(s, t("inbox.untitled"))}</Text>
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

interface ImportResult {
  imported: number;
  deduped: number;
  failed: number;
}

export function DeepSpaceImportScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading: authLoading, isMinor } = useAuth();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Phase B Slice 1: app-level health_import opt-in state. Off for everyone by
  // default; minors are hard-locked off (healthImportAllowed never passes).
  const [healthPref, setHealthPref] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthDone, setHealthDone] = useState(false);

  const notes = useMemo(() => splitImportNotes(text), [text]);

  useEffect(() => {
    if (!userId) return;
    void fetchPrivacyPrefs(userId).then((p) => setHealthPref(p.health_import === true));
  }, [userId]);

  const canHealth = healthImportAllowed(isMinor, healthPref);

  // Opt in: persist the pref AND write an explicit sensitive-data consent record
  // (consent_records, the existing ledger) before any ingest can run. Minors
  // can never reach this — the row shows healthMinorLocked instead.
  async function handleHealthConsent() {
    if (!userId || healthBusy || isMinor === true) return;
    setHealthBusy(true);
    try {
      const prefs = { ...(await fetchPrivacyPrefs(userId)), health_import: true };
      await savePrivacyPrefs(userId, prefs);
      // The guard above already excludes minors, so opt-in here is always adult.
      await recordHealthImportConsent({
        userId,
        ageBand: "adult",
        minorTier: "adult",
        locale: i18n.language?.startsWith("ko") ? "ko" : "en",
      });
      setHealthPref(true);
    } catch {
      // Best-effort; the row stays in the opt-in state so the user can retry.
    } finally {
      setHealthBusy(false);
    }
  }

  // Ingest today's activity through the single choke point (gate enforced inside
  // ingestHealthSamples). Slice 1 uses the deterministic mock as the data; the
  // manual/native sources land later behind the same call.
  async function handleHealthIngest() {
    if (!userId || healthBusy || !canHealth) return;
    setHealthBusy(true);
    setHealthDone(false);
    try {
      const now = new Date().toISOString();
      const range = { startIso: now, endIso: now };
      // Slice 2: prefer a real OS source (Health Connect / HealthKit) when it can
      // run on this device; fall back to the deterministic mock on web / Expo Go /
      // jest. Both funnel through the same ingestHealthSamples choke point, so the
      // consent gate + minor hard-lock stay identical.
      const native = availableHealthSources().find(
        (s) => s.id === "health_connect" || s.id === "healthkit",
      );
      const samples =
        native && (await native.requestPermission()) === "granted"
          ? await native.read(range)
          : mockSamplesForRange(range);
      await ingestHealthSamples(userId, samples, { isMinor, pref: healthPref });
      setHealthDone(true);
    } catch {
      // Gate rejection or write error: leave the affordance for retry.
    } finally {
      setHealthBusy(false);
    }
  }

  async function handlePickFiles() {
    if (importing || picking) return;
    setPicking(true);
    try {
      // Obsidian has no API — "connecting" it means importing its .md files.
      // Picked file text drops into the same paste box so the review/import
      // flow below handles it. Multiple files join with a --- separator so
      // splitImportNotes keeps them as distinct notes.
      const files = await pickImportFiles();
      if (files.length > 0) {
        const joined = files.map((f) => f.text).join("\n\n---\n\n");
        setText((prev) => (prev.trim() ? `${prev.trim()}\n\n---\n\n${joined}` : joined));
        setResult(null);
      }
    } catch {
      // Picker cancel/permission errors are non-fatal; the box is unchanged.
    } finally {
      setPicking(false);
    }
  }

  async function handleImport() {
    if (!userId || notes.length === 0 || importing) return;
    setImporting(true);
    setResult(null);
    const tally: ImportResult = { imported: 0, deduped: 0, failed: 0 };
    for (const note of notes) {
      try {
        // Same pipeline the clipper uses; user-authored notes are self_knowledge.
        // No LLM here — imported sources land in the inbox for Phase 1/2 later ($0).
        const r = await captureFromMarkdown({ userId, rawMd: note, kindOverride: "self_knowledge" });
        if (r.deduped === "exact_duplicate") tally.deduped += 1;
        else tally.imported += 1;
      } catch {
        tally.failed += 1;
      }
    }
    setResult(tally);
    if (tally.imported > 0 || tally.deduped > 0) setText("");
    setImporting(false);
  }

  if (authLoading) {
    return <Shell title={t("import.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <Shell title={t("import.title")}>
      <SecondbStatusHeader text={t("import.status")} tip={t("import.tip")} />
      <Text variant="body" style={styles.lead}>{t("import.lead")}</Text>

      <Card>
        <Text variant="caption" pixelEn style={styles.reviewLabel}>{t("import.pasteLabel")}</Text>
        <TextInput
          style={[styles.input, { minHeight: 132, textAlignVertical: "top" }]}
          value={text}
          onChangeText={setText}
          placeholder={t("import.placeholder")}
          placeholderTextColor={colors.textLo}
          multiline
          editable={!importing}
          accessibilityLabel={t("import.pasteLabel")}
        />
        {notes.length > 0 ? (
          <>
            <Text variant="caption" pixelEn style={styles.tlLabel}>{t("import.detected", { count: notes.length })}</Text>
            {notes.slice(0, 8).map((note, i) => (
              <View key={i} style={styles.mapRow}>
                <RNText style={styles.mapArrow}>•</RNText>
                <Text variant="body" style={styles.mapTo} numberOfLines={1}>{previewTitle(note, t("import.untitled"))}</Text>
              </View>
            ))}
            {notes.length > 8 ? <Text variant="subtle" style={styles.footerLeft}>{t("import.andMore", { count: notes.length - 8 })}</Text> : null}
          </>
        ) : (
          <Text variant="subtle" style={styles.footerLeft}>{t("import.empty")}</Text>
        )}
      </Card>

      {result !== null ? (
        <View style={styles.insightViolet}>
          <Text variant="body" style={styles.insightVioletText}>{t("import.resultDone", { count: result.imported })}</Text>
          {result.deduped > 0 || result.failed > 0 ? (
            <View style={styles.evRow}>
              {result.deduped > 0 ? <Text variant="subtle" style={styles.evChip}>{t("import.resultDuplicate", { count: result.deduped })}</Text> : null}
              {result.failed > 0 ? <Text variant="subtle" style={styles.evChip}>{t("import.resultFailed", { count: result.failed })}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.ctaRow}>
        <Pressable
          style={styles.secondary}
          onPress={() => { setText(""); setResult(null); }}
          disabled={importing || text.length === 0}
          accessibilityRole="button"
          accessibilityLabel={t("import.clear")}
        >
          <Text variant="caption" style={styles.secondaryText}>{t("import.clear")}</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, styles.primaryWide, (notes.length === 0 || importing) && { opacity: 0.6 }]}
          onPress={() => void handleImport()}
          disabled={notes.length === 0 || importing}
          accessibilityRole="button"
          accessibilityLabel={t("import.importCount", { count: notes.length })}
        >
          <Text variant="caption" style={styles.primaryText}>{importing ? t("import.importing") : t("import.importCount", { count: notes.length })}</Text>
        </Pressable>
      </View>

      <Text variant="caption" pixelEn style={styles.tlLabel}>{t("import.connectorsLabel")}</Text>
      <View style={{ gap: 8 }}>
        <View style={[styles.sourceRow, styles.sourceRowDim]}><View style={[styles.tlDot, { backgroundColor: colors.cyanDim }]} /><View style={{ flex: 1 }}><Text variant="caption" style={styles.sourceNameDim}>Notion</Text><Text variant="subtle" style={styles.sourceDesc}>{t("import.notionDesc")}</Text></View><Text variant="subtle" style={styles.sourceSoon}>{t("import.soon")}</Text></View>
        <Pressable
          style={styles.sourceRow}
          onPress={() => void handlePickFiles()}
          disabled={picking || importing}
          accessibilityRole="button"
          accessibilityLabel={t("import.pickFiles")}
        ><View style={[styles.tlDot, { backgroundColor: colors.soul }]} /><View style={{ flex: 1 }}><Text variant="caption" style={styles.sourceName}>Obsidian</Text><Text variant="subtle" style={styles.sourceDesc}>{t("import.obsidianDesc")}</Text></View><Text variant="caption" style={styles.sourceCta}>{picking ? t("import.picking") : t("import.pickFiles")}</Text></Pressable>
        {isMinor === true ? (
          <View style={[styles.sourceRow, styles.sourceRowDim]}><View style={[styles.tlDot, { backgroundColor: colors.mint }]} /><View style={{ flex: 1 }}><Text variant="caption" style={styles.sourceNameDim}>{t("import.healthName")}</Text><Text variant="subtle" style={styles.sourceDesc}>{t("import.healthDesc")}</Text></View><Text variant="subtle" style={styles.sourceSoon}>{t("import.healthMinorLocked")}</Text></View>
        ) : !canHealth ? (
          <Pressable
            style={styles.sourceRow}
            onPress={() => void handleHealthConsent()}
            disabled={healthBusy}
            accessibilityRole="button"
            accessibilityLabel={t("import.healthConsentNeeded")}
            accessibilityHint={t("import.healthConnectHint")}
          ><View style={[styles.tlDot, { backgroundColor: colors.mint }]} /><View style={{ flex: 1 }}><Text variant="caption" style={styles.sourceName}>{t("import.healthName")}</Text><Text variant="subtle" style={styles.sourceDesc}>{t("import.healthDesc")}</Text></View><Text variant="caption" style={styles.sourceCta}>{healthBusy ? t("import.importing") : t("import.healthConsentNeeded")}</Text></Pressable>
        ) : (
          <Pressable
            style={styles.sourceRow}
            onPress={() => void handleHealthIngest()}
            disabled={healthBusy}
            accessibilityRole="button"
            accessibilityLabel={t("import.healthIngest")}
            accessibilityHint={t("import.healthIngestHint")}
          ><View style={[styles.tlDot, { backgroundColor: colors.mint }]} /><View style={{ flex: 1 }}><Text variant="caption" style={styles.sourceName}>{t("import.healthName")}</Text><Text variant="subtle" style={styles.sourceDesc}>{healthDone ? t("import.healthIngested") : t("import.healthDesc")}</Text></View><Text variant="caption" style={styles.sourceCta}>{healthBusy ? t("import.importing") : t("import.healthIngest")}</Text></Pressable>
        )}
      </View>
    </Shell>
  );
}

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
    return <DeepSpaceScreen active="ops"><DockBody title={t("hero.title")}><GraphLoading /></DockBody></DeepSpaceScreen>;
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

  return (
    // Primary "비서" hub: render inside the persistent deep-space chrome so the
    // bottom dock shows. DeepSpaceScreen supplies the star-field background +
    // SecondbStatusHeader (ds.head.ops), so the screen's own header/root are
    // dropped to avoid double chrome.
    <DeepSpaceScreen active="ops">
      <DockBody title={t("hero.title")}>
      <View style={styles.opsTodayHead}>
        <Text variant="heading" style={styles.section}>{t("today.heading")}</Text>
        {streak > 0 ? <Text variant="subtle" style={styles.timeChipMint}>{t("today.streak", { count: streak })}</Text> : null}
      </View>
      {todayRoutines.length === 0 ? (
        <Text variant="body" style={styles.opsReason}>{t("today.empty")}</Text>
      ) : (
        todayRoutines.map((routine) => {
          const done = completedIds.has(routine.id);
          return (
            <Pressable
              key={routine.id}
              style={styles.opsTodayRow}
              onPress={() => void completeRoutine(routine)}
              disabled={done}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={done ? t("today.doneA11y", { title: routine.title }) : t("today.completeA11y", { title: routine.title })}
            >
              <View style={[styles.opsCheck, done && styles.opsCheckOn]}>
                {done ? <RNText style={styles.opsCheckMark}>✓</RNText> : null}
              </View>
              <Text variant="body" style={[styles.opsTodayTitle, done && styles.opsTodayTitleDone]}>{routine.title}</Text>
              <Text variant="subtle" style={styles.timeChipCyan}>{routine.recurrence === "daily" ? t("card.daily") : t("card.weekly")}</Text>
            </Pressable>
          );
        })
      )}
      {reminderToast ? <Text variant="subtle" style={styles.footerLeft}>{reminderToast}</Text> : null}
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
      </DockBody>
    </DeepSpaceScreen>
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
    return <DeepSpaceScreen active="wiki"><DockBody title={t("wiki.title")}><GraphLoading /></DockBody></DeepSpaceScreen>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  // Default the first page open when nothing is explicitly toggled.
  const openId = expandedId ?? view.pages[0]?.id ?? null;

  // P2-cont: /wiki sits inside the M3 dock shell (PRD §04 5-tab set). The shell
  // owns the star-field + SecondbStatusHeader (ds.head.wiki.*), so the screen's
  // own header goes away; the page count already reads out in the stat row.
  return (
    <DeepSpaceScreen active="wiki">
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
    </DeepSpaceScreen>
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
const RING_R = 100;
const RING_C = 2 * Math.PI * RING_R; // circumference for the dasharray
const FOCUS_BOUNDS = { focusMin: 5, focusMax: 60, breakMin: 1, breakMax: 30 };

const focusStyles = StyleSheet.create({
  stage: { alignItems: "center", gap: spacing.md, paddingTop: spacing.sm },
  ringWrap: { width: 226, height: 226, alignItems: "center", justifyContent: "center" },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontFamily: m3.font.mono, fontSize: 8, letterSpacing: 1.6 },
  time: { fontSize: 46, color: colors.textHi, letterSpacing: 1, marginTop: spacing.sm },
  ringSub: { fontSize: 11, color: colors.textLo, marginTop: spacing.sm, textAlign: "center" },
  completeCheck: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  completeMark: { fontFamily: fontFamilies.readable, fontSize: 24 },
  completeTitle: { fontSize: 22, color: colors.textHi, marginTop: spacing.md },
  dotsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotEmpty: { borderWidth: 1, borderColor: colors.borderHi },
  todayLine: { fontSize: 12, color: colors.textLo, textAlign: "center" },
  subtleLink: { fontSize: 12, color: colors.textLo, textAlign: "center", paddingVertical: spacing.xs },
  controls: { alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  bigBtn: { width: 74, height: 74, borderRadius: 37, alignItems: "center", justifyContent: "center" },
  bigBtnPrimary: { backgroundColor: colors.cyan },
  bigBtnGhost: { borderWidth: 1, borderColor: colors.borderHi, backgroundColor: colors.cardBg },
  playGlyph: { fontSize: 26, marginLeft: 4 },
  pauseGlyph: { flexDirection: "row", gap: 5 },
  pauseBar: { width: 5, height: 20, borderRadius: 1 },
  completeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  choiceGhost: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.borderHi, borderRadius: radius.md, backgroundColor: colors.cardBg },
  choiceGhostText: { fontSize: 13, color: colors.cyanSoft },
  choicePrimary: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.cyan },
  choicePrimaryText: { fontSize: 13, color: colors.bgDeep },
  // ANDROID_QA §1: a custom overlay needs its own elevated layer or the controls
  // behind can shine through / stay touchable on Android.
  sheetBackdrop: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", zIndex: 10, elevation: 24 },
  sheetTap: { ...StyleSheet.absoluteFill },
  sheet: { backgroundColor: colors.cardBg, borderTopWidth: 1, borderColor: colors.borderHi, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderHi, alignSelf: "center" },
  sheetLabel: { fontFamily: m3.font.mono, fontSize: 8, letterSpacing: 1.4, color: colors.textLo },
  sheetDivider: { height: 1, backgroundColor: colors.border },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepLabel: { fontSize: 14, color: colors.textTitle },
  stepHint: { fontSize: 10.5, color: colors.textLo, marginTop: 3 },
  stepControls: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: { width: 34, height: 34, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderHi, backgroundColor: colors.cardBg, alignItems: "center", justifyContent: "center" },
  stepBtnText: { fontFamily: fontFamilies.readable, fontSize: 18, color: colors.cyanSoft },
  stepValue: { fontSize: 22, color: colors.textHi, minWidth: 54, textAlign: "center" },
  stepUnit: { fontSize: 12, color: colors.textLo },
  sheetSave: { alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.cyan, marginTop: spacing.xs },
  sheetSaveText: { fontSize: 14, color: colors.bgDeep },
});

function FocusStepper(props: {
  label: string; hint: string; value: number; unit: string; decLabel: string; incLabel: string;
  onDec: () => void; onInc: () => void;
}) {
  return (
    <View style={focusStyles.stepRow}>
      <View style={{ flex: 1 }}>
        <Text variant="caption" style={focusStyles.stepLabel}>{props.label}</Text>
        <Text variant="subtle" style={focusStyles.stepHint}>{props.hint}</Text>
      </View>
      <View style={focusStyles.stepControls}>
        <Pressable style={focusStyles.stepBtn} onPress={props.onDec} accessibilityRole="button" accessibilityLabel={props.decLabel}>
          <RNText style={focusStyles.stepBtnText}>−</RNText>
        </Pressable>
        <Text variant="heading" style={focusStyles.stepValue}>{props.value}<Text variant="subtle" style={focusStyles.stepUnit}>{props.unit}</Text></Text>
        <Pressable style={focusStyles.stepBtn} onPress={props.onInc} accessibilityRole="button" accessibilityLabel={props.incLabel}>
          <RNText style={focusStyles.stepBtnText}>+</RNText>
        </Pressable>
      </View>
    </View>
  );
}

export function DeepSpaceFocusScreen() {
  const { t } = useTranslation("ops");
  const { userId, loading: authLoading, hasProfile } = useAuth();

  const [timer, setTimer] = useState<PomodoroState>(() => createPomodoro());
  // Per-day tally; survives reset (not the in-cycle session count).
  const [doneToday, setDoneToday] = useState(0);
  // The "집중 완료" celebratory choice screen. On a focus->break boundary we pause
  // at the break and surface 휴식하기 / 한 번 더, instead of auto-running the break.
  const [showComplete, setShowComplete] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftFocus, setDraftFocus] = useState(timer.config.focusMinutes);
  const [draftBreak, setDraftBreak] = useState(timer.config.breakMinutes);

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
        // Hold at the break boundary (paused) and show the completion choice.
        setTimer(pause(next));
        setShowComplete(true);
        setDoneToday((n) => n + 1);
        if (userId) void applyFocusSessionComplete(userId).catch(() => {});
        void notifyNow(t("focus.alarmFocusTitle"), t("focus.alarmFocusBody")).catch(() => {});
      } else {
        setTimer(next);
        if (phaseJustChanged(prev, next)) {
          void notifyNow(t("focus.alarmBreakTitle"), t("focus.alarmBreakBody")).catch(() => {});
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timer.running, userId, t]);

  // ANDROID_QA §4: hardware Back closes the settings sheet, never the screen.
  useEffect(() => {
    if (!settingsOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setSettingsOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [settingsOpen]);

  if (authLoading) {
    return <Shell title={t("focus.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const phase = timer.phase;
  const isBreak = phase === "break";
  const target = timer.config.sessionsBeforeLongBreak;
  const completed = timer.completedFocusSessions;
  // The break after every Nth focus is the LONG break (mirrors breakMsAfter in
  // pomodoro.ts), so the ring must divide by the long-break length, not the short.
  const isLongBreak = isBreak && target > 0 && completed > 0 && completed % target === 0;
  const breakTotalMin = isLongBreak ? timer.config.longBreakMinutes : timer.config.breakMinutes;
  const totalMs = (isBreak ? breakTotalMin : timer.config.focusMinutes) * 60_000;
  const shownMs = phase === "idle" ? timer.config.focusMinutes * 60_000 : timer.remainingMs;
  // The ring FILLS as the session is gathered: offset = C while empty (start),
  // 0 when full (complete). offset = C * remaining/total.
  const remainingFrac = totalMs > 0 ? Math.max(0, Math.min(1, shownMs / totalMs)) : 0;
  const dashoffset = showComplete ? 0 : RING_C * remainingFrac;

  const ringColor = showComplete ? colors.mint : isBreak ? colors.cyanDim : colors.cyan;
  const eyebrowColor = phase === "focus" ? colors.cyanSoft : colors.cyanDim;
  const glyphColor = isBreak ? colors.cyanSoft : colors.bgDeep;
  const clock = formatClock(shownMs);
  const subMessage = phase === "idle" ? t("focus.subIdle") : isBreak ? t("focus.subBreak") : t("focus.subFocus");

  const cycle = target > 0 ? completed % target : 0;
  // A completed set (cycle === 0, completed > 0) shows all dots filled ONLY at the
  // completion/break boundary; the next focus block starts a fresh empty set.
  const filledDots = completed > 0 && cycle === 0 ? (showComplete || isBreak ? target : 0) : cycle;
  const dotColor = showComplete ? colors.mint : colors.cyan;

  function openSettings() {
    setDraftFocus(timer.config.focusMinutes);
    setDraftBreak(timer.config.breakMinutes);
    setSettingsOpen(true);
  }
  function saveSettings() {
    // The single 휴식 control scales the long break too (keeps the default 5->15 =
    // 3x ratio) so the long break isn't stuck at the hidden default.
    setTimer(createPomodoro({ ...timer.config, focusMinutes: draftFocus, breakMinutes: draftBreak, longBreakMinutes: draftBreak * 3 }));
    setShowComplete(false);
    setSettingsOpen(false);
  }

  return (
    <Shell title={t("focus.title")}>
      <View style={focusStyles.stage}>
        <SecondbHead size={48} mood={isBreak && !showComplete ? "neutral" : "positive"} />

        <View style={focusStyles.ringWrap}>
          <Svg width={226} height={226} viewBox="0 0 226 226">
            {/* Flat tokenized glow (no inline gradient — DESIGN.md: gradients only
                via deepSpaceGradients tokens). A faint same-tone disc reads as bloom. */}
            <Circle cx={113} cy={113} r={88} fill={ringColor} fillOpacity={0.1} />
            <Circle cx={113} cy={113} r={RING_R} fill="none" stroke={ringColor} strokeOpacity={0.14} strokeWidth={5} />
            <Circle
              cx={113}
              cy={113}
              r={RING_R}
              fill="none"
              stroke={ringColor}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={dashoffset}
              originX={113}
              originY={113}
              rotation={-90}
            />
          </Svg>
          <View style={focusStyles.ringCenter}>
            {showComplete ? (
              <>
                <View style={[focusStyles.completeCheck, { borderColor: colors.mint }]}>
                  <RNText style={[focusStyles.completeMark, { color: colors.mint }]}>✓</RNText>
                </View>
                <Text variant="heading" style={focusStyles.completeTitle}>{t("focus.completeTitle")}</Text>
                <Text variant="body" style={focusStyles.ringSub}>{t("focus.completeBody", { minutes: timer.config.focusMinutes })}</Text>
              </>
            ) : (
              <>
                <RNText style={[focusStyles.eyebrow, { color: eyebrowColor }]}>
                  {isBreak ? t("focus.eyebrowBreak") : t("focus.eyebrowFocus")}
                </RNText>
                <Text variant="heading" style={focusStyles.time}>{clock}</Text>
                <Text variant="body" style={focusStyles.ringSub}>{subMessage}</Text>
              </>
            )}
          </View>
        </View>

        <View style={focusStyles.dotsRow}>
          {Array.from({ length: target }).map((_, i) => (
            <View key={i} style={[focusStyles.dot, i < filledDots ? { backgroundColor: dotColor } : focusStyles.dotEmpty]} />
          ))}
        </View>

        {showComplete ? <Text variant="subtle" style={focusStyles.todayLine}>{t("focus.doneToday", { count: doneToday })}</Text> : null}
      </View>

      {showComplete ? (
        <View style={focusStyles.completeRow}>
          <Pressable
            style={focusStyles.choiceGhost}
            onPress={() => { setShowComplete(false); setTimer((s) => start(s)); }}
            accessibilityRole="button"
            accessibilityLabel={t("focus.btnBreak")}
          >
            <Text variant="caption" style={focusStyles.choiceGhostText}>{t("focus.btnBreak")}</Text>
          </Pressable>
          <Pressable
            style={focusStyles.choicePrimary}
            onPress={() => { setShowComplete(false); setTimer((s) => start(skipPhase(s))); }}
            accessibilityRole="button"
            accessibilityLabel={t("focus.btnAgain")}
          >
            <Text variant="caption" style={focusStyles.choicePrimaryText}>{t("focus.btnAgain")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={focusStyles.controls}>
          <Pressable
            style={[focusStyles.bigBtn, isBreak ? focusStyles.bigBtnGhost : focusStyles.bigBtnPrimary]}
            onPress={() => setTimer((s) => (s.running ? pause(s) : start(s)))}
            accessibilityRole="button"
            accessibilityLabel={timer.running ? t("focus.pause") : t("focus.start")}
            accessibilityState={{ busy: timer.running }}
          >
            {timer.running ? (
              <View style={focusStyles.pauseGlyph}>
                <View style={[focusStyles.pauseBar, { backgroundColor: glyphColor }]} />
                <View style={[focusStyles.pauseBar, { backgroundColor: glyphColor }]} />
              </View>
            ) : (
              <RNText style={[focusStyles.playGlyph, { color: glyphColor }]}>▶</RNText>
            )}
          </Pressable>
          {phase === "idle" ? (
            <>
              <Text variant="subtle" style={focusStyles.todayLine}>{t("focus.doneToday", { count: doneToday })}</Text>
              <Pressable onPress={openSettings} accessibilityRole="button" accessibilityLabel={t("focus.settings")}>
                <Text variant="subtle" style={focusStyles.subtleLink}>{t("focus.settings")}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => setTimer((s) => (isBreak ? skipPhase(s) : reset(s)))}
              accessibilityRole="button"
              accessibilityLabel={isBreak ? t("focus.skip") : t("focus.reset")}
            >
              <Text variant="subtle" style={focusStyles.subtleLink}>{isBreak ? t("focus.skip") : t("focus.reset")}</Text>
            </Pressable>
          )}
        </View>
      )}

      {settingsOpen ? (
        <View style={focusStyles.sheetBackdrop}>
          <Pressable style={focusStyles.sheetTap} onPress={() => setSettingsOpen(false)} accessibilityRole="button" accessibilityLabel={t("focus.close")} />
          <View style={focusStyles.sheet}>
            <View style={focusStyles.sheetHandle} />
            <RNText style={focusStyles.sheetLabel}>{t("focus.sessionLength")}</RNText>
            <FocusStepper
              label={t("focus.labelFocus")}
              hint={t("focus.focusHint")}
              value={draftFocus}
              unit={t("focus.unitMin")}
              decLabel={t("focus.decrease")}
              incLabel={t("focus.increase")}
              onDec={() => setDraftFocus((v) => Math.max(FOCUS_BOUNDS.focusMin, v - 5))}
              onInc={() => setDraftFocus((v) => Math.min(FOCUS_BOUNDS.focusMax, v + 5))}
            />
            <View style={focusStyles.sheetDivider} />
            <FocusStepper
              label={t("focus.labelBreak")}
              hint={t("focus.breakHint")}
              value={draftBreak}
              unit={t("focus.unitMin")}
              decLabel={t("focus.decrease")}
              incLabel={t("focus.increase")}
              onDec={() => setDraftBreak((v) => Math.max(FOCUS_BOUNDS.breakMin, v - 1))}
              onInc={() => setDraftBreak((v) => Math.min(FOCUS_BOUNDS.breakMax, v + 1))}
            />
            <Pressable style={focusStyles.sheetSave} onPress={saveSettings} accessibilityRole="button" accessibilityLabel={t("focus.save")}>
              <Text variant="caption" style={focusStyles.sheetSaveText}>{t("focus.save")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Shell>
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

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:colors.bgDeep}, stars:{...StyleSheet.absoluteFill,overflow:'hidden'}, star:{position:'absolute',width:3,height:3,borderRadius:2,backgroundColor:colors.cyanSoft}, scroll:{padding:spacing.lg,paddingBottom:40,gap:spacing.md}, titleRow:{flexDirection:'row',alignItems:'center',gap:spacing.md,marginBottom:spacing.xs}, back:{color:colors.cyanSoft,fontSize:34,lineHeight:38,fontFamily:fontFamilies.readable}, title:{color:colors.textTitle,fontSize:18,}, subtitle:{color:colors.textLo,fontSize:11,}, card:{backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm}, graphCard:{height:332,overflow:'hidden'}, centerCaption:{position:'absolute',left:0,right:0,top:156,textAlign:'center',color:colors.bgDeep,fontSize:11}, clusterLabel:{position:'absolute',color:colors.cyanSoft,fontSize:11}, ctaRow:{flexDirection:'row',gap:spacing.sm}, primary:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.cyan,borderRadius:radius.md,paddingVertical:spacing.md}, primaryText:{color:colors.bgDeep,fontSize:13}, secondary:{flex:1,alignItems:'center',justifyContent:'center',borderColor:colors.borderHi,borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.md}, secondaryText:{color:colors.cyanSoft,fontSize:13}, section:{color:colors.textTitle,fontSize:13,marginBottom:spacing.xs}, action:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:colors.border,paddingVertical:spacing.sm}, actionLabel:{color:colors.textHi,fontSize:14}, actionValue:{color:colors.textLo,fontSize:12}, chev:{color:colors.cyanSoft,fontSize:22}, toggle:{width:42,height:24,borderRadius:12,backgroundColor:colors.border,justifyContent:'center',padding:3}, toggleOn:{backgroundColor:colors.cyan}, knob:{width:18,height:18,borderRadius:9,backgroundColor:colors.textLo}, knobOn:{alignSelf:'flex-end',backgroundColor:colors.bgDeep}, footer:{color:colors.textLo,textAlign:'center',fontSize:12,}, center:{alignItems:'center',gap:spacing.sm}, prompt:{color:colors.textHi,fontSize:16,textAlign:'center'}, avatar:{width:92,height:92,borderRadius:46,borderWidth:1,borderColor:colors.borderHi,alignItems:'center',justifyContent:'center',backgroundColor:colors.cardBg}, danger:{alignSelf:'center',padding:spacing.md},dangerText:{color:colors.clay,fontSize:13}, lead:{color:colors.textMid,fontSize:14,textAlign:'center'}, authHero:{alignItems:'center',paddingTop:32,gap:spacing.md}, big:{color:colors.textTitle,fontSize:24,}, input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,color:colors.textHi,fontFamily:fontFamilies.readable,backgroundColor:colors.bgDeep}, link:{color:colors.cyanSoft,textAlign:'center',paddingTop:spacing.sm}, mail:{fontSize:44,color:colors.cyanSoft}, codeRow:{flexDirection:'row',justifyContent:'center',gap:spacing.xs}, codeCell:{width:40,height:48,borderRadius:radius.sm,borderWidth:1,borderColor:colors.borderHi,backgroundColor:colors.cardBg}, pill:{borderWidth:1,borderColor:colors.border,borderRadius:radius.pill,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs},pillText:{color:colors.cyanSoft,fontFamily:m3.font.mono,fontSize:8}, compareRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:spacing.lg,paddingVertical:spacing.sm}, compareCol:{alignItems:'center',gap:spacing.xs}, compareNum:{color:colors.textMid,fontSize:30}, compareNumHi:{color:colors.cyan}, compareCap:{color:colors.textLo,fontSize:11}, delta:{color:colors.mint,textAlign:'center',fontSize:13}, statRow:{flexDirection:'row',gap:spacing.sm}, statBox:{flex:1,alignItems:'center',gap:spacing.xs,backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,paddingVertical:spacing.md}, statNum:{color:colors.cyan,fontSize:28}, statCap:{color:colors.textLo,fontSize:11}, sizeRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm}, sizeCap:{color:colors.textLo,fontSize:12}, sizeCapLg:{color:colors.textHi,fontSize:18}, sizeTrack:{flex:1,height:4,borderRadius:2,backgroundColor:colors.border,justifyContent:'center'}, sizeKnob:{width:18,height:18,borderRadius:9,backgroundColor:colors.cyan,marginLeft:'46%'}, searchBox:{backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.md}, searchText:{color:colors.textLo,fontSize:13}, planPro:{borderColor:colors.borderHi}, planHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, planName:{color:colors.textTitle,fontSize:15}, planBadge:{color:colors.bgDeep,backgroundColor:colors.cyan,fontSize:8,paddingHorizontal:spacing.sm,paddingVertical:3,borderRadius:radius.sm,overflow:'hidden'}, planPrice:{color:colors.textHi,fontSize:22,marginVertical:spacing.xs}, planPer:{color:colors.textLo,fontSize:12}, planFeat:{color:colors.cyanSoft,fontSize:13,}, planFeatDim:{color:colors.textMid,fontSize:13,}, plansLoading:{alignItems:'center',gap:spacing.sm,paddingVertical:spacing.lg}, planBtnBusy:{opacity:0.5}, planSupportLink:{color:colors.cyan,fontSize:13,marginTop:spacing.sm}, planError:{color:colors.amber,fontSize:12,textAlign:'center'}, planRestore:{alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingVertical:spacing.md}, planRestoreText:{color:colors.textMid,fontSize:13},
 // ── Paywall (① 페이월) deep-space canon ──
 paySoulGlow:{position:'absolute',top:54,left:'50%',width:240,height:240,marginLeft:-120,borderRadius:120,backgroundColor:withAlpha(deepSpace.soul,0.14)},
 payStars:{...StyleSheet.absoluteFill,height:60,overflow:'hidden'},
 payStar:{position:'absolute',width:2,height:2,borderRadius:1,backgroundColor:withAlpha(deepSpace.accentSoft,0.5)},
 payStarSoul:{position:'absolute',width:2,height:2,borderRadius:1,backgroundColor:withAlpha(deepSpace.soul,0.45)},
 payHero:{paddingTop:spacing.sm,paddingBottom:spacing.xs,gap:spacing.md},
 payEyebrow:{color:deepSpace.soul,fontSize:8,letterSpacing:1.4},
 payTitle:{color:deepSpace.textHi,fontSize:24,lineHeight:34,fontWeight:'800',fontFamily:fontFamilies.readable},
 paySub:{color:withAlpha(deepSpace.accentSoft,0.66),fontSize:13.5,lineHeight:21,fontFamily:fontFamilies.readable},
 payCard:{borderWidth:1,borderColor:withAlpha(deepSpace.accent,0.18),borderRadius:radius.lg,backgroundColor:withAlpha(deepSpace.accent,0.04),padding:spacing.md,gap:spacing.sm},
 payCardFree:{borderColor:withAlpha(deepSpace.accent,0.18),backgroundColor:withAlpha(deepSpace.accent,0.04)},
 payCardPlus:{borderWidth:1.5,borderColor:withAlpha(deepSpace.accent,0.7),backgroundColor:withAlpha(deepSpace.accent,0.08),shadowColor:deepSpace.accent,shadowOpacity:0.3,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:6},
 payCardPro:{borderColor:withAlpha(deepSpace.soul,0.22),backgroundColor:withAlpha(deepSpace.soul,0.05)},
 payCardHead:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between'},
 payCardHeadPlus:{marginTop:spacing.xs},
 payRecTag:{position:'absolute',top:-9,left:spacing.md,color:deepSpace.onAccent,backgroundColor:deepSpace.accent,fontSize:7,letterSpacing:0.8,paddingHorizontal:9,paddingVertical:4,borderRadius:radius.sm,overflow:'hidden'},
 payTierNameFree:{color:deepSpace.accentBright,fontSize:15,fontWeight:'700',fontFamily:fontFamilies.readable},
 payTierNamePlus:{color:deepSpace.textHi,fontSize:17,fontWeight:'700',fontFamily:fontFamilies.readable},
 payTierNamePro:{color:deepSpace.soul,fontSize:15,fontWeight:'700',fontFamily:fontFamilies.readable},
 payPriceFree:{color:withAlpha(deepSpace.accentSoft,0.7),fontSize:14,fontFamily:fontFamilies.readable},
 payPricePlus:{color:deepSpace.accentBright,fontSize:14,fontFamily:fontFamilies.readable},
 payPricePro:{color:withAlpha(deepSpace.soul,0.85),fontSize:14,fontFamily:fontFamilies.readable},
 payPriceStrong:{color:deepSpace.accentBright,fontSize:16,fontWeight:'700'},
 payPriceStrongPro:{color:deepSpace.textHi,fontSize:15,fontWeight:'700'},
 payFeatList:{gap:7,marginTop:spacing.xs},
 payFeatRow:{flexDirection:'row',alignItems:'center',gap:9},
 payFeatFree:{flex:1,color:withAlpha(deepSpace.accentSoft,0.78),fontSize:12.5,fontFamily:fontFamilies.readable},
 payFeatPlus:{flex:1,color:deepSpace.accentBright,fontSize:12.5,fontFamily:fontFamilies.readable},
 payFeatPro:{flex:1,color:withAlpha(deepSpace.soul,0.85),fontSize:12.5,fontFamily:fontFamilies.readable},
 payActiveTag:{color:deepSpace.onAccent,backgroundColor:deepSpace.accent,fontSize:8,paddingHorizontal:spacing.sm,paddingVertical:3,borderRadius:radius.sm,overflow:'hidden'},
 payNameRow:{flexDirection:'row',alignItems:'baseline',gap:spacing.sm},
 payCurrentMarker:{color:deepSpace.accent,fontSize:9.5,letterSpacing:0.6,fontFamily:fontFamilies.readable},
 payFreeCaption:{color:withAlpha(deepSpace.accentSoft,0.7),fontSize:11,marginTop:spacing.xs,fontFamily:fontFamilies.readable},
 payCtaBlock:{marginTop:'auto',paddingTop:spacing.sm,gap:9},
 payTrustRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,marginBottom:spacing.xs},
 payTrust:{color:withAlpha(deepSpace.mint,0.85),fontSize:11.5,fontFamily:fontFamilies.readable},
 payPrimary:{minHeight:48,alignItems:'center',justifyContent:'center',backgroundColor:deepSpace.mint,borderRadius:radius.md,paddingVertical:spacing.md},
 payPrimaryDisabled:{opacity:0.5},
 payPrimaryText:{color:deepSpace.onMint,fontSize:16,fontWeight:'700',fontFamily:fontFamilies.readable},
 paySecondaryText:{color:withAlpha(deepSpace.accentSoft,0.6),fontSize:12.5,textAlign:'center',paddingVertical:11,fontFamily:fontFamilies.readable}, trendHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, primaryWide:{flex:1.6}, filterRow:{flexDirection:'row',flexWrap:'wrap',gap:6}, fchip:{paddingVertical:6,paddingHorizontal:11,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, fchipActive:{borderColor:colors.cyan,backgroundColor:colors.cardBg}, fchipViolet:{borderColor:colors.soulLine,backgroundColor:colors.cardBg}, fchipText:{color:colors.cyanSoft,fontSize:11}, fchipTextActive:{color:colors.textTitle}, fchipTextViolet:{color:colors.soul}, tlLabel:{color:colors.cyanDim,fontSize:7,letterSpacing:0.7,marginTop:spacing.sm}, tlGroup:{paddingLeft:16,borderLeftWidth:1,borderLeftColor:colors.border,gap:12,marginTop:spacing.xs}, tlRow:{flexDirection:'row',alignItems:'center',gap:9}, tlDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.cyan}, tlDotDim:{backgroundColor:colors.cyanDim}, tlTitle:{flex:1,color:colors.textTitle,fontSize:12.5}, tlTitleDim:{color:colors.textMid}, tlTime:{color:colors.cyanDim,fontSize:10}, tlTagRow:{flexDirection:'row',paddingLeft:32}, tlTag:{color:colors.cyanDim,fontSize:5,letterSpacing:0.4,paddingHorizontal:6,paddingVertical:3,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, progressRow:{flexDirection:'row',alignItems:'center',gap:10}, progressTrack:{flex:1,height:6,borderRadius:3,backgroundColor:colors.border,overflow:'hidden'}, progressFill:{height:'100%',borderRadius:3,backgroundColor:colors.cyan}, progressLabel:{color:colors.cyanSoft,fontSize:11}, triageCard:{borderColor:colors.borderHi}, triageMeta:{flexDirection:'row',alignItems:'center',gap:9}, metaLabel:{color:colors.cyanDim,fontSize:6,letterSpacing:0.5}, triageBody:{color:colors.textTitle,fontSize:13.5,}, footerLeft:{color:colors.textLo,fontSize:11,}, iconBtn:{width:46,paddingVertical:11,borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.md,alignItems:'center',backgroundColor:colors.bgDeep}, iconBtnText:{fontSize:15}, queueItem:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:9,paddingHorizontal:11,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm,backgroundColor:colors.cardBg}, queueItemDim:{opacity:0.6}, queueText:{flex:1,color:colors.textMid,fontSize:12}, researchGraph:{height:118,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.bgDeep,overflow:'hidden',justifyContent:'center',alignItems:'center'}, graphTag:{position:'absolute',bottom:14,color:colors.textMid,fontSize:10}, insightViolet:{borderWidth:1,borderColor:colors.soulLine,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, insightVioletText:{color:colors.textTitle,fontSize:13,}, evRow:{flexDirection:'row',gap:6}, evChip:{color:colors.cyanDim,fontSize:10,paddingHorizontal:8,paddingVertical:4,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, formatGrid:{flexDirection:'row',flexWrap:'wrap',gap:9}, formatCard:{width:'47%',padding:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,gap:4}, formatCardSel:{borderColor:colors.soulLine}, formatName:{color:colors.cyanSoft,fontSize:13}, formatNameSel:{color:colors.soul}, formatDesc:{color:colors.textLo,fontSize:10.5,}, soulPrimary:{alignItems:'center',justifyContent:'center',backgroundColor:colors.soul,borderRadius:radius.md,paddingVertical:spacing.md}, sourceRow:{flexDirection:'row',alignItems:'center',gap:11,paddingVertical:11,paddingHorizontal:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg}, sourceRowDim:{opacity:0.7}, sourceName:{color:colors.textTitle,fontSize:13}, sourceNameDim:{color:colors.textMid,fontSize:13}, sourceDesc:{color:colors.textLo,fontSize:10}, sourceCta:{color:colors.cyan,fontSize:11}, sourceSoon:{color:colors.cyanDim,fontSize:10}, reviewLabel:{color:colors.cyanBright,fontSize:7,letterSpacing:0.7,marginBottom:spacing.xs}, mapRow:{flexDirection:'row',alignItems:'center',gap:8}, mapFrom:{color:colors.cyanSoft,fontSize:12}, mapArrow:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:12}, mapTo:{color:colors.textTitle,fontSize:12}, recMetaRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'}, recMetaType:{color:colors.cyanSoft,fontSize:11}, recMetaDot:{color:colors.textLo,fontSize:11}, recMeta:{color:colors.textLo,fontSize:11}, recTitle:{color:colors.textTitle,fontSize:17,}, recBody:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,padding:spacing.md}, recBodyText:{color:colors.textHi,fontSize:12.5,}, iconBtnDanger:{borderColor:colors.clay}, opsStep:{borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, opsStepHead:{flexDirection:'row',alignItems:'flex-start',gap:spacing.sm}, opsStepTitle:{flex:1,color:colors.textTitle,fontSize:13.5,}, timeChipMint:{color:colors.mint,fontSize:10,borderWidth:1,borderColor:colors.mint,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:3,overflow:'hidden'}, timeChipCyan:{color:colors.textMid,fontSize:10,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:3,overflow:'hidden'}, opsReason:{color:colors.textMid,fontSize:11.5,}, opsStepFoot:{flexDirection:'row',alignItems:'center',gap:spacing.sm}, smallBtn:{marginLeft:'auto',backgroundColor:colors.cyan,borderRadius:radius.sm,paddingHorizontal:12,paddingVertical:7}, smallBtnText:{color:colors.bgDeep,fontSize:11}, smallBtnGhost:{marginLeft:'auto',borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.sm,paddingHorizontal:12,paddingVertical:7}, smallBtnGhostText:{color:colors.cyanSoft,fontSize:11}, wikiStatRow:{flexDirection:'row',gap:spacing.sm}, wikiViewToggle:{alignSelf:'stretch'}, wikiStat:{flex:1,flexDirection:'row',alignItems:'baseline',gap:6,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,paddingHorizontal:13,paddingVertical:11}, wikiStatNum:{color:colors.textTitle,fontSize:20}, wikiStatNumCyan:{color:colors.cyan}, wikiStatCap:{color:colors.textLo,fontSize:10.5}, wikiPageOpen:{borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, wikiPageHead:{flexDirection:'row',alignItems:'center',gap:7}, wikiPageTitle:{flex:1,color:colors.textTitle,fontSize:13.5}, wikiCaret:{color:colors.cyanDim,fontSize:14}, wikiBody:{color:colors.textHi,fontSize:11.5,}, wikiBacklinkRow:{flexDirection:'row',gap:6,flexWrap:'wrap',alignItems:'center'}, wikiBacklink:{color:colors.cyanSoft,fontSize:9.5,borderWidth:1,borderColor:colors.soulLine,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:4,overflow:'hidden'}, wikiPageRow:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,paddingHorizontal:13,paddingVertical:11,gap:5}, wikiRowHead:{flexDirection:'row',alignItems:'center',gap:7}, wikiRowTitle:{flex:1,color:colors.cyanSoft,fontSize:13}, wikiRowConn:{color:colors.cyanDim,fontSize:9.5}, wikiRowDesc:{color:colors.textLo,fontSize:11}, domainCard:{width:'47%',padding:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,gap:8}, domainCardActive:{borderColor:colors.cyan}, domainCardDim:{borderStyle:'dashed',borderColor:colors.borderHi,opacity:0.65}, domainName:{color:colors.textTitle,fontSize:14}, domainNameDim:{color:colors.textMid,fontSize:14}, domainNumRow:{flexDirection:'row',alignItems:'baseline',gap:5}, domainNum:{color:colors.cyanSoft,fontSize:22}, domainNumActive:{color:colors.cyan}, domainNumDim:{color:colors.textLo}, domainUnit:{color:colors.textLo,fontSize:10}, domainSub:{color:colors.cyanDim,fontSize:9.5}, topicCol:{gap:8}, topicRow:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:10,paddingHorizontal:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg}, topicDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.cyan}, topicDotDim:{backgroundColor:colors.cyanDim}, topicText:{flex:1,color:colors.textTitle,fontSize:12.5}, topicTextDim:{flex:1,color:colors.textMid,fontSize:12.5}, opsTodayHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, opsTodayRow:{minHeight:48,flexDirection:'row',alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm,paddingHorizontal:spacing.md,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg}, opsCheck:{width:22,height:22,borderRadius:radius.sm,borderWidth:1,borderColor:colors.borderHi,alignItems:'center',justifyContent:'center'}, opsCheckOn:{backgroundColor:colors.cyan,borderColor:colors.cyan}, opsCheckMark:{color:colors.bgDeep,fontSize:13,fontFamily:fontFamilies.readable}, opsTodayTitle:{flex:1,color:colors.textTitle,fontSize:13,}, opsTodayTitleDone:{color:colors.textLo,textDecorationLine:'line-through'},
  insightsWeeklyLabel:{color:colors.cyanDim,textAlign:'center',fontFamily:m3.font.mono,fontSize:7,letterSpacing:0.7,},
  insightsBars:{height:132,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:spacing.xl,paddingTop:spacing.sm},
  insightsBarCol:{width:78,alignItems:'center',gap:spacing.xs},
  insightsBarTrack:{height:88,width:34,justifyContent:'flex-end',borderRadius:radius.sm,backgroundColor:colors.bgDeep,overflow:'hidden',borderWidth:1,borderColor:colors.border},
  insightsBarFillMuted:{width:'100%',borderTopLeftRadius:radius.sm,borderTopRightRadius:radius.sm,backgroundColor:colors.borderHi},
  insightsBarFillActive:{width:'100%',borderTopLeftRadius:radius.sm,borderTopRightRadius:radius.sm,backgroundColor:colors.cyan},
  // --- focus timer (Wave 1, daily_focus) ---
  focusStage:{alignItems:'center',justifyContent:'center',paddingVertical:spacing.xl,gap:spacing.sm},
  focusPhase:{color:colors.cyanDim,fontFamily:m3.font.mono,fontSize:8,letterSpacing:1.2,textTransform:'uppercase'},
  focusClock:{color:colors.textTitle,fontSize:64,},
  focusControls:{flexDirection:'row',gap:spacing.sm},
  // --- srs review (Wave 1, language_practice) ---
  srsCard:{minHeight:200,backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.lg,padding:spacing.lg,alignItems:'center',justifyContent:'center',gap:spacing.md},
  srsFaceLabel:{color:colors.cyanDim,fontSize:8,letterSpacing:1.2,textTransform:'uppercase'},
  srsFaceText:{color:colors.textTitle,fontSize:24,textAlign:'center'},
  srsHint:{color:colors.textLo,fontSize:11},
  srsRatingRow:{flexDirection:'row',gap:spacing.xs},
  srsRatingBtn:{flex:1,alignItems:'center',justifyContent:'center',borderColor:colors.borderHi,borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.md},
  srsRatingText:{color:colors.cyanSoft,fontSize:12},
  // --- auth (sign-in / sign-up / reset) deep-space presentation ---
  authLabel:{color:colors.textMid,fontSize:7,letterSpacing:0.7,textTransform:'uppercase',marginBottom:4},
  authLabelRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  eyeBtn:{minWidth:44,minHeight:36,alignItems:'flex-end',justifyContent:'center'},
  eyeText:{color:colors.cyanSoft,fontSize:11},
  providerBtn:{alignItems:'center',justifyContent:'center',borderColor:colors.borderHi,borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.md},
  providerBtnText:{color:colors.cyanSoft,fontSize:13},
  providerRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  providerBadge:{color:colors.cyanSoft,fontSize:14,fontWeight:'800'},
  btnDisabled:{opacity:0.45},
  authDividerRow:{flexDirection:'row',alignItems:'center',gap:spacing.md,marginVertical:spacing.xs},
  authDividerLine:{flex:1,height:StyleSheet.hairlineWidth,backgroundColor:colors.border},
  authDividerLabel:{color:colors.textLo,fontSize:7,letterSpacing:0.7,textTransform:'uppercase'},
  authDanger:{color:colors.clay,fontSize:12,},
  authHelper:{color:colors.textMid,fontSize:11.5,},
  authLinkRow:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  authForgotRow:{minHeight:44,alignItems:'center',justifyContent:'center'},
  authHelpCard:{borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.md,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm},
  authHelpTitle:{color:colors.textTitle,fontSize:13},
  authHelpBody:{color:colors.textMid,fontSize:11.5,},
  authToastWrap:{position:'absolute',left:spacing.lg,right:spacing.lg,bottom:spacing.xl,alignItems:'stretch'},
  authToast:{borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.sm,paddingHorizontal:spacing.md},
  authToastInfo:{borderColor:colors.borderHi,backgroundColor:colors.cardBg},
  authToastSuccess:{borderColor:colors.mint,backgroundColor:colors.cardBg},
  authToastDanger:{borderColor:colors.clay,backgroundColor:colors.cardBg},
  authToastText:{color:colors.textHi,fontSize:12.5,},
  consentGroupLabel:{color:colors.cyanBright,fontSize:7,letterSpacing:0.7,textTransform:'uppercase',marginTop:spacing.xs},
  consentIntro:{color:colors.textMid,fontSize:11.5,},
  consentRow:{flexDirection:'row',alignItems:'flex-start',gap:spacing.sm,minHeight:40,paddingVertical:spacing.xs},
  consentCheckbox:{width:22,height:22,borderRadius:radius.sm,borderWidth:1,borderColor:colors.borderHi,alignItems:'center',justifyContent:'center',marginTop:1},
  consentCheckboxOn:{borderColor:colors.cyan,backgroundColor:colors.cyan},
  consentCheckmark:{color:colors.bgDeep,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:15},
  consentLabel:{flex:1,color:colors.textHi,fontSize:12,},
  consentDivider:{height:1,backgroundColor:colors.border,opacity:0.6,marginVertical:spacing.xs},
  minorBanner:{borderWidth:1,borderLeftWidth:4,borderColor:colors.soulLine,borderRadius:radius.sm,backgroundColor:colors.cardBg,padding:spacing.sm},
  minorBannerText:{color:colors.soul,fontSize:11.5,},
  checklistRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm,minHeight:24},
  checklistDot:{width:8,height:8,borderRadius:4},
  checklistText:{flex:1,fontSize:11.5}});
