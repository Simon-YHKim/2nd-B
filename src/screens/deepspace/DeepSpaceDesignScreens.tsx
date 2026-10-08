import { PhonePressable as Pressable, PhoneScrollView as ScrollView, PhoneTextInput as TextInput, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WeatherPrivacyControl } from "@/components/privacy/WeatherPrivacyControl";
import { AppState, Linking, Platform, Share, StyleSheet } from "react-native";
import { PlainText as RNText } from "@/components/ui/PlainText";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { Redirect, router, useNavigation } from "expo-router";
import { useAppRouter } from "@/lib/nav/phone-embed";
import { useGoHomeStop } from "@/lib/nav/go-home";
import { useTranslation } from "react-i18next";
import { renderedUiLanguage } from "@/lib/i18n/ui-language";
import Svg, { Rect, SvgXml } from "react-native-svg";
import { colors, spacing } from "@/theme/tokens";
import { GLYPH_ALIAS, glyphMarkup, type GlyphAliasName } from "@/components/pixel/pixel-glyphs";
import { ringCells, stepLine } from "@/components/pixel/pixel-line";
import { PixelNodeSvg, PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { PixelSurface } from "@/components/pixel";

/**
 * `/graph`(개발 전용 화면)의 노드 지도 색.
 * 원래 `opacity` 로 만들던 것을 미리 합성해 둔다(PIXEL-CLAY 규칙 4).
 */
const GRAPH_ME_FILL = flattenAlpha(colors.soul, 0.95, m3.accent.stageFloor);
const GRAPH_NODE_FILL = flattenAlpha(colors.cyan, 0.22, m3.accent.stageFloor);
const GRAPH_DOT_FILL = flattenAlpha(colors.cyanSoft, 0.75, m3.accent.stageFloor);
import { ddsStyles as styles } from "./dds-styles";
import { canonGaps, canonMore } from "@/lib/canon";
import { reactExpression } from "@/lib/companion/expression";
import { kstDateToday } from "@/lib/chat/limits";
import { flattenAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { MdButton, MdCard, MdChip, m3TextStyle } from "@/components/m3";
import { PremiumModal } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { HelpDirectory } from "@/components/safety/HelpDirectory";
// (No theme-mode hook: the dark/light choice was removed on 2026-10-05, Q-261005-02.)
import { useFontStyle } from "@/lib/settings/readable-font";
import { useLiteMode } from "@/lib/settings/lite-mode";
import { useSoundEffects } from "@/lib/settings/sound-effects";
import { DeepSpaceLoader, SecondbHead, SecondbStatusHeader } from "@/components/deepspace";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { FilterChip } from "./dds-wiki-records-screens";
import { buildInfoLine } from "@/lib/build-info";
import { useAuth } from "@/lib/auth/AuthContext";
import { gatherRisingInterests } from "@/lib/trends/gather";
import type { RisingInterest } from "@/lib/trends/rising";
import {
  AuthSessionOwnerChangedError,
  captureSignOutExpectation,
  signOutExpected,
} from "@/lib/supabase/auth";
import { requestAccountDeletion } from "@/lib/records/delete-bulk";
import {
  createAccountDeletionCompletion,
  dismissAccountDeletionNotice,
  type LocalPurgeOutcome,
} from "@/lib/account/deletion-completion";
import { purgeDeletedAccountLocalData } from "@/lib/account/local-purge";
import { currentAccountEpoch } from "@/lib/auth/account-epoch";
import { buildPersona, loadPersonaRatifiableSignals } from "@/lib/persona/build";
import { proposalContextForStar } from "@/lib/persona/proposal-context";
import { proposeSelfModelChange } from "@/lib/persona/propose-self-model";
import { applyRatify, type RatifyDecision, type SelfModelProposal } from "@/lib/persona/proposal";
import type { LadderLevel } from "@/lib/persona/brightness";
import { recordStarTiers } from "@/lib/persona/record-star-tiers";
import { loadSevenRatified, recordSevenTiers } from "@/lib/persona/seven-tier-history";
import { RATIFY_L5_CUE, WIKI_LINK_CUE, ratifyL5CueAllowed } from "@/lib/audio/app-cues";
import { useUiSound } from "@/lib/audio/use-ui-sound";
import {
  buildSevenProposalContext,
  sevenRatifiableTargets,
  type SevenRatifiableTarget,
} from "@/lib/persona/seven-proposal-context";
import { getSevenStar, type SevenStarId } from "@/lib/persona/seven-stars";
import { ratifiableTargets, type RatifiableTarget } from "@/lib/persona/ratifiable";

// 어떤 도구가 채운 축인지로 라벨을 고른다. Big Five 는 BFI-44 로 왔든
// IPIP-NEO-120 으로 왔든 사용자에게는 같은 "성격" 이라 같은 문구를 쓴다.
const AXIS_LABEL_KEY: Record<RatifiableTarget["sourceAssessmentId"], string> = {
  bfi44: "reviewAxisNow",
  ipipNeo120: "reviewAxisNow",
  ecrS: "reviewAxisRelational",
  values: "reviewAxisValues",
};
import type { StarId } from "@/lib/persona/stars";
import { loadEvidenceShards } from "@/lib/persona/load-evidence-shards";
import { type EvidenceShard } from "@/lib/persona/evidence";
import { RatifySheet, runRatifyDecisionOnce } from "@/components/persona/RatifySheet";
import { fetchPrivacyPrefs, savePrivacyPrefs } from "@/lib/supabase/privacy";
import { captureEvent, proposalDecided, setAnalyticsConsent } from "@/lib/analytics";
import type { PrivacyPrefKey, PrivacyPrefs } from "@/lib/privacy/prefs";
import {
  backfillAllRecordEmbeddings,
  clearRecordEmbeddings,
  embedVendorLabel,
} from "@/lib/records/records-embeddings";
import { recordRecommendationsConsent } from "@/lib/supabase/consent";
import { HealthWithdrawCard } from "./dds-health-withdraw-card";
import { recommendationVendorLabel } from "@/lib/ops/recommend";
import {
  notifyNow,
} from "@/lib/ops/reminders";
import { loadNotifications } from "@/lib/ops/notifications-sdk";
import {
  applyFocusSessionComplete,
  applyLanguageReviewComplete,
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
import {
  EMPTY_FOCUS_DAY,
  FOCUS_AREAS,
  completeFocusSession,
  focusTallyToSave,
  focusedMinutesToday,
  freshFocusTally,
  restoreFocusTally,
  type FocusTally,
} from "@/lib/ops/focus-tally";
import { loadFocusArea, loadFocusDay, saveFocusArea, saveFocusDay } from "@/lib/ops/focus-store";
import type { LifeArea } from "@/lib/dashboard/model";
import {
  listAllWikiLinks,
  listInferredLinkDetails,
  listWikiPages,
  ratifyLink,
  rejectInferredLink,
  type InferredLinkDetail,
} from "@/lib/wiki/queries";
import { exportUserWiki } from "@/lib/wiki/export";
import { backfillEmbeddings, proposeAllRelatedLinks } from "@/lib/wiki/embeddings";
import { exportIden } from "@/lib/iden/iden-export";
import { buildIdenDoc } from "@/lib/iden/build-iden";
import { listRecentRecords } from "@/lib/records/create";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import { recordsToResearchGraph } from "@/lib/records/records-research";
import type { GraphRecord } from "@/lib/records/records-graph";
import { listSourcePieces } from "@/lib/records/source-pieces";
import { summarizeWeeklyInsights, weeklyDomainFocus } from "@/lib/insights/weekly";
import type { WikiPageRow } from "@/lib/wiki/types";
import {
  buildDeepResearchView,
  buildDomainsView,
  recencyLabel,
  type RecencyLabels,
  type WikiEdge,
} from "./wiki-graph-view";
import {
  INTEGRATION_ENTRYPOINTS,
  type IntegrationEntrypoint,
} from "./integrations/sources";

/** /review 끝의 '이력에 남는다' 문구. 이력 원장이 생기기 전까지 끈다(설계 대화 발주 a, 2026-10-07). */
const REVIEW_LEDGER_NOTE = false;

// i18n label builders for the pure date helpers (which stay i18n-free).
type Tx = (key: string, options?: Record<string, unknown>) => string;
function dsRecencyLabels(t: Tx): RecencyLabels {
  return {
    today: t("time.today"),
    yesterday: t("time.yesterday"),
    daysAgo: (n) => t("time.daysAgo", { count: n }),
  };
}

type Row = { label: string; value?: string; onPress?: () => void; on?: boolean; disabled?: boolean };

/** Wiki rows, kept with the account they were fetched for.
 *
 *  The twin of this type in dds-wiki-records-screens.tsx, deliberately duplicated
 *  rather than shared: these two loaders feed different screens with different
 *  visual and data contracts, and merging them is its own change. What is copied
 *  here is the FENCE, not the screens.
 *
 *  Supabase can publish owner A -> owner B with no signed-out frame in between, and
 *  AuthContext supports that publication on purpose. The scene boundary in
 *  app/_layout.tsx remounts every product scene on an account epoch, so in the
 *  shipped tree this state is thrown away before B can read it - that boundary is
 *  the real defence and this is not a claim that it is broken. But it lives in
 *  another file and applies per route, so a screen ever mounted outside it would
 *  read the previous account's rows with nothing here to stop it. */
interface OwnedWikiRows {
  ownerId: string | null;
  pages: WikiPageRow[];
  edges: WikiEdge[];
}

/** Shared so an owner mismatch returns a stable reference and costs no re-render. */
const NO_WIKI_ROWS: OwnedWikiRows = { ownerId: null, pages: [], edges: [] };

// Shared loader for the two graph-backed deep-space screens (/wiki + /research).
// Mirrors what the legacy /wiki loads: pages + the full edge set, both bounded.
// A links failure degrades to a zero-edge graph rather than blanking the screen.
function useWikiGraphData() {
  const { userId, loading: authLoading } = useAuth();
  const [held, setHeld] = useState<OwnedWikiRows>(NO_WIKI_ROWS);
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
        setHeld({ ownerId: userId, pages: p, edges: e });
      })
      .catch(() => {
        if (!alive) return;
        setHeld({ ownerId: userId, pages: [], edges: [] });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Read back only for the owner they were loaded under. The effect above overwrites
  // `held` only once the network answers, so without this the previous account's rows
  // would be what the screen draws for the whole refetch window.
  const owned = held.ownerId !== null && held.ownerId === userId ? held : NO_WIKI_ROWS;
  return { userId, authLoading, pages: owned.pages, edges: owned.edges, loading };
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
  // Phone-aware: inside the dashboard phone, back steps the phone's stack.
  const router = useAppRouter();
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title ?? ""} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {subtitle ? <Text variant="subtle" style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

// Shell — 이제 DockShell 과 같은 껍데기다(= DeepSpaceScreen 안).
//
// 왜 바뀌었나 (2026-08-28 실측): 이 Shell 은 dock 도 SafeAreaView 도 없는 순수
// View 였고, **13개 화면**(점검·매뉴얼·인사이트·형식·권한·개인정보·지원·테마·
// 발견·연결 찾기·영역·복습·그래프)이 그걸 쓰고 있었다. 그래서 그 화면들에서는
// 하단 탭바가 통째로 사라졌다 — 레퍼런스는 모든 화면에서 탭바를 유지하는데도.
// 레퍼런스 대조에서 그 화면들이 매번 5칸(별자리·담기·세컨비·위키·설정)을 잃고
// 있었고, /review 가 31% 에 머문 이유의 절반이 이것이었다.
//
// 같은 파일이 이미 갖고 있던 DockShell 이 정답 형태였고(옆 파일
// dds-wiki-records-screens.tsx 의 Shell 은 진작 이렇게 고쳐져 있었다 — P5
// 메가파일 분할 때 한쪽만 고쳐진 것이다), 여기서는 그쪽으로 위임만 한다.
//
// ⚠ active="lens" 는 TABS(home/capture/chat/wiki/settings) 밖이다. 그래서
// (a) 어떤 탭도 잘못 하이라이트되지 않고 (b) DeepSpaceScreen 의 BackHandler
// 특례가 걸리지 않아 **하드웨어 뒤로가기 동선이 바뀌지 않는다**(기본 pop 유지).
// 제목은 상단 앱바가 갖는다 — 화면 안에 또 큰 제목을 두면 같은 말이 두 번 나온다.
function Shell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return <DockShell title={title} subtitle={subtitle}>{children}</DockShell>;
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
function Toggle({ label, value, on = true, onPress, disabled = false }: Row) {
  const body = (
    <>
      <View style={TOGGLE_TEXT}><Text variant="body" style={styles.actionLabel}>{label}</Text>{value ? <Text variant="body" style={styles.actionValue}>{value}</Text> : null}</View>
      <View style={[styles.toggle,on&&styles.toggleOn]}><View style={[styles.knob,on&&styles.knobOn]} /></View>
    </>
  );
  if (onPress) {
    return <Pressable style={styles.action} onPress={onPress} disabled={disabled} accessibilityRole="switch" accessibilityState={{ checked: on, disabled }} accessibilityLabel={label}>{body}</Pressable>;
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
  return <Shell title={t("graph.title")} subtitle={t("graph.subtitle", { nodes: nodeCount, edges: edgeCount })}><SecondbStatusHeader text={t("graph.status")} tip={t("graph.tip")} /><Card style={styles.graphCard}><View style={styles.graphStage}><Svg width={300} height={310} viewBox="0 0 300 310">{clusters.map((c,i)=>stepLine(150,160,c.x,c.y,3).map((p,j)=><Rect key={'l'+i+'-'+j} x={p.x} y={p.y} width={3} height={3} fill={colors.borderHi}/>))}<PixelStarSvg cx={150} cy={160} r={34} fill={GRAPH_ME_FILL} onPress={() => router.push('/account')}/>{clusters.map((c,i)=><PixelNodeSvg key={'c'+i} cx={c.x} cy={c.y} r={22} fill={GRAPH_NODE_FILL} onPress={() => router.push(c.route)}/>) }<PixelStarSvg cx={150} cy={160} r={9} fill={colors.textHi} onPress={() => router.push('/account')}/>{[42,86,118,244,257,188,72].map((x,i)=><PixelStarSvg key={i} cx={x} cy={70+i*30%190} r={4} fill={GRAPH_DOT_FILL}/>)}</Svg><Text variant="caption" style={styles.centerCaption}>{t("graph.me")}</Text>{clusters.map((c)=><Pressable key={c.t} onPress={() => router.push(c.route)} accessibilityRole="button" accessibilityLabel={c.t} style={{position:'absolute',left:c.x-18,top:c.y+23}}><Text variant="body" style={[styles.clusterLabel,{position:'relative'}]}>{c.t}</Text></Pressable>)}</View></Card><View style={styles.ctaRow}><Pressable style={styles.primary} onPress={() => router.push('/records')}><Text variant="caption" style={styles.primaryText}>{t("graph.viewClusters")}</Text></Pressable><Pressable style={styles.secondary} onPress={() => router.push('/research')}><Text variant="caption" style={styles.secondaryText}>{t("graph.findConnections")}</Text></Pressable></View></Shell>;
}

function IntegrationEntryRow({ source, t }: { source: IntegrationEntrypoint; t: Tx }) {
  const [held, setHeld] = useState(false); // 이 값이 스타일을 바꾸는 래퍼 View 는 collapsable={false} - 누름·뗌이 자식을 옮기지 않게(PixelPressable 과 같은 이유, 커밋 2eb6266b)
  const name = source.nameKey ? t(source.nameKey) : source.name ?? source.id;
  const detail = t(source.detailKey);
  const action = t(source.actionKey);

  return (
    <Pressable
      onPress={() => router.push(source.route)}
      onPressIn={() => setHeld(true)}
      onPressOut={() => setHeld(false)}
      accessibilityRole="button"
      accessibilityLabel={t("connect.a11yGo", { name })}
      accessibilityHint={detail}
      style={cx.integrationHit}
    >
      <View collapsable={false} style={held ? cx.integrationPressed : cx.integrationRest}>
        <PixelSurface
          variant="bevel"
          pressed={held}
          background={m3.color.surfaceContainerHigh}
          contentStyle={cx.integrationRow}
        >
          <PixelSurface
            variant="inset"
            background={m3.color.surfaceContainerHighest}
            style={cx.integrationIconFrame}
            contentStyle={cx.integrationIcon}
          >
            <CloneIcon name={source.icon} color={m3.color.onSurfaceVariant} size={22} />
          </PixelSurface>
          <View style={cx.flex1}>
            <RNText numberOfLines={2} style={[m3TextStyle("titleSmall"), cx.integrationName]}>{name}</RNText>
            <RNText numberOfLines={2} style={[m3TextStyle("bodySmall"), cx.integrationDetail]}>{detail}</RNText>
          </View>
          <PixelSurface
            variant="bevel"
            pressed={held}
            background={m3.color.primary}
            style={cx.integrationActionFrame}
            contentStyle={cx.integrationAction}
          >
            <RNText numberOfLines={3} style={[m3TextStyle("labelSmall"), cx.integrationActionText]}>{action}</RNText>
          </PixelSurface>
        </PixelSurface>
      </View>
    </Pressable>
  );
}

// PIXEL-CLAY `connect` 프레임을 실제 `/integrations` 진입 허브로 살린다.
// 이 화면은 연결 상태를 소유하지 않는다. 각 행은 그 상태를 실제로 소유하는
// production flow 로 이동한다: OAuth/export는 /import-hub, 네이티브 건강 권한과
// denied/unavailable/empty 상태는 /import, 사진은 /capture. 따라서 여기에는
// local toggle도, 근거 없는 "연결됨" 상태도 없다.
export function DeepSpaceIntegrationsScreen() {
  const { t } = useTranslation(["deepspace", "import"]);
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={t("connect.title")} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={cx.integrationBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <RNText style={[m3TextStyle("headlineSmall"), cx.integrationTitle]}>{t("connect.title")}</RNText>
        <RNText style={[m3TextStyle("bodyMedium"), cx.integrationLead]}>{t("connect.lead")}</RNText>
        <PixelSurface
          variant="inset"
          background={m3.color.secondaryContainer}
          style={cx.integrationConsentFrame}
          contentStyle={cx.integrationConsent}
        >
          <View style={cx.integrationConsentRow}>
            <CloneIcon name="lock" color={m3.color.onSecondaryContainer} size={20} />
            <RNText style={[m3TextStyle("bodySmall"), cx.integrationConsentText]}>{t("connect.consent")}</RNText>
          </View>
        </PixelSurface>
        <View style={cx.integrationStack}>
          {INTEGRATION_ENTRYPOINTS.map((source) => (
            <IntegrationEntryRow key={source.id} source={source} t={t} />
          ))}
        </View>
      </ScrollView>
    </DeepSpaceScreen>
  );
}

// ── gaps.json canon content (support / privacy / manual) ──────────────────
// KO copy renders straight from canonGaps (pixel contract, verbatim). Every other
// language reads the deepspace keys below, index-aligned with the SAME canon
// arrays (Q-261005-01 = A, R2B-03). Until 2026-10-06 these were EN mirrors in
// this file, so es/pt/id fell back to English. The ko values of these keys
// mirror the canon byte for byte (tr1-locale-copy.test.ts) and only keep the
// five-locale key parity; the ko screen still reads the canon.
//
// HONESTY (audit follow-up) for support.faqs.call: transcription is cloud STT
// through the spend-capped LLM proxy, not on-device; the old copy claimed
// on-device. What IS true: the original audio is deleted from the device right
// after transcription.
const GAPS_FAQ_KEYS = ["brightness", "plan", "call"] as const;
const GAPS_NOTICE_KEYS = ["modes", "museum", "voice"] as const;
const GAPS_FACT_KEYS = ["onDevice", "collect", "retention", "delete"] as const;

// Map a canon Material-symbol icon name to a local CLONE_ICON glyph, falling
// back to a sensible sparkle when a name has no glyph yet.
function gapGlyph(name: string): CloneIconName {
  return (CLONE_ICON.has(name) ? name : "sparkle") as CloneIconName;
}

// Token-only styles for the gaps-pack sections (FAQ / notices / facts / concepts).
const gap = StyleSheet.create({
  flex1: { flex: 1 },
  row: { paddingVertical: spacing.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  qRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  answer: { marginTop: spacing.xs },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  tag: { borderRadius: m3.shape.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagText: { color: colors.cyanSoft, fontSize: 11 },
  factRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", paddingVertical: spacing.sm },
  factText: { flex: 1, gap: 2 },
});

export function DeepSpaceSupportDesignScreen() {
  // Phone-aware: inside the dashboard phone, links open in the phone.
  const router = useAppRouter();
  const { t, i18n } = useTranslation("deepspace");
  const ko = renderedUiLanguage(i18n) === "ko";
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  return (
    <Shell title={t("support.title")}>
      <View style={styles.center}><SecondbHead size={104} mood="neutral" /><Text variant="heading" style={styles.prompt}>{t("support.prompt")}</Text></View>
      <Card>{[{label:t("support.askSecondb"),onPress:()=>router.push('/secondb')},{label:t("support.viewManual"),onPress:()=>router.push('/manual')},{label:t("support.emailUs"),onPress:()=>Linking.openURL('mailto:kim0405@hayangzip.com')},{label:t("support.reportBug"),onPress:()=>Linking.openURL('mailto:kim0405@hayangzip.com?subject=Bug%20report')}].map((r)=><Action key={r.label} {...r}/>)}</Card>

      {/* Always-on help directory. Above the FAQ on purpose: someone who needs
          it is not going to scroll past a list of product questions first. */}
      <HelpDirectory />

      {/* FAQ (canonGaps.faqs) — tap a question to reveal its answer. */}
      <Card>
        <Text variant="caption" style={styles.section}>{t("support.faqTitle")}</Text>
        {canonGaps.faqs.map((f, i) => {
          const key = GAPS_FAQ_KEYS[i];
          const q = ko || !key ? f.q : t(`support.faqs.${key}.q`);
          const a = ko || !key ? f.a : t(`support.faqs.${key}.a`);
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
          const key = GAPS_NOTICE_KEYS[i];
          const title = ko || !key ? n.t : t(`support.notices.${key}.t`);
          const tag = ko || !key ? n.tag : t(`support.notices.${key}.tag`);
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
          <Action label={t("account.navPassword")} onPress={() => router.push("/change-password")} />
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
  // Phone-aware: inside the dashboard phone, links open in the phone. The
  // post-deletion replace("/sign-in") still leaves the phone (auth exit path).
  const router = useAppRouter();
  const { t, i18n } = useTranslation("deepspace");
  const { t: consentT } = useTranslation("consent");
  const navigation = useNavigation();
  // Picks the canon fact copy and the consent-ledger locale below. Every other
  // string on this screen reads a deepspace key, so es/pt/id see their own
  // language (Q-261005-01 = A, R2B-03).
  const ko = renderedUiLanguage(i18n) === "ko";
  const { userId, isMinor, loading: authLoading } = useAuth();
  // AuthContext derives this from users.birth_date. Unknown age fails closed,
  // so Clarity/GA4 and ads cannot be enabled while the profile is resolving.
  const minor = isMinor !== false;
  const minorRef = useRef(minor);
  minorRef.current = minor;
  const activeUserRef = useRef(userId);
  activeUserRef.current = userId;
  const privacyMountedRef = useRef(true);
  const prefsRef = useRef<PrivacyPrefs | null>(null);
  const prefsUserRef = useRef<string | null>(null);
  const [analyticsOn, setAnalyticsOn] = useState<boolean | null>(null);
  const [adsOn, setAdsOn] = useState<boolean | null>(null);
  const [externalError, setExternalError] = useState<{
    key: "external_analytics" | "ads";
    attemptedOn: boolean;
  } | null>(null);
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState(false);
  // State alone cannot fence two events in the same render frame (keyboard
  // submit + tap, or a rapid modal double-tap). Keep the destructive call
  // single-flight synchronously.
  const deleteInFlightRef = useRef(false);
  const allowDeletionNavigationRef = useRef(false);
  const deleteConfirmUserRef = useRef<string | null>(null);

  useEffect(() => {
    privacyMountedRef.current = true;
    return () => {
      privacyMountedRef.current = false;
    };
  }, []);

  async function runDeleteAccount() {
    if (
      !userId
      || deleteInFlightRef.current
      || delConfirm !== "DELETE"
      || deleteConfirmUserRef.current !== userId
    ) return;
    const targetUserId = userId;
    deleteConfirmUserRef.current = null;
    deleteInFlightRef.current = true;
    setDeleting(true);
    setDelError(false);
    // The receipt says what the server erased and what it could not confirm.
    // It used to be discarded here, so a user who deleted their account was
    // signed out and shown a sign-in form, and never learned any of it.
    let receipt: Awaited<ReturnType<typeof requestAccountDeletion>>;
    let authExpectation: Awaited<ReturnType<typeof captureSignOutExpectation>>;
    try {
      authExpectation = await captureSignOutExpectation();
      if (authExpectation.userId !== targetUserId) {
        throw new AuthSessionOwnerChangedError();
      }
      // The helper acknowledges the owner-scoped local fence before its first
      // Edge invoke. The server then commits its database fence, proves Storage
      // empty, and only then deletes Auth so the database cascade runs last.
      receipt = await requestAccountDeletion(authExpectation);
    } catch {
      deleteInFlightRef.current = false;
      // Lift the fence whoever owns the screen now: a stuck `deleting` exempts a signed-out visitor from the guard below.
      if (privacyMountedRef.current) setDeleting(false);
      // Only the account that asked sees its failure.
      if (privacyMountedRef.current && activeUserRef.current === targetUserId) setDelError(true);
      return;
    }

    // The server side is gone. Drop every managed owner-scoped local value,
    // including unsent drafts, import/GitHub pointers, and this owner's queued
    // audit writes. Another account's entries are never touched, and local I/O
    // cannot turn a completed remote deletion back into a failure.
    let localPurge: LocalPurgeOutcome = "unconfirmed";
    try {
      localPurge = await purgeDeletedAccountLocalData(targetUserId);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[privacy] local purge after deletion failed", (e as Error).message);
    }

    // Terminal erasure already succeeded. Do not let a local sign-out failure
    // expose a destructive Retry, and never sign out a newly active B session
    // after an A request resolves late.
    if (!privacyMountedRef.current) return;
    if (activeUserRef.current !== targetUserId) {
      deleteInFlightRef.current = false;
      setDeleting(false);
      return;
    }
    // Successful erasure may itself trigger an auth-driven route removal.
    // Let that navigation, sign-out, and the explicit replacement proceed.
    allowDeletionNavigationRef.current = true;
    // Hand the receipt to the store that survives exactly this owner -> null
    // transition, so the destination screen can show it with the observed
    // local-cleanup result.
    const completion = createAccountDeletionCompletion(targetUserId, currentAccountEpoch());
    completion.beginSignOut(receipt, localPurge);
    try {
      await signOutExpected(authExpectation);
      completion.finishSignOut(true);
    } catch (e) {
      if (e instanceof AuthSessionOwnerChangedError) {
        // A's server deletion succeeded, but B now owns local auth. Preserve B
        // and suppress A's receipt/navigation rather than treating it as a
        // local-clear failure against the wrong owner.
        completion.dispose();
        dismissAccountDeletionNotice();
        deleteInFlightRef.current = false;
        if (privacyMountedRef.current) setDeleting(false);
        return;
      }
      completion.finishSignOut(false);
      if (typeof console !== "undefined") {
        console.warn("[privacy] local sign-out after deletion failed; phase=account-deletion");
      }
    }
    completion.dispose();
    router.dismissAll();
    router.replace("/sign-in");
  }

  function requestDeleteAccountConfirm() {
    if (!userId || deleteInFlightRef.current || delConfirm !== "DELETE") return;
    deleteConfirmUserRef.current = userId;
    setDeleteConfirmOpen(true);
  }

  // Shell's top back action and persistent dock both remove this route. Once the user confirms terminal
  // erasure, keep the screen mounted until the Edge Function reports success/failure so navigation cannot strand a half-flow.
  useEffect(() => {
    // Register once instead of waiting for the deleting-state render. The ref
    // flips synchronously inside runDeleteAccount, so even a same-frame dock tap
    // after final confirmation is fenced.
    return navigation.addListener("beforeRemove", (event) => {
      if (!deleteInFlightRef.current || allowDeletionNavigationRef.current) return;
      event.preventDefault();
    });
  }, [navigation]);
  useGoHomeStop(() => deleteInFlightRef.current && !allowDeletionNavigationRef.current); // gate NS-02

  useEffect(() => {
    prefsRef.current = null;
    prefsUserRef.current = null;
    setAnalyticsOn(null);
    setAdsOn(null);
    setRecOn(null);
    setEmbedOn(null);
    setUnderstanding(false);
    setEmbedUnderstanding(false);
    setExternalError(null);
    setRecError(false);
    setEmbedErr(false);
    setBusy(false);
    setDelConfirm("");
    setDeleteConfirmOpen(false);
    deleteConfirmUserRef.current = null;
    // An A -> B auth change must not reopen navigation or allow a B deletion
    // while A's terminal request is still unresolved. The owning async flow
    // clears the fence after it observes the user mismatch.
    if (!deleteInFlightRef.current) {
      setDeleting(false);
      setDelError(false);
      allowDeletionNavigationRef.current = false;
    }
    if (!userId) return;
    const targetUserId = userId;
    let cancelled = false;
    void fetchPrivacyPrefs(targetUserId).then((p) => {
      if (!cancelled && activeUserRef.current === targetUserId) {
        // A save or a strict read on this screen (the health card) may have landed first;
        // this fail-soft read is older then and must not become the copy saves start from.
        if (prefsUserRef.current !== targetUserId) {
          prefsRef.current = p;
          prefsUserRef.current = targetUserId;
        }
        const shown = prefsRef.current ?? p;
        setAnalyticsOn(shown.external_analytics === true);
        setAdsOn(shown.ads === true);
        setRecOn(shown.recommendations === true);
        setEmbedOn(shown.records_embedding === true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function toggleExternalPreference(
    key: Extract<PrivacyPrefKey, "external_analytics" | "ads">,
    next: boolean,
  ) {
    // The historical ads preference cannot become a new third-party/overseas
    // transfer consent. While the disclosure is incomplete, allow withdrawal
    // of an old choice but never save a new opt-in.
    if (key === "ads" && next) return;
    if (
      !userId ||
      minorRef.current ||
      prefsUserRef.current !== userId ||
      !prefsRef.current ||
      busy
    ) return;
    if (prefsRef.current[key] === next) return;

    const targetUserId = userId;
    const updated: PrivacyPrefs = { ...prefsRef.current, [key]: next };
    setExternalError(null);
    setBusy(true);

    // Withdrawal is immediate even if persistence later fails. Opt-in waits for
    // a successful server write before any analytics SDK can start.
    if (key === "external_analytics" && !next) {
      setAnalyticsConsent(false, {
        isMinor: minorRef.current,
        confirmedAdult: minorRef.current === false,
      });
    }

    try {
      await savePrivacyPrefs(targetUserId, updated, { locale: ko ? "ko" : "en" });
      if (!privacyMountedRef.current || activeUserRef.current !== targetUserId) return;
      const effectiveNext = minorRef.current ? false : next;
      const committed: PrivacyPrefs = { ...updated, [key]: effectiveNext };
      // If age became unresolved/minor while an opt-in was saving, persist the
      // fail-closed value too instead of merely hiding a stale server grant.
      if (effectiveNext !== next) await savePrivacyPrefs(targetUserId, committed, { locale: ko ? "ko" : "en" });
      if (!privacyMountedRef.current || activeUserRef.current !== targetUserId) return;
      prefsRef.current = committed;
      prefsUserRef.current = targetUserId;
      if (key === "external_analytics") {
        setAnalyticsOn(effectiveNext);
        setAnalyticsConsent(effectiveNext, {
          isMinor: minorRef.current,
          confirmedAdult: minorRef.current === false,
        });
      } else {
        setAdsOn(effectiveNext);
      }
    } catch {
      if (!privacyMountedRef.current || activeUserRef.current !== targetUserId) return;
      setExternalError({ key, attemptedOn: next });
    } finally {
      if (privacyMountedRef.current && activeUserRef.current === targetUserId) setBusy(false);
    }
  }

  // D-25 §11-5 follow-up: adult-only opt-in WITH an understanding step. Minors
  // are locked (the recommendations pref is non-promotable for them); adults must
  // read what recommendations do and explicitly confirm before it turns on, and
  // the opt-in is logged to the consent ledger with the LLM + overseas acks.
  async function enableRecommendations() {
    if (!userId || busy || minorRef.current || prefsUserRef.current !== userId) return;
    const targetUserId = userId;
    setBusy(true);
    setRecError(false);
    try {
      const current = await fetchPrivacyPrefs(targetUserId);
      if (
        !privacyMountedRef.current ||
        activeUserRef.current !== targetUserId ||
        minorRef.current
      ) return;
      const prefs = { ...current, recommendations: true };
      await savePrivacyPrefs(targetUserId, prefs);
      if (
        !privacyMountedRef.current ||
        activeUserRef.current !== targetUserId ||
        minorRef.current
      ) {
        await savePrivacyPrefs(targetUserId, { ...prefs, recommendations: false });
        return;
      }
      // recordConsentBestEffort retries, then REPORTS failure instead of
      // throwing, and says so in its own comment: "a lost consent record is a
      // compliance gap ... the caller acts on the returned `false`". Discarding
      // it left personalization running with no row in the append-only ledger
      // saying this person agreed to it - the exact gap that writer exists to
      // flag. A thrown failure already lands in the catch below; a reported one
      // did not land anywhere.
      const consentRecorded = await recordRecommendationsConsent({
        userId: targetUserId,
        ageBand: "adult",
        minorTier: "adult",
        locale: ko ? "ko" : "en",
      });
      if (
        !privacyMountedRef.current ||
        activeUserRef.current !== targetUserId ||
        minorRef.current
      ) {
        await savePrivacyPrefs(targetUserId, { ...prefs, recommendations: false });
        return;
      }
      if (!consentRecorded) {
        // Same rollback the session guards above perform, for the same reason:
        // this is a state we must not leave behind. Retrying is the user's to
        // choose, and the existing error line already says to try again.
        await savePrivacyPrefs(targetUserId, { ...prefs, recommendations: false });
        setRecError(true);
        return;
      }
      prefsRef.current = prefs;
      prefsUserRef.current = targetUserId;
      setRecOn(true);
      setUnderstanding(false);
    } catch {
      if (privacyMountedRef.current && activeUserRef.current === targetUserId) setRecError(true);
    } finally {
      if (privacyMountedRef.current && activeUserRef.current === targetUserId) setBusy(false);
    }
  }

  async function disableRecommendations() {
    if (!userId || busy || prefsUserRef.current !== userId) return;
    const targetUserId = userId;
    setBusy(true);
    setRecError(false);
    try {
      const prefs = { ...(await fetchPrivacyPrefs(targetUserId)), recommendations: false };
      await savePrivacyPrefs(targetUserId, prefs);
      if (!privacyMountedRef.current || activeUserRef.current !== targetUserId) return;
      prefsRef.current = prefs;
      prefsUserRef.current = targetUserId;
      setRecOn(false);
      setUnderstanding(false);
    } catch {
      if (privacyMountedRef.current && activeUserRef.current === targetUserId) setRecError(true);
    } finally {
      if (privacyMountedRef.current && activeUserRef.current === targetUserId) setBusy(false);
    }
  }

  // D5 (J1/J2): records semantic embedding — adult-only opt-in WITH an
  // understanding step (mirrors recommendations). Off deletes the stored vectors.
  async function enableEmbedding() {
    if (!userId || busy || minorRef.current || prefsUserRef.current !== userId) return;
    const targetUserId = userId;
    setBusy(true);
    setEmbedErr(false);
    try {
      const current = await fetchPrivacyPrefs(targetUserId);
      if (
        !privacyMountedRef.current ||
        activeUserRef.current !== targetUserId ||
        minorRef.current
      ) return;
      const prefs = { ...current, records_embedding: true };
      await savePrivacyPrefs(targetUserId, prefs);
      if (
        !privacyMountedRef.current ||
        activeUserRef.current !== targetUserId ||
        minorRef.current
      ) {
        await savePrivacyPrefs(targetUserId, { ...prefs, records_embedding: false });
        return;
      }
      prefsRef.current = prefs;
      prefsUserRef.current = targetUserId;
      setEmbedOn(true);
      setEmbedUnderstanding(false);
      // (a) Simon 2026-08-31: the consent the user just gave covers records that
      // ALREADY exist ("지금까지 담아 둔 기록"), so build their index the moment
      // consent lands — this is the only caller of the records backfill.
      // Detached for the same reason create.ts detaches its embed call: a batch
      // must never keep the toggle spinning, and a failure must never undo the
      // consent that was saved. stillConsented re-reads the SERVER pref every
      // round: an OFF tapped mid-batch stops it (and the run self-clears any
      // vectors stored after the user's own clear), and if the 0072 trigger
      // silently clamped the just-saved pref back to false (minor_self), the
      // first probe reads that clamped truth and nothing is ever fetched.
      void backfillAllRecordEmbeddings(targetUserId, {
        locale: ko ? "ko" : "en",
        minor: minorRef.current,
        consented: true,
        stillConsented: async () => {
          try {
            const live = await fetchPrivacyPrefs(targetUserId);
            return live.records_embedding === true;
          } catch {
            return false; // fail closed: no probe, no batch
          }
        },
      }).catch(() => {
        // Best-effort: unembedded rows keep embedding NULL; toggling off → on
        // runs the backfill again, and the write-time path still indexes every
        // new record. See docs/RECORDS-EMBEDDING.md.
      });
    } catch {
      if (privacyMountedRef.current && activeUserRef.current === targetUserId) setEmbedErr(true);
    } finally {
      if (privacyMountedRef.current && activeUserRef.current === targetUserId) setBusy(false);
    }
  }

  async function disableEmbedding() {
    if (!userId || busy || prefsUserRef.current !== userId) return;
    const targetUserId = userId;
    setBusy(true);
    setEmbedErr(false);
    try {
      const prefs = { ...(await fetchPrivacyPrefs(targetUserId)), records_embedding: false };
      await savePrivacyPrefs(targetUserId, prefs);
      // Consent revoked → forget the index (honest "off deletes vectors").
      await clearRecordEmbeddings(targetUserId);
      if (!privacyMountedRef.current || activeUserRef.current !== targetUserId) return;
      prefsRef.current = prefs;
      prefsUserRef.current = targetUserId;
      setEmbedOn(false);
      setEmbedUnderstanding(false);
    } catch {
      if (privacyMountedRef.current && activeUserRef.current === targetUserId) setEmbedErr(true);
    } finally {
      if (privacyMountedRef.current && activeUserRef.current === targetUserId) setBusy(false);
    }
  }

  // Signed out, this screen used to draw the settings and wait forever on a
  // birth date that never arrives; the redirect lived only in the legacy half.
  // Every owner change, the deletion's own A -> null included, remounts this
  // scene (AccountScope in _layout.tsx keys it by account epoch), so no state
  // or ref reaches the next owner. `deleting` fences this instance only: a
  // loading flip mid-deletion must not swap the flow out for the loader.
  if (authLoading && !deleting) {
    return <Shell title={t("privacy.title")}><GraphLoading /></Shell>;
  }
  if (!userId && !deleting) return <Redirect href="/sign-in" />;

  return (
    <Shell title={t("privacy.title")}>
      <SecondbStatusHeader text={t("privacy.status")} tip={t("privacy.tip")} />
      <Text variant="body" style={styles.lead}>{t("privacy.lead")}</Text>

      <Card>
        <Action label={consentT("serviceControl.title")} value={t("privacy.view")} onPress={() => router.push("/service-consent")} />
        <WeatherPrivacyControl />
      </Card>

      {/* 한눈에 / At a glance (canonGaps.privacyFacts) — icon + label + value. */}
      <Card>
        <Text variant="caption" style={styles.section}>{t("privacy.atGlance")}</Text>
        {canonGaps.privacyFacts.map((f, i) => {
          const key = GAPS_FACT_KEYS[i];
          const label = ko || !key ? f.label : t(`privacy.facts.${key}.label`);
          const v = ko || !key ? f.v : t(`privacy.facts.${key}.v`);
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
        <Text variant="caption" style={styles.section}>
          {t("privacy.analytics.title")}
        </Text>
        <Text variant="body" style={styles.lead}>
          {isMinor === null
            ? t("privacy.analytics.pendingAge")
            : minor
            ? t("privacy.analytics.minorLocked")
            : t("privacy.analytics.adultLead")}
        </Text>
        {analyticsOn === null || adsOn === null ? (
          <Text variant="subtle" style={styles.footer}>
            {isMinor === null
              ? t("privacy.analytics.checkingAge")
              : t("privacy.analytics.loadingSettings")}
          </Text>
        ) : (
          <>
            <Toggle
              label={t("privacy.analytics.allow")}
              value={
                minor
                  ? t("privacy.analytics.lockedUnder18")
                  : analyticsOn
                    ? t("privacy.analytics.applied")
                    : t("privacy.off")
              }
              on={!minor && analyticsOn}
              disabled={minor || busy}
              onPress={() => void toggleExternalPreference("external_analytics", !analyticsOn)}
            />
            {/* Historical preference only. AdMob third-party disclosure and
                overseas transfer require a new versioned consent flow. */}
            <Toggle
              label={consentT("privacy.keys.ads.label")}
              value={
                minor
                  ? t("privacy.analytics.lockedUnder18")
                  : adsOn
                    ? consentT("privacy.keys.ads.savedDesc")
                    : consentT("privacy.keys.ads.desc")
              }
              on={!minor && adsOn}
              disabled={minor || busy || !adsOn}
              onPress={() => { if (adsOn) void toggleExternalPreference("ads", false); }}
            />
          </>
        )}
        {externalError ? (
          <Text variant="subtle" style={styles.footer}>
            {externalError.key === "external_analytics"
              ? externalError.attemptedOn
                ? t("privacy.analytics.enableFailed")
                : t("privacy.analytics.withdrawSaveFailed")
              : t("privacy.analytics.adsSaveFailed")}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text variant="caption" style={styles.section}>{t("privacy.recommend.title")}</Text>
        {minor ? (
          <Text variant="subtle" style={styles.footer}>
            {t("privacy.recommend.minorLocked")}
          </Text>
        ) : recOn === null ? (
          <Text variant="subtle" style={styles.footer}>{t("common:states.loading")}</Text>
        ) : recOn ? (
          <>
            <Text variant="body" style={styles.lead}>
              {t("privacy.recommend.onBody")}
            </Text>
            <Pressable style={styles.secondary} onPress={() => void disableRecommendations()} disabled={busy} accessibilityRole="button" accessibilityLabel={t("privacy.recommend.turnOffA11y")}>
              <Text variant="body" style={styles.secondaryText}>{t("privacy.recommend.turnOff")}</Text>
            </Pressable>
          </>
        ) : !understanding ? (
          <>
            <Text variant="body" style={styles.lead}>
              {t("privacy.recommend.offBody")}
            </Text>
            <Pressable style={styles.secondary} onPress={() => setUnderstanding(true)} disabled={busy} accessibilityRole="button" accessibilityLabel={t("privacy.recommend.turnOnA11y")}>
              <Text variant="body" style={styles.secondaryText}>{t("privacy.recommend.turnOn")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* The overseas-processing disclosure stays KO/EN on purpose. It is
                cross-border consent copy (F2: never machine-translated until a
                human reviews it), and recordRecommendationsConsent logs the
                consent with locale ko or en, so an es/pt/id rendering here
                would not match what the ledger says the person read. The
                buttons around it are translated. */}
            <Text variant="body" style={styles.lead}>
              {ko
                ? `켜기 전에 알아두세요. 추천을 켜면 당신의 기록 묶음이 분석을 위해 ${recommendationVendorLabel()} 서버로 전송됩니다(해외에서 처리). 연결·패턴 제안에만 쓰이고 언제든 끌 수 있습니다. 동의는 기록에 남습니다.`
                : `Before you turn it on. Your records are sent to ${recommendationVendorLabel()} for analysis (processed overseas), used only to suggest connections and patterns. You can turn it off anytime. Your consent is logged.`}
            </Text>
            <View style={styles.ctaRow}>
              <Pressable style={styles.secondary} onPress={() => setUnderstanding(false)} disabled={busy} accessibilityRole="button" accessibilityLabel={t("common:actions.cancel")}>
                <Text variant="body" style={styles.secondaryText}>{t("common:actions.cancel")}</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={() => void enableRecommendations()} disabled={busy} accessibilityRole="button" accessibilityLabel={t("privacy.understandA11y")}>
                <Text variant="body" style={styles.primaryText}>{t("privacy.understand")}</Text>
              </Pressable>
            </View>
          </>
        )}
        {recError ? (
          <Text variant="subtle" style={styles.footer}>{t("privacy.saveFailed")}</Text>
        ) : null}
      </Card>

      <Card>
        <Text variant="caption" style={styles.section}>{t("privacy.semantic.title")}</Text>
        {minor ? (
          <Text variant="subtle" style={styles.footer}>
            {t("privacy.semantic.minorLocked")}
          </Text>
        ) : embedOn === null ? (
          <Text variant="subtle" style={styles.footer}>{t("common:states.loading")}</Text>
        ) : embedOn ? (
          <>
            <Text variant="body" style={styles.lead}>
              {t("privacy.semantic.onBody")}
            </Text>
            <Pressable style={styles.secondary} onPress={() => void disableEmbedding()} disabled={busy} accessibilityRole="button" accessibilityLabel={t("privacy.semantic.turnOffA11y")}>
              <Text variant="body" style={styles.secondaryText}>{t("privacy.semantic.turnOff")}</Text>
            </Pressable>
          </>
        ) : !embedUnderstanding ? (
          <>
            <Text variant="body" style={styles.lead}>
              {t("privacy.semantic.offBody")}
            </Text>
            <Pressable style={styles.secondary} onPress={() => setEmbedUnderstanding(true)} disabled={busy} accessibilityRole="button" accessibilityLabel={t("privacy.semantic.turnOnA11y")}>
              <Text variant="body" style={styles.secondaryText}>{t("privacy.semantic.turnOn")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* Stays KO/EN for the same F2 reason as the recommendations
                disclosure above: cross-border consent copy. The consent row
                this toggle writes (savePrivacyPrefs, no locale passed) records
                locale "en", so it has no es/pt/id reading to match either. */}
            <Text variant="body" style={styles.lead}>
              {ko
                ? `켜기 전에 알아두세요. 켜면 지금까지 담아 둔 기록과 앞으로 담는 기록의 내용이 의미 벡터로 변환·저장돼, 서로 비슷한 기록을 이어 보여드립니다. 변환을 위해 기록 텍스트가 ${embedVendorLabel()}(해외)로 전송됩니다. 위기 관련 내용은 전송되지 않습니다. 성인만 켤 수 있고, 끄면 이후 색인이 멈추고 저장된 벡터도 삭제됩니다. 동의는 기록에 남습니다.`
                : `Before you turn it on. Your existing records and every new record will be turned into meaning vectors and stored so similar records can be linked. To do that, record text is sent to ${embedVendorLabel()} (processed overseas). Crisis-related content is not sent. Adults only; turning it off stops indexing and deletes the stored vectors. Your consent is logged.`}
            </Text>
            <View style={styles.ctaRow}>
              <Pressable style={styles.secondary} onPress={() => setEmbedUnderstanding(false)} disabled={busy} accessibilityRole="button" accessibilityLabel={t("common:actions.cancel")}>
                <Text variant="body" style={styles.secondaryText}>{t("common:actions.cancel")}</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={() => void enableEmbedding()} disabled={busy} accessibilityRole="button" accessibilityLabel={t("privacy.understandA11y")}>
                <Text variant="body" style={styles.primaryText}>{t("privacy.understand")}</Text>
              </Pressable>
            </View>
          </>
        )}
        {embedErr ? (
          <Text variant="subtle" style={styles.footer}>{t("privacy.saveFailed")}</Text>
        ) : null}
      </Card>

      <HealthWithdrawCard
        busy={busy}
        onBusyChange={setBusy}
        onOpenImport={() => router.push("/import?mode=account")}
        onPrefsKnown={(ownerId, known) => {
          if (activeUserRef.current !== ownerId) return;
          prefsRef.current = known;
          prefsUserRef.current = ownerId;
        }}
        onPrefsUnknown={(ownerId) => {
          if (prefsUserRef.current === ownerId) prefsUserRef.current = null;
        }}
      />

      <Card>
        {/* audit med#17: these rows rendered as buttons with no onPress — dead
            taps on a privacy surface. 처리 기록 opens the read-only ai_audit_log
            viewer (/processing-log); 제3자 제공 "없음" is a FACT, so it renders static
            (no button role); the 처리방침 row opens the /privacy-policy
            document (restored once the policy document existed to open). */}
        <Action label={t("privacy.policy")} value={t("privacy.view")} onPress={() => router.push("/privacy-policy")} />
        <Action label={t("privacy.processingLog")} value={t("privacy.last7")} onPress={() => router.push("/processing-log")} />
        {/* ⚠ `내 데이터 리뷰`(/data) 는 화면은 있는데 **들어갈 문이 없었다.**
            레퍼런스가 이 자리에 그 줄을 두고 있고, 개인정보 화면에서 자기 데이터를
            열람하러 가는 것은 자연스럽다. */}
        <Action label={t("privacy.dataReview")} value={t("privacy.open")} onPress={() => router.push("/data")} />
        <View style={styles.action} accessible accessibilityLabel={`${t("privacy.thirdParty")}, ${t("privacy.none")}`}>
          <Text variant="body" style={styles.actionLabel}>{t("privacy.thirdParty")}</Text>
          <Text variant="body" style={styles.actionValue}>{t("privacy.none")}</Text>
        </View>
      </Card>

      <Card>
        <Text variant="caption" style={styles.section}>{t("account.delete")}</Text>
        <Text variant="subtle" style={styles.footer}>
          {t("privacy.deleteAccount.body")}
        </Text>
        {/* "DELETE" is the token the input below compares against, so it
            stays literal inside every language's prompt. */}
        <Text variant="subtle" style={styles.footer}>
          {t("privacy.deleteAccount.typePrompt")}
        </Text>
        <TextInput
          value={delConfirm}
          onChangeText={setDelConfirm}
          placeholder="DELETE"
          placeholderTextColor={colors.textLo}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel={t("privacy.deleteAccount.inputA11y")}
          returnKeyType="done"
          onSubmitEditing={() => {
            requestDeleteAccountConfirm();
          }}
        />
        <Pressable
          style={[
            styles.danger,
            // ⚠ 비활성은 **미리 합성한 색 한 쌍**이다(PIXEL-CLAY 규칙 4 — 정적 반투명 금지).
            //   바탕만 바꾸고 글자를 그대로 두면 비활성이 활성보다 또렷해진다.
            (delConfirm !== "DELETE" || deleting) && {
              backgroundColor: m3.disabled.primary,
              borderColor: m3.disabled.outline,
            },
          ]}
          onPress={requestDeleteAccountConfirm}
          disabled={delConfirm !== "DELETE" || deleting}
          accessibilityRole="button"
          accessibilityLabel={t("privacy.deleteAccount.buttonA11y")}
        >
          <Text variant="body" style={styles.dangerText}>
            {deleting ? t("privacy.deleteAccount.deleting") : t("privacy.deleteAccount.button")}
          </Text>
        </Pressable>
        {delError ? (
          <Text variant="subtle" style={styles.footer}>
            {t("privacy.deleteAccount.failed")}
          </Text>
        ) : null}
      </Card>
      <PremiumModal
        visible={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        accessibilityLabel={consentT("account.delete.confirmLabel")}
      >
        <Text variant="heading">{consentT("account.delete.confirmTitle")}</Text>
        <Text variant="body" style={styles.lead}>{consentT("account.delete.confirmBody")}</Text>
        <View style={styles.ctaRow}>
          <Pressable
            style={styles.secondary}
            onPress={() => setDeleteConfirmOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={consentT("account.delete.cancel")}
          >
            <Text variant="body" style={styles.secondaryText}>{consentT("account.delete.cancel")}</Text>
          </Pressable>
          <Pressable
            style={styles.danger}
            onPress={() => {
              setDeleteConfirmOpen(false);
              void runDeleteAccount();
            }}
            accessibilityRole="button"
            accessibilityLabel={consentT("account.delete.confirmCta")}
          >
            <Text variant="body" style={styles.dangerText}>{consentT("account.delete.confirmCta")}</Text>
          </Pressable>
        </View>
      </PremiumModal>
      <Text variant="subtle" style={styles.footer}>{t("privacy.footer")}</Text>
    </Shell>
  );
}

export function DeepSpaceInsightsScreen() {
  // Phone-aware: inside the dashboard phone, the cards open in the phone.
  const router = useAppRouter();
  const { t } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();

  // Real week-over-week data. We reuse listRecentRecords (the same client other
  // deep-space screens use) — it returns a ~90-day window of the user's records,
  // which covers both comparison weeks — and feed the rows to the pure summary.
  const [rows, setRows] = useState<Array<{ created_at: string; tags?: string[] | null }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    setErrored(false);
    // Count BOTH tables. A "piece" lives in `records` (typed notes, journal, 4W1H, todos)
    // or in `sources` (links, clips, imports) purely as an artifact of how it was captured
    // -- nothing the user would ever think about. /records already shows both. This screen
    // read only `records`, so a user who captures links and clips saw their pieces in the
    // list and then read here that it was their "first week". The app reported less than
    // they put in.
    Promise.all([listRecentRecords(userId), listSourcePieces(userId)])
      .then(([recs, srcs]) => {
        if (!alive) return;
        const merged = [
          ...((recs ?? []) as Array<{ created_at: string; tags?: string[] | null }>),
          ...srcs.map((s) => ({ created_at: s.created_at, tags: s.tags })),
        ].sort((a, b) => b.created_at.localeCompare(a.created_at));
        setRows(merged);
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

  // 다른 화면에서 기록을 담고 돌아오면 이 주의 수치가 바뀐다. 레거시 렌더러에는
  // 이 갱신이 있었지만 배송되는 화면에는 없어서, 담고 돌아온 사용자가 예전 수치를
  // 봤다. focus-refetch 계약이 초록이었던 것은 라우트 파일의 레거시 반쪽 때문이다.
  useFocusRefetch(() => setReloadKey((k) => k + 1), Boolean(userId));

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
        {/* Reachability (audit 260904 A3): the /discover door lived ONLY in the
            filled state below, gated on a full week-over-week comparison. But a
            user with weeks of history whose RECENT week is quiet still reads as
            first-week here — verified live on the QA account (102 records, quiet
            recent week) which showed this state with no path to /discover. The
            rising-interests screen is built on all historical data, not this
            week's, so it has content for exactly those users. Reuse the same
            door element verbatim (no new visual work); a brand-new user with no
            history simply sees /discover's own empty state, no worse than the
            missing door. The capture CTA above stays the primary next action. */}
        <Pressable
          onPress={() => router.push("/discover")}
          android_ripple={{ color: ddsAlpha2(m3.color.tertiary, 0.12) }}
          accessibilityRole="button"
        >
          <Card>
            <Text variant="heading" style={styles.section}>{t("insights.sectionDiscover")}</Text>
            <Text variant="body" style={styles.lead}>{t("insights.discoverLead")}</Text>
          </Card>
        </Pressable>
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
        android_ripple={{ color: ddsAlpha2(m3.color.tertiary, 0.12) }}
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
        android_ripple={{ color: ddsAlpha2(m3.color.tertiary, 0.12) }}
        accessibilityRole="button"
      >
        <Card>
          <Text variant="heading" style={styles.section}>{t("insights.sectionFinding")}</Text>
          <Text variant="body" style={styles.lead}>{findingText}</Text>
        </Card>
      </Pressable>
      {/* Door for /discover (rising interests): the screen was fully built on
          real gatherRisingInterests data but had ZERO nav references — an
          implemented feature nobody could reach (audit pattern B). */}
      <Pressable
        onPress={() => router.push("/discover")}
        android_ripple={{ color: ddsAlpha2(m3.color.tertiary, 0.12) }}
        accessibilityRole="button"
      >
        <Card>
          <Text variant="heading" style={styles.section}>{t("insights.sectionDiscover")}</Text>
          <Text variant="body" style={styles.lead}>{t("insights.discoverLead")}</Text>
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
  const rights: { icon: CloneIconName; label: string; sub: string; route: string; danger?: boolean }[] = [
    { icon: "download", label: ko ? "내 데이터 전체 내보내기" : "Export all my data", sub: ko ? "IDEN · 원문 · 파생 신호" : "IDEN, raw, derived signals", route: "/iden" },
    { icon: "cloud_off", label: ko ? "파생 신호만 초기화" : "Reset derived signals only", sub: ko ? "원문은 두고 추정만 지우기" : "Keep raw, clear inferences", route: "/privacy" },
    { icon: "trash", label: ko ? "계정·데이터 영구 삭제" : "Delete account and data", sub: ko ? "되돌릴 수 없습니다" : "This cannot be undone", route: "/privacy", danger: true },
  ];
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={ko ? "내 데이터 리뷰" : "My data review"} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={cx.body} keyboardShouldPersistTaps="handled">
        <RNText style={[m3TextStyle("bodyMedium"), cx.lead]}>{ko ? "내 데이터가 어떻게 쓰이는지 전부 보여줍니다. 무엇이든 열람하고 지울 수 있습니다." : "I show exactly how your data is used. You can open and delete anything."}</RNText>

        <MdCard variant="outlined" style={cx.sourceCard}>
          <RNText style={[m3TextStyle("titleSmall"), cx.signalTo]}>
            {ko ? "아직 모아둔 데이터가 없습니다" : "No data gathered yet"}
          </RNText>
          <RNText style={[m3TextStyle("bodySmall"), cx.lead]}>
            {ko
              ? "기록이 쌓이면 원문 조각과 파생 신호를 여기서 열람하고 지울 수 있습니다."
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
  // The rows read and write the real settings. The dark/light section (딥스페이스
  // / 미드나잇 and its "applies to some screens only" note) is gone: Simon removed
  // the choice (Q-261005-02, 2026-10-05) and the app is always dark, so this
  // screen is font + motion (and, since #2082, sound effects). The route stays /theme.
  const { fontStyle, setFontStyle } = useFontStyle();
  const { liteMode, setLiteMode } = useLiteMode();
  const { soundEffects, setSoundEffects } = useSoundEffects();
  return (
    <Shell title={t("theme.title")}>
      <SecondbStatusHeader text={t("theme.status")} tip={t("theme.tip")} />
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
        {/* Q-261005-02 (2026-10-05): sound effects on by default; off silences every effect player. */}
        <Toggle label={t("theme.soundEffects")} on={soundEffects} onPress={() => setSoundEffects(!soundEffects)} />
        <Text variant="subtle" style={styles.footer}>{t("theme.soundEffectsNote")}</Text>
      </Card>
    </Shell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
export { DeepSpacePlansScreen } from "./dds-plans-screen";

// ── Deep-space permissions: real OS status + request ───────────────────────
// The rows now reflect the ACTUAL permission state and act on tap. Notifications
// come through the lib/ops/notifications-sdk seam (its .web.ts variant answers
// null, so the SDK never reaches the web bundle; Expo Go throws on require, which
// the seam also absorbs). image-picker is lazy-required (same guarded pattern as
// wiki/capture-image.ts); expo-audio ships a web build so its permission fns
// import directly. Rows render on native only.
type PermStatus = { granted: boolean; canAskAgain: boolean };

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
  // Phone-aware: "continue" steps the phone back instead of leaving the dashboard.
  const router = useAppRouter();
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

// This screen used to be a mockup wearing a data screen's clothes: two Cards with
// hardcoded topics ("자기이해 도구", "아침 루틴") and hardcoded deltas (+32%, +18%),
// under copy that claims "최근 3주간 가장 자주 담은 주제". A brand-new account saw the
// same +32%. It reads as the product's central promise -- 정직한 밝기, only what you
// actually put in -- and it was invented.
//
// The engine to do it honestly already existed and was orphaned: lib/trends/rising.ts
// ranks tags whose frequency rose from the prior window to the recent one (pure,
// deterministic, no LLM), and lib/trends/gather.ts feeds it the user's own records.
// Nothing imported either. So this is a wiring job, not a new feature.
//
// Counts, not percentages: a tag that went 0 -> 3 has no meaningful percentage, and
// inventing one would repeat the original sin in a smaller font.
export function DeepSpaceDiscoverScreen() {
  const router = useAppRouter(); // Phone-aware: inside the dashboard phone, the cards open in the phone.
  const { t } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();
  // undefined = still loading, null = the read failed, [] = genuinely nothing yet.
  // Collapsing "failed" into "nothing yet" is how a screen ends up lying quietly.
  const [rising, setRising] = useState<RisingInterest[] | null | undefined>(undefined);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setRising([]);
      return;
    }
    let alive = true;
    gatherRisingInterests(userId)
      .then((rows) => alive && setRising(rows))
      .catch(() => alive && setRising(null));
    return () => {
      alive = false;
    };
  }, [userId, authLoading]);

  const body =
    rising === undefined ? (
      <Text variant="body" style={styles.planFeatDim}>{t("discover.loading")}</Text>
    ) : rising === null ? (
      <Text variant="body" style={styles.planFeatDim} accessibilityRole="alert">{t("discover.error")}</Text>
    ) : rising.length === 0 ? (
      <Text variant="body" style={styles.planFeatDim}>{t("discover.empty")}</Text>
    ) : (
      rising.slice(0, 3).map((r) => (
        <Pressable
          key={r.tag}
          onPress={() => router.push({ pathname: "/capture", params: { tag: r.tag } })}
          android_ripple={{ color: ddsAlpha2(m3.color.tertiary, 0.12) }}
          accessibilityRole="button"
          accessibilityLabel={`${r.tag} ${t("discover.cardDelta", { recent: r.recent, prior: r.prior })}`}
        >
          <Card>
            <View style={styles.trendHead}>
              <Text variant="heading" style={styles.section}>{r.tag}</Text>
              <Text variant="body" style={styles.delta}>
                {t("discover.cardDelta", { recent: r.recent, prior: r.prior })}
              </Text>
            </View>
            <Text variant="body" style={styles.planFeatDim}>{t("discover.cardBody")}</Text>
          </Card>
        </Pressable>
      ))
    );

  return (
    <Shell title={t("discover.title")}>
      <SecondbStatusHeader text={t("discover.status")} tip={t("discover.tip")} mood="neutral" />
      <Text variant="body" style={styles.lead}>{t("discover.lead")}</Text>
      {body}
      <Text variant="subtle" style={styles.footer}>{t("discover.footer")}</Text>
    </Shell>
  );
}

interface DeepSpaceReviewSessionProps {
  userId: string | null;
  isMinor: boolean | null;
}

const RATIFY_L5_CUE_DELAY_MS = 400;

export function DeepSpaceReviewScreen() {
  const { userId, isMinor } = useAuth();
  // A keyed ownership boundary prevents an in-flight proposal for user A from
  // resurfacing after auth switches to user B. It also resets receipts, sheet,
  // evidence refs, and result state when the age-safety profile resolves.
  const sessionKey = `${userId ?? "signed-out"}:${isMinor === null ? "pending" : isMinor ? "minor" : "adult"}`;
  return <DeepSpaceReviewSession key={sessionKey} userId={userId} isMinor={isMinor} />;
}

function DeepSpaceReviewSession({ userId, isMinor }: DeepSpaceReviewSessionProps) {
  const router = useAppRouter(); // Phone-aware: inside the dashboard phone, a cited record opens in the phone.
  const { t, i18n } = useTranslation("deepspace");
  const playRatifyCue = useUiSound(RATIFY_L5_CUE.source, RATIFY_L5_CUE);
  // 시기 별 버튼의 이름은 홈 별자리와 **같은 키**에서 온다 -- 화면마다 다른
  // 이름을 배우면 사용자는 같은 별을 두 개로 안다.
  const { t: tHome } = useTranslation("home");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
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
  const ratifyPendingRef = useRef(false);
  const [ratifyPending, setRatifyPending] = useState(false);

  // 무엇을 되돌릴 수 있는가는 카드가 정한다. 예전에는 이 화면이 `"now"` 를
  // 하드코딩해서 **Big Five 하나만** 이의를 제기할 수 있었다 -- 애착 검사와
  // 가치 체크도 결과를 내서 페르소나에 들어가는데 되돌릴 자리가 없었다.
  const [targets, setTargets] = useState<RatifiableTarget[]>([]);
  // 시기 별 후보(2026-08-25) — 근거가 검사지가 아니라 **인터뷰**인 비준.
  // 충분히 판 별(두 층 이상)만 온다. 이게 새 일곱 별이 L5 로 가는 유일한 길이다.
  const [sevenTargets, setSevenTargets] = useState<SevenRatifiableTarget[]>([]);
  const [targetLoadFailed, setTargetLoadFailed] = useState(false);
  useEffect(() => {
    if (!userId) {
      setTargets([]);
      setSevenTargets([]);
      setTargetLoadFailed(false);
      return;
    }
    let active = true;
    setTargets([]);
    setSevenTargets([]);
    setTargetLoadFailed(false);
    Promise.allSettled([
      loadPersonaRatifiableSignals(userId),
      sevenRatifiableTargets(userId),
    ]).then(([legacyResult, sevenResult]) => {
      if (!active) return;
      if (legacyResult.status === "fulfilled") {
        setTargets(ratifiableTargets(legacyResult.value));
      }
      if (sevenResult.status === "fulfilled") {
        setSevenTargets(sevenResult.value);
      }
      setTargetLoadFailed(
        legacyResult.status === "rejected" || sevenResult.status === "rejected",
      );
    });
    return () => {
      active = false;
    };
  }, [userId]);

  async function generate(star: StarId) {
    if (!userId || isMinor === null || loading) return;
    if (ratifyPendingRef.current) return;
    setLoading(true);
    setResult(null);
    try {
      const card = await buildPersona(userId, locale, isMinor === true);
      const ctx = proposalContextForStar(card, star);
      const nextCurrentLevel = card.starLevels?.[star] ?? 1;
      const nextEvidenceRefs = ctx.evidenceRefs;
      const nextReceipts = await loadEvidenceShards(nextEvidenceRefs, locale);
      const p = await proposeSelfModelChange(userId, { kind: "star", star }, ctx.before, ctx.evidence, 5, locale, isMinor === true);
      if (p) {
        setCurrentLevel(nextCurrentLevel);
        setEvidenceRefs(nextEvidenceRefs);
        setReceipts(nextReceipts);
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

  async function generateSeven(star: SevenStarId) {
    if (!userId || isMinor === null || loading) return;
    if (ratifyPendingRef.current) return;
    setLoading(true);
    setResult(null);
    try {
      const ctx = await buildSevenProposalContext(userId, star, locale);
      if (!ctx) {
        // 커버리지는 있는데 원문이 없으면(예: 담기 전 이탈) 제안하지 않는다 --
        // 숫자만으로 사람을 요약하면 지어낸 값을 승인시키는 꼴이 된다.
        setResult(t("reviewNoChange"));
        return;
      }
      const nextReceipts = await loadEvidenceShards(ctx.evidenceRefs, locale);
      const p = await proposeSelfModelChange(
        userId,
        { kind: "sevenStar", star },
        ctx.before,
        ctx.evidence,
        5,
        locale,
        isMinor === true,
      );
      if (p) {
        setCurrentLevel(ctx.currentLevel);
        setEvidenceRefs(ctx.evidenceRefs);
        setReceipts(nextReceipts);
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

  async function handleDecision(decision: RatifyDecision) {
    await runRatifyDecisionOnce(ratifyPendingRef, async () => {
      setRatifyPending(true);
      setResult(null);
      try {
        const r = applyRatify(currentLevel, decision);
        // propose→ratify quality signal: counts only, consent-gated inside captureEvent.
        captureEvent(
          proposalDecided({ flow: "self_model", decision: decision === "ratify" ? "ratify" : "decline", count: 1 }),
        );
        if (decision === "decline") {
          setProposal(null);
          setSheetOpen(false);
          setResult(t("reviewLeftAsIs"));
          return;
        }

        let persisted = false;
        if (userId && proposal?.target.kind === "star") {
          // Cite evidenceRefs (real `record:<id>` for the records this card was built
          // from), NOT proposal.citations — those are Gemini-emitted labels with no
          // real-id whitelist. The write boundary re-sanitizes to resolvable refs
          // only, so a fabricated string can never be persisted (0060).
          persisted = await recordStarTiers(userId, { [proposal.target.star]: r.resultingLevel }, "journal", {
            origin: "ratify",
            citations: evidenceRefs,
          });
        }
        let l5Cue = false;
        if (userId && proposal?.target.kind === "sevenStar") {
          // L5 소리(Q-261006-01)는 처음 L5 가 될 때만 난다. 이미 비준한 별을 다시 비준하면
          // 무음이라, 쓰기 전에 지금 비준 원장을 먼저 읽는다(쓴 뒤에 읽으면 새 행이 보인다).
          const wasL5Before = (await loadSevenRatified(userId))[proposal.target.star] === 5;
          // ⚠ recordStarTiers 재사용 금지 -- 그쪽 마일스톤이 옛 일곱 기준이라 새 키를
          // 넘기면 조용히 틀린 숫자가 나간다(seven-tier-history.ts 헤더). 새 별 비준은
          // seven: 접두사를 다는 자기 경로로만 원장에 남는다. 인용 규율(0060)은 동일.
          persisted = await recordSevenTiers(userId, { [proposal.target.star]: r.resultingLevel }, "ratify", evidenceRefs);
          l5Cue = ratifyL5CueAllowed({ decision, targetKind: "sevenStar", persisted, wasL5Before });
        }
        setSheetOpen(false);
        // 비준 시트는 네이티브 Modal 이라 안드로이드에서 닫히는 동안 창 포커스가 돌아오지 않아
        // 소리 관문이 막힐 수 있다. 시트가 닫힌 뒤에 울린다.
        if (l5Cue) setTimeout(playRatifyCue, RATIFY_L5_CUE_DELAY_MS);
        if (persisted) setProposal(null);
        setResult(
          persisted
            ? t("reviewRatifiedMoved", { level: r.resultingLevel })
            : t("career.saveFailed"),
        );
      } finally {
        setRatifyPending(false);
      }
    });
  }

  return (
    <Shell title={t("review.title")}>
      {/* The reference keeps this stack screen to one message instead of
          repeating it inside a companion bubble. The candidate groups below
          are the supporting graphic and the actual production actions. */}
      <Text variant="body" style={styles.planFeatDim}>{t("review.status")}</Text>
      {/* 이 화면의 규칙을 맨 위에 한 줄로 둔다. 확인해야만 반영된다는 것과, L5 가
          여기서만 열린다는 것 — 둘 다 이 화면에 온 이유다
          (design/pixel_clay_260825/captures/review.png). */}
      <Text variant="caption" style={styles.reviewLabel}>{t("review.rule")}</Text>
      {targetLoadFailed ? (
        <Text variant="subtle" style={styles.footer}>{t("reviewLoadError")}</Text>
      ) : null}
      {!targetLoadFailed && targets.length === 0 && sevenTargets.length === 0 ? (
        <Text variant="subtle" style={styles.footer}>{t("reviewNothingToReview")}</Text>
      ) : null}
      {/* 시기 별 비준(2026-08-25) -- 인터뷰로 충분히 판 별의 한 줄 요약을 제안받고
          승인하면 그 별이 L5 로 간다. 커버리지로는 절대 못 가는 등급이라, 이
          버튼들이 새 일곱 별의 유일한 L5 경로다. 이름은 홈과 같은 키에서 읽는다.
          레퍼런스처럼 검사 후보보다 먼저, 44px 가로 버튼으로 보여준다. */}
      {sevenTargets.length > 0 ? (
        <>
          <Text variant="caption" style={styles.reviewLabel}>{t("review.groupSeven")}</Text>
          <View style={styles.filterRow}>
            {sevenTargets.map((st) => (
              <Pressable
                key={`seven-${st.star}`}
                style={[styles.fchip, styles.fchipActive]}
                onPress={() => void generateSeven(st.star)}
                disabled={loading || ratifyPending || isMinor === null}
                accessibilityState={{ disabled: loading || ratifyPending || isMinor === null }}
                accessibilityRole="button"
                accessibilityLabel={tHome(`ds.star.${getSevenStar(st.star).key}`)}
              >
                <Text variant="caption" style={[styles.fchipText, styles.fchipTextActive]}>
                  {loading ? t("reviewLoading") : tHome(`ds.star.${getSevenStar(st.star).key}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      {/* 측정된 근거가 있는 축마다 하나씩. 근거 없는 축을 비준 대상으로 내밀면
          앱이 지어낸 값을 사용자에게 승인시키는 꼴이고, 그건 propose->ratify
          가 막으려던 바로 그 일이다. 레퍼런스의 한 카드·여러 행 구조를 따르되,
          근거 없는 L3→L4 숫자를 만들지 않고 실제 제안 동작을 그대로 연결한다. */}
      {targets.length > 0 ? (
        <>
          <Text variant="caption" style={styles.reviewLabel}>{t("review.groupTest")}</Text>
          <Card>
            {targets.map((rt) => (
              <Pressable
                key={rt.target.kind === "star" ? rt.target.star : rt.target.kind}
                style={styles.action}
                onPress={() => {
                  if (rt.target.kind === "star") void generate(rt.target.star);
                }}
                disabled={loading || ratifyPending || isMinor === null}
                accessibilityState={{ disabled: loading || ratifyPending || isMinor === null }}
                accessibilityRole="button"
                accessibilityLabel={t(AXIS_LABEL_KEY[rt.sourceAssessmentId])}
              >
                <Text variant="body" style={styles.actionLabel}>
                  {loading ? t("reviewLoading") : t(AXIS_LABEL_KEY[rt.sourceAssessmentId])}
                </Text>
                <RNText
                  style={styles.chev}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  ›
                </RNText>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
      {result ? <Text variant="subtle" style={styles.footer}>{result}</Text> : null}
      {/* audit med#26: dismissing the sheet (backdrop/back) used to strand the
          generated proposal invisibly — the AI cost was spent and the only way
          "forward" was paying for a new generation. Reopen is free. */}
      {proposal !== null && !sheetOpen && !loading && !ratifyPending ? (
        <Pressable
          style={styles.primary}
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("reviewReopenProposal")}
        >
          <Text variant="caption" style={styles.primaryText}>{t("reviewReopenProposal")}</Text>
        </Pressable>
      ) : null}
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
      {/* 거절도 승인도 이력에 남는다는 것을 화면 끝에서 한 번 더 말한다 —
          되돌릴 수 있다는 확신이 있어야 사람이 솔직하게 아니라고 한다.
          설계 대화 발주 a(2026-10-07): 그 이력 원장이 아직 없어 사실과 다른 말이라 내린다.
          키(review.ledgerNote)는 남겨 두고, 원장이 생기면 REVIEW_LEDGER_NOTE 를 true 로 되돌린다. */}
      {REVIEW_LEDGER_NOTE ? <Text variant="subtle" style={styles.footer}>{t("review.ledgerNote")}</Text> : null}
      <RatifySheet
        proposal={proposal}
        locale={locale}
        visible={sheetOpen}
        pending={ratifyPending}
        pendingLabel={t("career.saving")}
        onDecision={handleDecision}
        onClose={() => {
          if (!ratifyPendingRef.current) setSheetOpen(false);
        }}
      />
    </Shell>
  );
}

export { DeepSpaceImportScreen } from "./dds-import-inbox-screens";

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
  const router = useAppRouter(); // Phone-aware: inside the dashboard phone, links and proposals open in the phone.
  const { t, i18n } = useTranslation("deepspace");
  const playLinkCue = useUiSound(WIKI_LINK_CUE.source, WIKI_LINK_CUE);
  // D-27 Phase 1c: the research view runs on RECORDS, the ratified node-set.
  // It used to read useWikiGraphData(), and wiki_pages has never held a single
  // row in production — so this screen told users with hundreds of records
  // "아직 이어줄 기록이 없어요", which is exactly what its own copy promises not
  // to say. recordsToResearchGraph re-expresses the records tag-graph in the
  // shapes buildDeepResearchView already consumes, so hubs / clusters /
  // orphans / islands all keep working, now over real data. $0: pure tag
  // overlap, no LLM and no embeddings (the kNN layer stays consent-gated).
  const { userId, loading: authLoading } = useAuth();
  // Every load below is held WITH the account it was loaded for, and read back
  // only while that account is still the one signed in. The route can stay
  // mounted across an account change (A out, B in); a bare value kept A's
  // records, tag chips and link proposals on B's screen until B's own loads
  // answered (QA 261004 SG-02). A different owner reads as "not loaded yet".
  const [heldRecords, setHeldRecords] = useState<{ ownerId: string; rows: GraphRecord[] } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void listRecentRecords(userId)
      .then((rows) => {
        if (alive) setHeldRecords({ ownerId: userId, rows: rows as GraphRecord[] });
      })
      .catch(() => {
        if (alive) setHeldRecords({ ownerId: userId, rows: [] });
      });
    return () => {
      alive = false;
    };
  }, [userId]);
  const records = heldRecords !== null && userId !== null && heldRecords.ownerId === userId ? heldRecords.rows : null;
  const loading = userId != null && records === null;
  const view = useMemo(() => {
    const graph = recordsToResearchGraph(records ?? [], {
      locale: i18n.language === "ko" ? "ko" : "en",
    });
    return buildDeepResearchView(graph.pages, graph.edges);
  }, [records, i18n.language]);
  // Cluster chip selection. The research view derives from graph-stats (no
  // server-side re-cluster), so selecting a chip drives the highlight + the
  // graph's focused tag label rather than refetching.
  // The picked chip is one of the owner's own tag names, and the graph caption
  // prints it, so it is held with its owner like the records it came from.
  const [clusterPick, setClusterPick] = useState<{ ownerId: string; tag: string } | null>(null);
  const activeCluster = clusterPick !== null && userId !== null && clusterPick.ownerId === userId ? clusterPick.tag : null;

  // propose->ratify: AI-proposed (inferred) links awaiting the user's verdict.
  const [heldProposals, setHeldProposals] = useState<{ ownerId: string; rows: InferredLinkDetail[] } | null>(null);
  const proposals = heldProposals !== null && userId !== null && heldProposals.ownerId === userId ? heldProposals.rows : [];
  const [proposing, setProposing] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  // Screen-reader feedback for ratify/reject: the row removal alone is silent,
  // so announce the outcome via a polite live region (persona-sim a11y, D-25).
  const [announce, setAnnounce] = useState("");

  const loadProposals = useMemo(
    () => async (uid: string, current: () => boolean = () => true) => {
      const rows = await listInferredLinkDetails(uid).catch(() => [] as InferredLinkDetail[]);
      if (current()) setHeldProposals({ ownerId: uid, rows });
    },
    [],
  );

  useEffect(() => {
    if (!userId) return;
    // A slow answer for the previous owner must not land after this owner's.
    let alive = true;
    void loadProposals(userId, () => alive);
    return () => {
      alive = false;
    };
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
      const { proposed } = await proposeAllRelatedLinks(userId);
      await loadProposals(userId);
      if (proposed > 0) {
        // 연결을 찾아냈다 — the 잘난척 beat (proposals arriving is SecondB's moment).
        // "smug" is the expression this repo binds to connectionFound
        // (CompanionSprite EXPRESSION_BY_EVENT), so it has to follow an actual
        // find. Playing it on zero would have SecondB act out an accomplishment
        // that did not happen.
        reactExpression("smug");
        setAnnounce(t("connectionsFound"));
      } else {
        // Nothing new. Say so rather than leaving the button looking inert -
        // a screen-reader user gets no other signal that the search finished.
        reactExpression("neutral");
        setAnnounce(t("connectionsNoneFound"));
      }
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
      // 승인 = the app-wide ratify wink.
      reactExpression("wink");
      playLinkCue(); // 위키 연결 확인 소리(Q-261006-14)
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
      ) : (
        <>
        {/* The records half. This gate counts RECORDS; the proposal half below
            is deliberately outside it, because proposals come from the wiki
            track (sources -> wiki_pages) and those tables are disjoint. Bundling
            them locked the link/clip-only user — the only user who can actually
            have a ratifiable proposal — out of the proposal UI entirely. */}
        {view.pageCount === 0 ? (
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
                  onPress={() => setClusterPick(activeCluster === c.tag ? null : { ownerId: userId, tag: c.tag })}
                />
              ))}
            </View>
          ) : null}
          <View style={styles.researchGraph}>
            {/* 별과 링크 — 원과 선이었다. 셀 격자로 옮긴다(PIXEL-CLAY 규칙 1). */}
            <Svg width="100%" height={118} viewBox="0 0 260 118">
              {satellites.map((s, i) =>
                stepLine(135, 62, s.cx, s.cy, 2).map((p, j) => (
                  <Rect key={`l${i}-${j}`} x={p.x} y={p.y} width={2} height={2} fill={s.stroke} />
                )),
              )}
              {satellites.map((s, i) => (
                <PixelNodeSvg key={`c${i}`} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />
              ))}
              <PixelStarSvg cx={135} cy={62} r={8} fill={colors.textTitle} />
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
              android_ripple={{ color: ddsAlpha2(m3.color.tertiary, 0.12) }}
              // Since D-27 Phase 1c these ids come from recordsToResearchGraph,
              // so they ARE record ids and /record/[id] is the right target. The
              // old /wiki?focusPageId hop was correct only while the view was
              // built from wiki_pages; against record ids the wiki screen simply
              // finds nothing and silently declines to expand.
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
              android_ripple={{ color: ddsAlpha2(m3.color.tertiary, 0.12) }}
              // surprise.fromId is now a record id too — same reasoning as above.
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

        </>
        )}

          {/* propose->ratify: AI proposes semantic links, the user decides.
              Outside the records gate on purpose — see the note above. */}
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
                    android_ripple={{ color: ddsAlpha2(m3.color.tertiary, 0.12) }}
                    onPress={() => router.push({ pathname: "/wiki", params: { focusPageId: p.from_page } })}
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

// This option used to be called "PDF". It has never produced a PDF: the handler calls
// exportIden() and hands back r.html under r.htmlFilename, so picking "PDF" downloaded a
// .html file. There is no PDF generator in the app (expo-print is not installed), so the
// honest fix is not to fake one -- it is to say what the button actually does. The export
// IS a print-ready HTML page; the user prints it (or saves it as PDF) from their browser,
// which the copy now tells them.
type ExportFormat = "iden" | "markdown" | "json" | "html";
const FORMAT_CARDS: { id: ExportFormat; name: string; descKey: string }[] = [
  { id: "iden", name: ".iden", descKey: "formats.idenDesc" },
  { id: "markdown", name: "Markdown", descKey: "formats.markdownDesc" },
  { id: "json", name: "JSON", descKey: "formats.jsonDesc" },
  { id: "html", name: "HTML", descKey: "formats.htmlDesc" },
];

export function DeepSpaceFormatsScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading: authLoading, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [format, setFormat] = useState<ExportFormat>("iden");
  const [includeRecords, setIncludeRecords] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ text: string; name: string } | null>(null);
  const [note, setNote] = useState<"copied" | "copyFailed" | "error" | null>(null);

  async function runExport() {
    // C10 / DPIA 5A-R7: .iden, HTML and JSON all build the persona (exportIden /
    // buildIdenDoc -> buildPersona -> callLlm persona_narrative), and its crisis output
    // picks the hotline from `minor`. These calls used to pass no age, so buildIdenDoc
    // fell back to adult routing for a minor (QA 261004 L1-07). Same contract as /review:
    // nothing builds while the age is unresolved, then the resolved age goes along.
    if (!userId || isMinor === null || exporting) return;
    setExporting(true);
    setResult(null);
    setNote(null);
    try {
      if (format === "iden") {
        const r = await exportIden(userId, { locale, minor: isMinor === true });
        setResult({ text: r.iden, name: r.idenFilename });
      } else if (format === "html") {
        const r = await exportIden(userId, { locale, minor: isMinor === true });
        setResult({ text: r.html, name: r.htmlFilename });
      } else if (format === "markdown") {
        const r = await exportUserWiki(userId, { locale, includeRecords });
        setResult({ text: r.prompt, name: "polascope-wiki.md" });
      } else {
        const doc = await buildIdenDoc(userId, { locale, minor: isMinor === true });
        setResult({ text: JSON.stringify(doc, null, 2), name: "polascope-iden.json" });
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
        {/* audit med#12: scope1/2 were permanently-on Toggles with no onPress —
            fake switches. They are included in every format, so they render as
            facts. med#13: 원본 기록 포함 only affects the Markdown exporter, so
            the real toggle appears only there instead of silently no-opping. */}
        <View style={styles.action} accessible accessibilityLabel={`${t("formats.scope1")}, ${t("formats.included")}`}>
          <Text variant="body" style={styles.actionLabel}>{t("formats.scope1")}</Text>
          <Text variant="body" style={styles.actionValue}>{t("formats.included")}</Text>
        </View>
        <View style={styles.action} accessible accessibilityLabel={`${t("formats.scope2")}, ${t("formats.included")}`}>
          <Text variant="body" style={styles.actionLabel}>{t("formats.scope2")}</Text>
          <Text variant="body" style={styles.actionValue}>{t("formats.included")}</Text>
        </View>
        {format === "markdown" ? (
          <Toggle label={t("formats.scope3")} on={includeRecords} onPress={() => setIncludeRecords((v) => !v)} />
        ) : (
          <Text variant="subtle" style={styles.footer}>{t("formats.scope3MarkdownOnly")}</Text>
        )}
      </Card>
      <Pressable
        style={[styles.soulPrimary, (exporting || isMinor === null) && { opacity: 0.6 }]}
        onPress={() => void runExport()}
        disabled={exporting || isMinor === null}
        accessibilityRole="button"
        accessibilityState={{ disabled: exporting || isMinor === null }}
      >
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
// The picker is NOT the canon's focusStars any more: those five (성장 · 커리어 · 학습 ·
// 관계 · 건강) were neither the seven stars nor the six life areas, and "별에 기록"
// was never true. It offers the dashboard's six areas (lib/ops/focus-tally, R2C-12).

// rev2 clone (25-focus / reference FocusScreen): windowed 일일 집중 timer. The
// proven pomodoro engine + ANDROID_QA single-interval handling are preserved; the
// UI adopts the reference layout (presets, area picker, today summary). A focus
// block auto-completes to a fresh idle block (no break phase in the reference)
// while still ticking daily_focus (applyFocusSessionComplete) + a local notify.
export function DeepSpaceFocusScreen() {
  const { t } = useTranslation("ops");
  const { userId, loading: authLoading, hasProfile } = useAuth();

  const [timer, setTimer] = useState<PomodoroState>(() => createPomodoro());
  // Today's tally: sessions, minutes actually focused, sessions per life area.
  // Survives reset (not the in-cycle session count). Device-local and per account
  // (lib/ops/focus-store): the only server effect of a finished session is the
  // daily_focus routine tick below. The tally carries its owner and whether the
  // stored record was read back (lib/ops/focus-tally FocusTally, gate FC-01 · FC-03).
  const [tally, setTally] = useState<FocusTally>(() => freshFocusTally(null));
  const [area, setArea] = useState<LifeArea>(FOCUS_AREAS[0]);

  // ANDROID_QA §4: a single 1s interval drives tick(); cleared on unmount AND
  // whenever `running` flips off, so a paused/idle timer holds no live interval.
  const timerRef = useRef(timer);
  timerRef.current = timer;
  // The completion branch runs inside the interval closure — read the area via
  // a ref (same pattern as timerRef) so a mid-session pick isn't stale.
  const areaRef = useRef(area);
  areaRef.current = area;

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
        // The finished session's OWN length goes into today's minutes, so picking
        // another preset later cannot rewrite what was done (R2C-13).
        const doneArea = areaRef.current;
        setTally((cur) => ({ ...cur, day: completeFocusSession(cur.day, doneArea, prev.config.focusMinutes) }));
        if (userId) void applyFocusSessionComplete(userId).catch(() => {});
        void notifyNow(
          t("focus.alarmFocusTitle"),
          t("focus.alarmFocusBodyArea", { area: t(`phone.areas.${doneArea}`) }),
        ).catch(() => {});
      } else {
        setTimer(next);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timer.running, userId, t]);

  // Today's tally and the area pick persist across app restarts, per account, so
  // the summary covers all of today's sessions, not just this mount's. A read that
  // fails leaves the tally unrestored: what was counted meanwhile stays in memory,
  // nothing is written over the record that could not be read, and the next
  // finished session reads again (restoreFocusTally adds the two, gate FC-03).
  const restoreTally = useCallback((owner: string) => {
    void loadFocusDay(owner, kstDateToday()).then(
      (stored) => setTally((cur) => restoreFocusTally(cur, owner, stored)),
      () => {},
    );
  }, []);
  // Another account starts from its own empty tally and its own pick (gate FC-01).
  useEffect(() => {
    setTally(freshFocusTally(userId));
    setArea(FOCUS_AREAS[0]);
    if (!userId) return;
    let alive = true;
    restoreTally(userId);
    void loadFocusArea(userId).then(
      (stored) => {
        if (alive) setArea(stored);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [userId, restoreTally]);
  useEffect(() => {
    if (tally.owner && !tally.restored && tally.day.count > 0) restoreTally(tally.owner);
  }, [tally, restoreTally]);
  useEffect(() => {
    const save = focusTallyToSave(tally);
    if (save) void saveFocusDay(save.owner, kstDateToday(), save.day);
  }, [tally]);
  // The pick is written when the person picks, not from an effect: an effect would
  // also fire on mount with the default and could overwrite the stored pick
  // before it is read back.
  const pickArea = (next: LifeArea) => {
    setArea(next);
    if (userId) void saveFocusArea(userId, next);
  };
  // Never show a tally counted for another account, even for the one render
  // before the effect above swaps it.
  const day = tally.owner === userId ? tally.day : EMPTY_FOCUS_DAY;

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
  // The dashboard's own area labels (ops phone.areas.*), one source for both screens.
  const areaLabel = (a: LifeArea) => t(`phone.areas.${a}`);
  const areaName = areaLabel(area);
  const target = 4;
  const filled = Math.min(day.count, target);
  // null = part of today was counted before lengths were stored: no honest total.
  const minutesToday = focusedMinutesToday(day);
  const areaToday = day.byArea[area] ?? 0;
  const setPreset = (m: number) => {
    // Idle-only: mid-session this used to createPomodoro() with no guard and
    // silently destroy the running session (audit: /focus bug-open).
    if (!idle) return;
    setTimer(createPomodoro({ ...timer.config, focusMinutes: m }));
  };

  return (
    <DockShell title={t("focus.title")}>
      <RNText style={[m3TextStyle("bodyMedium"), cx.focusLead]}>
        {t("focus.leadPre")}
        <RNText style={cx.leadStrong}>{t("focus.leadArea", { area: areaName })}</RNText>
        {t("focus.leadPost")}
      </RNText>

      {/* timer ring */}
      <View style={cx.ringWrap}>
        <Svg width={280} height={280} viewBox="0 0 280 280">
          {/* 타이머 링 — 테두리를 도는 칸. 남은 비율만큼 앞에서부터 칠한다(규칙 1). */}
          {(() => {
            const cells = ringCells(140, 140, RING_R, 14);
            const left = RING_C > 0 ? 1 - dashoffset / RING_C : 0;
            const lit = Math.round(cells.length * Math.max(0, Math.min(1, left)));
            return cells.map((p, i) => (
              <Rect
                key={i}
                x={p.x}
                y={p.y}
                width={14}
                height={14}
                fill={i < lit ? m3.color.primary : m3.color.surfaceContainerHighest}
              />
            ));
          })()}
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

      {/* life area this focus counts toward (device-local, see lib/ops/focus-tally) */}
      <RNText style={[m3TextStyle("titleSmall"), cx.sectionLabel]}>{t("focus.forWhichArea")}</RNText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cx.chipScroll}>
        {FOCUS_AREAS.map((a) => (
          <MdChip
            key={a}
            kind="filter"
            selected={area === a}
            label={areaLabel(a)}
            icon={area === a ? <CloneIcon name="check" color={m3.color.onSecondaryContainer} size={15} /> : undefined}
            onPress={() => pickArea(a)}
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
          <RNText style={[m3TextStyle("bodyLarge"), cx.summaryTitle]}>{t("focus.todayCount", { sessions: day.count })}</RNText>
          <RNText style={[m3TextStyle("bodySmall"), cx.summarySub]}>
            {minutesToday === null
              ? t("focus.todaySubGoalOnly", { goal: target })
              : t("focus.todaySub", { min: minutesToday, goal: target })}
          </RNText>
          {areaToday > 0 ? (
            <RNText style={[m3TextStyle("bodySmall"), cx.summarySub]}>
              {t("focus.todayAreaCount", { area: areaName, n: areaToday })}
            </RNText>
          ) : null}
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
  DeepSpaceResetPasswordDesignScreen,
} from "./dds-auth-screens";

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `colors.bgDeep` — 이 파일의 화면들은 `dds-styles` 와 같은 바닥을 쓴다.
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const ddsAlpha2 = (c: string, a: number): string => flattenAlpha(c, a, colors.bgDeep);

// ──────────────────────────────────────────────────────────────────────────
// rev2 M3 clone kit (24-ops / 25-focus / 28-connect / 30-datareview). Shared
// Material-symbol stroke glyphs + a local stylesheet, transcribed 1:1 from the
// reference-app screens. All colors route through m3.* tokens (no hex literals).
// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
//
// 원래 이 자리에 34개짜리 SVG **문자열 레지스트리**가 있었다. 저장소의 세 번째이자
// 마지막 문자열 레지스트리였고(앞의 둘: `SbIcon.ts` 의 `ICON_PATHS`, `DeepSpaceDock`
// 의 `TabIcon`), 전부 곡선 `<path>` 라 PIXEL-CLAY 절대 규칙 1(정수 rect 만)을
// 정면으로 어겼다. 소문자 마크업이라 `<Path` 로 grep 하는 위반 집계에서도 통째로
// 빠져 있었다 — 셋을 합쳐 135 로 세던 것이 실제로는 304 였다.
//
// 여기 남는 것은 **이름 목록**뿐이다: 이 화면들이 어떤 아이콘을 쓰는지의 기록이고,
// `satisfies` 가 그 이름이 정본에 실재하는지를 컴파일 때 확인한다(빠지면 빌드가
// 깨진다 — 화면에서 아이콘이 조용히 사라지는 대신).
const CLONE_ICON_NAMES = [
  "fire", "sparkle", "trending_up", "timer", "schedule", "lightbulb", "share", "check",
  "play_arrow", "pause", "replay", "star_shine", "refresh", "lock", "forum", "bedtime",
  "book", "camera", "bubble", "box", "hub", "cloud_sync", "arrow_forward", "trash",
  "download", "cloud_off", "chevron_right", "badge", "inbox", "delete", "auto_awesome",
  "workspaces", "bubble_chart", "task_alt",
] as const satisfies readonly GlyphAliasName[];

type CloneIconName = (typeof CLONE_ICON_NAMES)[number];
const CLONE_ICON: ReadonlySet<string> = new Set(CLONE_ICON_NAMES);

function CloneIcon({ name, color, size = 20 }: { name: CloneIconName; color: string; size?: number; fill?: boolean }) {
  // `fill` 은 받기만 하고 아무 일도 하지 않는다. 전에는 채움/선을 갈랐지만 rect
  // 글리프는 언제나 채워져 있어 그 구분이 없어졌다(강조는 색이 한다). 호출부
  // 스무 곳을 건드리지 않으려고 prop 만 남겼다 — `SbIcon` 과 같은 처리다.
  const xml = glyphMarkup(GLYPH_ALIAS[name], "currentColor");
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

const cx = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  lead: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4, marginBottom: 14 },
  leadStrong: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "700" },
  sectionLabel: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 22, marginBottom: 10 },

  // ── ops hero ──

  // ── routine rows ──

  // ── analysis card ──
  flex1: { flex: 1, minWidth: 0 },

  // ── 종합 의견 (세컨비 advice) ──
  adviceCard: { padding: 16, backgroundColor: m3.color.surfaceContainerHigh },
  adviceHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  adviceStar: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  adviceHeadline: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 2, lineHeight: 22 },
  adviceRead: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 12, lineHeight: 22 },
  adviceDetail: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 8, lineHeight: 22 },
  evidenceRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 14 },
  evidenceLabel: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginRight: 2 },
  evidenceChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: m3.shape.none, backgroundColor: m3.color.surfaceContainerHighest },
  evidenceChipText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  adviceCta: { marginTop: 16 },
  adviceRefreshRow: { flexDirection: "row", justifyContent: "center", marginTop: 4 },

  // ── 비서 도구 grid ──

  // ── focus ──
  focusLead: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, textAlign: "center", marginTop: 4, marginBottom: 18, lineHeight: 20 },
  ringWrap: { width: 280, height: 280, alignSelf: "center" },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  ringTime: { fontFamily: m3.font.mono, fontSize: 45, fontWeight: "700", color: m3.color.onSurface, letterSpacing: 1 },
  ringSub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 2 },
  chipRowCenter: { flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 18 },
  controlsRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  chipScroll: { gap: 8, paddingRight: 16 },
  focusSummary: { padding: 16, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 16 },
  dotsRow: { flexDirection: "row", gap: 5 },
  summaryDot: { width: 12, height: 12, borderRadius: m3.shape.none },
  summaryTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  summarySub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },

  // ── integrations (PIXEL-CLAY connect salvage) ──
  integrationBody: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  integrationTitle: { color: m3.color.onSurface, marginTop: 8, marginBottom: 4 },
  integrationLead: { color: m3.color.onSurfaceVariant, marginBottom: 12 },
  integrationConsentFrame: { marginBottom: 12 },
  integrationConsent: { paddingHorizontal: 12, paddingVertical: 10 },
  integrationConsentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  integrationConsentText: { flex: 1, color: m3.color.onSecondaryContainer, paddingBottom: 2 },
  integrationStack: { gap: 8 },
  integrationHit: { alignSelf: "stretch", minHeight: 72 },
  integrationRest: {},
  integrationPressed: { transform: [{ translateY: m3.spacing.s1 }] },
  integrationRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12 },
  integrationIconFrame: { width: 44, height: 44 },
  integrationIcon: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 0, paddingVertical: 0 },
  integrationName: { color: m3.color.onSurface, paddingBottom: 2 },
  integrationDetail: { color: m3.color.onSurfaceVariant, marginTop: 2, paddingBottom: 2 },
  integrationActionFrame: { minWidth: 72, maxWidth: 96 },
  integrationAction: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, paddingVertical: 4 },
  integrationActionText: { color: m3.color.onPrimary, textAlign: "center", paddingBottom: 2 },

  // ── datareview ──
  sourceCard: { padding: 14 },
  statGrid: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, padding: 12, alignItems: "center" },
  statNum: { fontFamily: m3.font.mono, fontSize: 15, fontWeight: "700", color: m3.color.onSurface, marginTop: 6 },
  statCap: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 2, textAlign: "center" },
  signalHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  signalFrom: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  signalTo: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "600" },
  signalFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  signalConf: { flex: 1, color: m3.color.tertiary, fontFamily: m3.font.brand },
  rightsCard: { padding: 4 },
  rightsRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: m3.shape.none },
  rightsDivider: { borderTopWidth: 1, borderTopColor: m3.color.outlineVariant },
  rightsLabel: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  rightsLabelDanger: { color: m3.color.error, fontFamily: m3.font.brand },
  rightsSub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
});

// Toggle's text column shares the row with the switch. Without a flex basis it
// kept its natural width and long labels ran past narrow screens (132px in the
// dashboard phone, 2026-10-02 QA). Kept at the end of the file so the line
// citations into this file (DPIA) do not move.
const TOGGLE_TEXT = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 } as const;
