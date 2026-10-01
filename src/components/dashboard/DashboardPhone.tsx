import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, BackHandler, FlatList, PanResponder, Platform, Pressable, StyleSheet, TextInput, View, type ImageStyle } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { Text as BaseText, type TextProps } from "@/components/ui/Text";
import { captureAccountOwnerLease } from "@/lib/auth/account-epoch";
import { withTimeout } from "@/lib/async/with-timeout";
import { loadDashboard } from "@/lib/dashboard/load";
import { countAreaRecords, LIFE_AREAS, localDate, realHealthSamples, routineActionRoute, todayAgenda, type DashboardData } from "@/lib/dashboard/model";
import { DEFAULT_REFRESH_SETTINGS, getRefreshSettings, nextRefreshAt, shouldRefreshAfterResume } from "@/lib/dashboard/refresh-cadence";
import { fitPhoneArtwork } from "@/lib/dashboard/phone-frame";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { PHONE_APP_ICONS, PHONE_NAV_ICONS, PHONE_UI_ART, type PhoneAppId } from "./phone-app-assets";
import { canBeginPhoneDismiss, shouldCompletePhoneDismiss } from "@/lib/dashboard/phone-dismiss";
import rules from "@/lib/dashboard/dashboard-rules.json";
import { recentRecordTrend, selectDashboardPriority, upcomingRoutineDays } from "@/lib/dashboard/summary";
import { logRoutineCompletion } from "@/lib/ops/routines";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { m3 } from "@/lib/theme/m3";
import { useNoticeCenter } from "@/app/notices";
import { renderableBlocks } from "@/lib/notices/markdown";
import { createRecord } from "@/lib/records/create";
import { filterPhoneWikiPages } from "@/lib/wiki/phone-search";
import { getBacklinks, getWikiPageById, listWikiPages } from "@/lib/wiki/queries";
import type { WikiPageRow } from "@/lib/wiki/types";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import { OpsPhoneContent, type OpsPhoneScreen } from "@/screens/deepspace/ops/PhoneOpsContent";
import { MuseumPhoneContent } from "@/screens/deepspace/museum/MuseumTimelineScreen";
import type { ProductNotice } from "@/lib/notices/types";

type Tab = "dashboard" | "tools";
const TABS: Tab[] = ["dashboard", "tools"];
const TOOLS: { id: PhoneAppId; route: string }[] = [
  { id: "assistant", route: "/ops" },
  { id: "focus", route: "/focus" },
  { id: "reminders", route: "/reminders" },
  { id: "money", route: "/ledger" },
  { id: "growth", route: "/milestones" },
  { id: "meals", route: "/meals" },
  { id: "museum", route: "/museum" },
  { id: "community", route: "/community" },
  { id: "relationships", route: "/star/relation" },
];
const APP_ORDER: PhoneAppId[] = [
  "notifications", "assistant", "focus", "reminders",
  "money", "growth", "meals", "museum",
  "community", "relationships", "settings", "more",
];
const PHONE_NAV = ["home", "note", "add", "search", "profile"] as const;
const OPS_PHONE_ROUTES: Record<string, OpsPhoneScreen> = {
  "/ops": "ops",
  "/reading": "reading",
  "/reminders": "reminders",
  "/ledger": "ledger",
  "/milestones": "milestones",
  "/meals": "meals",
  "/side-project": "side-project",
};
const PIXEL_IMAGE = Platform.OS === "web" ? { imageRendering: "pixelated" } as ImageStyle : undefined;

// The phone bezel is always dark, including when the rest of the app uses its
// light palette. Do not inherit a dark theme's text color onto this surface.
function Text({ style, ...rest }: TextProps) {
  return <BaseText {...rest} style={[styles.phoneText, style]} />;
}

function PhoneAction({ label, onPress, glyph = "arrow_forward", disabled = false }: {
  label: string; onPress: () => void; glyph?: AnyGlyphName; disabled?: boolean;
}) {
  return <PixelPressable onPress={onPress} disabled={disabled} accessibilityLabel={label} contentStyle={styles.action}>
    <PixelGlyph name={glyph} size={24} color={m3.color.primary} />
    <Text variant="caption" style={styles.actionText}>{label}</Text>
  </PixelPressable>;
}

export function DashboardPhone({ ownerId, isMinor }: { ownerId: string; isMinor: boolean | null }) {
  const { t, i18n } = useTranslation("ops");
  const { overlay, app } = useLocalSearchParams<{ overlay?: string; app?: string }>();
  const transparentBackdrop = overlay === "home" && router.canGoBack();
  const closePhone = useCallback(() => {
    if (transparentBackdrop) router.back();
    else router.replace("/");
  }, [transparentBackdrop]);
  const [tab, setTab] = useState<Tab>(app === "notifications" ? "tools" : "dashboard");
  const [phoneApp, setPhoneApp] = useState<"notifications" | "more" | null>(app === "notifications" ? "notifications" : null);
  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null);
  const [screenStack, setScreenStack] = useState<string[]>([]);
  const [exitPrompt, setExitPrompt] = useState(false);
  const [recordQuery, setRecordQuery] = useState("");
  const [wikiQuery, setWikiQuery] = useState("");
  const [wikiPages, setWikiPages] = useState<WikiPageRow[]>([]);
  const [wikiOwnerId, setWikiOwnerId] = useState<string | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiFailed, setWikiFailed] = useState(false);
  const [wikiRefresh, setWikiRefresh] = useState(0);
  const [wikiPage, setWikiPage] = useState<WikiPageRow | null>(null);
  const [wikiBacklinks, setWikiBacklinks] = useState<WikiPageRow[]>([]);
  const [wikiBacklinksFailed, setWikiBacklinksFailed] = useState(false);
  const [wikiDetailLoading, setWikiDetailLoading] = useState(false);
  const [wikiDetailFailed, setWikiDetailFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureState, setCaptureState] = useState<"idle" | "saved" | "failed">("idle");
  const [crisisVisible, setCrisisVisible] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const [focusRunning, setFocusRunning] = useState(false);
  const noticeCenter = useNoticeCenter(ownerId);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [writeError, setWriteError] = useState(false);
  const [refreshSettings, setRefreshSettingsState] = useState(DEFAULT_REFRESH_SETTINGS);
  const [showEvidence, setShowEvidence] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const frame = fitPhoneArtwork(frameSize.width, frameSize.height);
  const compactDisplay = frame !== null && frame.screen.height < 600;
  const reducedMotion = useReducedMotionPref();
  const dismissY = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);
  const dismissing = useRef(false);
  const mounted = useRef(true);
  const actionBusy = useRef(false);
  const captureBusyRef = useRef(false);
  const scheduledReadPending = useRef(false);
  const insideRoute = screenStack[screenStack.length - 1] ?? null;
  const museumOpen = insideRoute === "/museum";
  // Museum and the Ops screens draw their own header Back wired to backInside,
  // so the phone's Back row would be a second one. Back lives in one place.
  const contentOwnsBack = museumOpen || (insideRoute !== null && OPS_PHONE_ROUTES[insideRoute] !== undefined);
  const wikiDetailId = insideRoute?.startsWith("/wiki/page/")
    ? decodeURIComponent(insideRoute.slice("/wiki/page/".length)) : null;
  const go = useCallback((route: string) => {
    // Phone-originated navigation stays in the supplied phone display. The
    // independent routes keep their own existing entry points unchanged.
    if (typeof document !== "undefined") (document.activeElement as HTMLElement | null)?.blur?.();
    scrollY.current = 0;
    setRecordQuery("");
    if (route === "/wiki") setWikiQuery("");
    setExitPrompt(false);
    setScreenStack((current) => [...current, route]);
  }, []);
  const backInside = useCallback(() => {
    scrollY.current = 0;
    if (exitPrompt) { setExitPrompt(false); return; }
    if (selectedNoticeId) { setSelectedNoticeId(null); return; }
    if (screenStack.length) { setScreenStack((current) => current.slice(0, -1)); return; }
    if (phoneApp) { setPhoneApp(null); return; }
    if (tab === "tools") { setTab("dashboard"); return; }
    setExitPrompt(true);
  }, [exitPrompt, selectedNoticeId, screenStack.length, phoneApp, tab]);
  useFocusEffect(useCallback(() => {
    if (museumOpen) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => { backInside(); return true; });
    return () => listener.remove();
  }, [backInside, museumOpen]));
  useEffect(() => {
    if (!focusRunning || insideRoute !== "/focus") return;
    const timer = setInterval(() => setFocusSeconds((seconds) => {
      if (seconds <= 1) { setFocusRunning(false); return 0; }
      return seconds - 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [focusRunning, insideRoute]);
  const settlePhone = useCallback(() => {
    Animated.timing(dismissY, {
      toValue: 0,
      duration: reducedMotion ? 0 : 180,
      easing: pixelStepsFor(180),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [dismissY, reducedMotion]);
  const phonePan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      !dismissing.current && canBeginPhoneDismiss(gesture.dy, gesture.dx, scrollY.current),
    onMoveShouldSetPanResponder: (_event, gesture) =>
      !dismissing.current && canBeginPhoneDismiss(gesture.dy, gesture.dx, scrollY.current),
    onPanResponderGrant: () => { dismissY.stopAnimation(); },
    onPanResponderMove: (_event, gesture) => {
      dismissY.setValue(Math.min(frameSize.height, Math.max(0, gesture.dy)));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (!shouldCompletePhoneDismiss(gesture.dy, gesture.vy)) { settlePhone(); return; }
      if (insideRoute || phoneApp || exitPrompt) { backInside(); settlePhone(); return; }
      dismissing.current = true;
      Animated.timing(dismissY, {
        toValue: frameSize.height || 700,
        duration: reducedMotion ? 0 : 240,
        easing: pixelStepsFor(240),
        useNativeDriver: Platform.OS !== "web",
      }).start(({ finished }) => { if (finished && mounted.current) closePhone(); });
    },
    onPanResponderTerminate: settlePhone,
  }), [backInside, closePhone, dismissY, exitPrompt, frameSize.height, insideRoute, phoneApp, reducedMotion, settlePhone]);
  const pageIndex = tab === "dashboard" ? 0 : phoneApp === "more" ? 2 : 1;
  const showPage = useCallback((index: number) => {
    if (index < 0 || index > 2) return;
    scrollY.current = 0;
    setSelectedNoticeId(null);
    setScreenStack([]);
    setExitPrompt(false);
    setTab(index === 0 ? "dashboard" : "tools");
    setPhoneApp(index === 2 ? "more" : null);
  }, []);
  const pagePan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      !insideRoute && !exitPrompt && Math.abs(gesture.dx) > 30 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) > 55) showPage(pageIndex + (gesture.dx < 0 ? 1 : -1));
    },
  }), [exitPrompt, insideRoute, pageIndex, showPage]);
  useEffect(() => () => dismissY.stopAnimation(), [dismissY]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void loadDashboard(ownerId, isMinor).then((next) => {
      if (active) setData(next);
    }).catch(() => { if (active) { setData(null); setFailed(true); } }).finally(() => {
      if (active) { setLoading(false); scheduledReadPending.current = false; }
    });
    return () => { active = false; scheduledReadPending.current = false; };
  }, [ownerId, isMinor, refresh]));
  useFocusEffect(useCallback(() => {
    let active = true;
    void getRefreshSettings(ownerId).then((settings) => { if (active) setRefreshSettingsState(settings); });
    return () => { active = false; };
  }, [ownerId]));
  useFocusEffect(useCallback(() => {
    if (!refreshSettings.enabled) return;
    const requestScheduledRead = () => {
      if (scheduledReadPending.current) return;
      scheduledReadPending.current = true;
      setRefresh((value) => value + 1);
    };
    const next = nextRefreshAt(new Date(), refreshSettings);
    const timer = next ? setTimeout(() => {
      if (AppState.currentState === "active") requestScheduledRead();
    }, Math.max(0, next.getTime() - Date.now())) : null;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && data?.readAt && shouldRefreshAfterResume(new Date(data.readAt), new Date(), refreshSettings)) {
        requestScheduledRead();
      }
    });
    return () => { if (timer) clearTimeout(timer); subscription.remove(); };
  }, [refreshSettings, data?.readAt, refresh]));

  useFocusEffect(useCallback(() => {
    if (insideRoute !== "/wiki") return;
    let active = true;
    const lease = captureAccountOwnerLease(ownerId);
    setWikiLoading(true);
    setWikiFailed(false);
    if (!lease?.isCurrent()) {
      setWikiLoading(false);
      setWikiFailed(true);
      return;
    }
    void listWikiPages(ownerId, { limit: 200 }).then((pages) => {
      if (active && lease.isCurrent()) { setWikiPages(pages); setWikiOwnerId(ownerId); }
    }).catch(() => { if (active && lease.isCurrent()) setWikiFailed(true); }).finally(() => {
      if (active && lease.isCurrent()) setWikiLoading(false);
    });
    return () => { active = false; };
  }, [insideRoute, ownerId, wikiRefresh]));

  useFocusEffect(useCallback(() => {
    if (!wikiDetailId) return;
    let active = true;
    const lease = captureAccountOwnerLease(ownerId);
    setWikiPage(null);
    setWikiBacklinks([]);
    setWikiBacklinksFailed(false);
    setWikiDetailLoading(true);
    setWikiDetailFailed(false);
    if (!lease?.isCurrent()) {
      setWikiDetailLoading(false);
      setWikiDetailFailed(true);
      return;
    }
    void Promise.all([getWikiPageById(ownerId, wikiDetailId), getBacklinks(ownerId, wikiDetailId)
      .then((pages) => ({ pages, failed: false }))
      .catch(() => ({ pages: [] as WikiPageRow[], failed: true }))]).then(([page, backlinks]) => {
      if (active && lease.isCurrent()) {
        setWikiPage(page);
        setWikiBacklinks(backlinks.pages);
        setWikiBacklinksFailed(backlinks.failed);
      }
    }).catch(() => { if (active && lease.isCurrent()) setWikiDetailFailed(true); }).finally(() => {
      if (active && lease.isCurrent()) setWikiDetailLoading(false);
    });
    return () => { active = false; };
  }, [wikiDetailId, ownerId, wikiRefresh]));

  const filteredWikiPages = useMemo(() => wikiOwnerId === ownerId
    ? filterPhoneWikiPages(wikiPages, wikiQuery) : [], [wikiOwnerId, ownerId, wikiPages, wikiQuery]);

  const date = (value: string, includeTime = false) => {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return t("phone.unknownDate");
    return parsed.toLocaleString(i18n.language, includeTime
      ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric", weekday: "short" });
  };
  const agenda = data?.routines.ok && data.completions.ok
    ? todayAgenda(data.routines.value, data.completions.value, new Date()) : [];
  const completed = agenda.filter((item) => item.completed).length;
  const interviews = data?.interviews.ok ? data.interviews.value.filter((item) => item.body?.trim()) : [];
  const health = data?.healthEnabled && data.health.ok ? realHealthSamples(data.health.value)[0] : undefined;
  const partial = data && Object.values(data).some((value) => value && typeof value === "object" && "ok" in value && !value.ok);

  async function complete(id: string) {
    if (actionBusy.current) return;
    const lease = captureAccountOwnerLease(ownerId);
    if (!lease?.isCurrent()) return;
    actionBusy.current = true;
    setBusy(id);
    setWriteError(false);
    try {
      await withTimeout(logRoutineCompletion(ownerId, id, localDate(new Date())), 8_000, "dashboard completion");
      if (mounted.current && lease.isCurrent()) setRefresh((value) => value + 1);
    } catch { if (mounted.current && lease.isCurrent()) setWriteError(true); }
    finally { actionBusy.current = false; if (mounted.current && lease.isCurrent()) setBusy(null); }
  }

  async function savePhoneNote() {
    const body = draft.trim();
    if (!body || captureBusyRef.current) return;
    const lease = captureAccountOwnerLease(ownerId);
    if (!lease?.isCurrent()) return;
    captureBusyRef.current = true;
    setCaptureBusy(true);
    setCaptureState("idle");
    try {
      const saved = await createRecord({
        userId: ownerId, locale: i18n.language.toLowerCase().startsWith("ko") ? "ko" : "en",
        minor: isMinor === true, kind: "note", body, withFollowup: false,
      });
      if (!mounted.current || !lease.isCurrent()) return;
      setDraft("");
      setCaptureState("saved");
      if (saved.followup?.zone === "red") setCrisisVisible(true);
      setRefresh((value) => value + 1);
    } catch {
      if (mounted.current && lease.isCurrent()) setCaptureState("failed");
    } finally {
      captureBusyRef.current = false;
      if (mounted.current && lease.isCurrent()) setCaptureBusy(false);
    }
  }

  function internalPage(route: string) {
    const opsScreen = OPS_PHONE_ROUTES[route];
    if (opsScreen) return <OpsPhoneContent screen={opsScreen} onBack={backInside} onNavigate={go} />;
    const records = data?.records.ok ? data.records.value : [];
    const recordFailed = !!data && !data.records.ok;
    const area = route.startsWith("/star/") ? route.slice(6) : null;
    const title = route === "/focus" ? t("phone.apps.focus") :
      route === "/museum" ? t("phone.apps.museum") :
      route === "/community" ? t("phone.apps.community") :
      route === "/avatar-palette" ? t("phone.apps.avatarPalette") :
      route === "/settings" ? t("phone.apps.settings") :
      route === "/profile" ? t("phone.nav.profile") :
      route === "/capture" ? t("phone.nav.add") :
      route === "/wiki" || route.startsWith("/wiki/page/") ? t("phone.moreApps.wiki") :
      route === "/search" ? t("phone.nav.search") :
      route === "/records" ? t("phone.nav.note") :
      area && LIFE_AREAS.some((item) => item === area) ? t(`phone.areas.${area}`) :
      route.startsWith("/record/") ? t("phone.moreApps.records") : t("phone.moreTitle");
    const searchList = route === "/records" || route === "/search";
    const filtered = records.filter((record) => (!area || record.tags?.includes(`domain:${area}`)) &&
      (!recordQuery || record.body?.toLocaleLowerCase().includes(recordQuery.toLocaleLowerCase())));
    const selected = route.startsWith("/record/") ? [...records, ...interviews].find((record) => record.id === decodeURIComponent(route.slice(8))) : null;
    return <View style={styles.stack}>
      <Text variant="heading">{title}</Text>
      {route === "/capture" ? <PixelSurface variant="frame" contentStyle={styles.routine}>
        <Text variant="caption" style={styles.muted}>{t("phone.internal.captureScope")}</Text>
        <TextInput accessibilityLabel={t("phone.internal.noteInput")} multiline value={draft} onChangeText={setDraft} placeholder={t("phone.internal.noteInput")} placeholderTextColor={m3.color.onSurfaceVariant} style={[styles.noteInput, styles.phoneText]} />
        <PhoneAction label={captureBusy ? t("phone.saving") : t("phone.internal.saveNote")} glyph="check" disabled={!draft.trim() || captureBusy} onPress={() => { void savePhoneNote(); }} />
        {captureState === "saved" ? <Text accessibilityRole="alert" variant="caption" style={styles.accent}>{t("phone.internal.saved")}</Text> : null}
        {captureState === "failed" ? <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.saveError")}</Text> : null}
      </PixelSurface> : null}
      {route === "/focus" ? <PixelSurface variant="frame" contentStyle={styles.routine}>
        <Text variant="heading" style={styles.focusClock}>{`${String(Math.floor(focusSeconds / 60)).padStart(2, "0")}:${String(focusSeconds % 60).padStart(2, "0")}`}</Text>
        <Text variant="caption" style={styles.muted}>{t("phone.internal.focusLocal")}</Text>
        <View style={styles.actions}>
          <PhoneAction label={t(focusRunning ? "phone.internal.pause" : "phone.internal.start")} glyph="timer" onPress={() => setFocusRunning((value) => !value)} />
          <PhoneAction label={t("phone.internal.reset")} glyph="refresh" onPress={() => { setFocusRunning(false); setFocusSeconds(25 * 60); }} />
        </View>
      </PixelSurface> : null}
      {route === "/wiki" ? <View style={styles.stack}>
        <TextInput accessibilityLabel={t("wiki:searchPieces")} value={wikiQuery} onChangeText={setWikiQuery} placeholder={t("wiki:searchPieces")} placeholderTextColor={m3.color.onSurfaceVariant} style={[styles.searchInput, styles.phoneText]} />
        {wikiLoading ? <Text variant="caption" style={styles.muted}>{t("wiki:loading")}</Text> : null}
        {wikiFailed ? <View style={styles.stack}>
          <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text>
          <PhoneAction label={t("phone.retry")} glyph="refresh" onPress={() => setWikiRefresh((value) => value + 1)} />
        </View> : null}
        {!wikiLoading && !wikiFailed && wikiOwnerId === ownerId && wikiPages.length === 0 ? <Text variant="caption" style={styles.muted}>{t("wiki:empty")}</Text> : null}
        {!wikiLoading && !wikiFailed && wikiOwnerId === ownerId && wikiPages.length > 0 && filteredWikiPages.length === 0 ? <Text variant="caption" style={styles.muted}>{t("wiki:noMatch", { query: wikiQuery.trim() })}</Text> : null}
      </View> : null}
      {route.startsWith("/wiki/page/") ? <View style={styles.stack}>
        {wikiDetailLoading ? <Text variant="caption" style={styles.muted}>{t("wiki:loading")}</Text> : null}
        {wikiDetailFailed ? <View style={styles.stack}>
          <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text>
          <PhoneAction label={t("phone.retry")} glyph="refresh" onPress={() => setWikiRefresh((value) => value + 1)} />
        </View> : null}
        {!wikiDetailLoading && !wikiDetailFailed && wikiPage?.user_id === ownerId && wikiPage.id === wikiDetailId ? <PixelSurface variant="frame" contentStyle={styles.evidence}>
          <Text variant="heading">{wikiPage.title || wikiPage.slug}</Text>
          <Text variant="caption" style={styles.muted}>{t("wiki:savedAs", { name: wikiPage.slug })}</Text>
          <Text variant="body">{wikiPage.body_md || t("wiki:emptyBody")}</Text>
          <Text variant="caption" style={styles.muted}>{t("wiki:backlinks")} ({wikiBacklinks.length})</Text>
          {wikiBacklinksFailed ? <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : null}
        </PixelSurface> : null}
        {!wikiDetailLoading && !wikiDetailFailed && wikiPage === null ? <Text variant="caption" style={styles.muted}>{t("wiki:empty")}</Text> : null}
      </View> : null}
      {searchList ? <TextInput accessibilityLabel={t("phone.internal.searchRecords")} value={recordQuery} onChangeText={setRecordQuery} placeholder={t("phone.internal.searchRecords")} placeholderTextColor={m3.color.onSurfaceVariant} style={[styles.searchInput, styles.phoneText]} /> : null}
      {searchList || area ? <View style={styles.stack}>
        <Text variant="caption" style={styles.muted}>{t(area ? "phone.areaScope" : "phone.metricsSummary.records.scope")}</Text>
        {failed ? <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : !data || loading ? <Text variant="caption" style={styles.muted}>{t("phone.loading")}</Text> : recordFailed ?
          <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : filtered.length ? filtered.slice(0, 20).map((record) => <PixelPressable key={record.id} fullWidth onPress={() => go(`/record/${encodeURIComponent(record.id)}`)} accessibilityLabel={record.body?.trim().slice(0, 80) || t("phone.internal.untitledRecord")} contentStyle={styles.evidence}>
            <Text variant="body" numberOfLines={3}>{record.body?.trim() || t("phone.internal.untitledRecord")}</Text>
            <Text variant="caption" style={styles.muted}>{date(record.created_at)}</Text>
          </PixelPressable>) : <Text variant="caption" style={styles.muted}>{t("phone.operational.sourceStates.empty")}</Text>}
      </View> : null}
      {route.startsWith("/record/") ? <View style={styles.stack}>
        {failed ? <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : !data || loading ? <Text variant="caption" style={styles.muted}>{t("phone.loading")}</Text> : recordFailed && !selected ?
          <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : selected ? <PixelSurface variant="frame" contentStyle={styles.evidence}>
            <Text variant="body">{selected.body?.trim() || t("phone.internal.untitledRecord")}</Text>
            <Text variant="caption" style={styles.muted}>{date(selected.created_at)}</Text>
          </PixelSurface> : <Text variant="caption" style={styles.muted}>{t("phone.operational.sourceStates.empty")}</Text>}
      </View> : null}
      {route === "/settings" ? <Text variant="caption" style={styles.muted}>{t("phone.internal.settingsScope")}</Text> : null}
      {route === "/profile" ? <Text variant="caption" style={styles.muted}>{failed ? t("phone.readError") : !data || loading ? t("phone.loading") : data.records.ok ? t("phone.internal.profileSummary", { count: data.records.value.length }) : t("phone.readError")}</Text> : null}
      {["/community", "/avatar-palette"].includes(route) ? <Text variant="caption" style={styles.muted}>{t("phone.internal.unavailable")}</Text> : null}
      {!["/capture", "/focus", "/ops", "/reminders", "/records", "/wiki", "/search", "/settings", "/profile", "/community", "/avatar-palette"].includes(route) && !route.startsWith("/wiki/page/") && !route.startsWith("/star/") && !route.startsWith("/record/") && !area ?
        <Text variant="caption" style={styles.muted}>{t("phone.internal.unavailable")}</Text> : null}
    </View>;
  }

  function dashboard() {
    if (failed) return <View style={styles.stack}>
      <Text variant="heading">{t("phone.operational.title")}</Text>
      <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text>
      <PhoneAction label={t("phone.retry")} glyph="refresh" onPress={() => setRefresh((value) => value + 1)} />
    </View>;
    const now = new Date();
    const priority = selectDashboardPriority(data, now);
    const trend = recentRecordTrend(data, now);
    const week = upcomingRoutineDays(data, now);
    const maxTrend = Math.max(1, ...(trend?.days.map((day) => day.count) ?? []));
    const metricValue = (id: string) => {
      if (id === "routines") {
        if (!data?.routines.ok || !data.completions.ok) return t("phone.operational.sourceStates.unknown");
        return agenda.length ? `${completed}/${agenda.length}` : t("phone.operational.sourceStates.empty");
      }
      if (id === "records") {
        if (!data?.records.ok) return t("phone.operational.sourceStates.unknown");
        return !data.records.value.length ? t("phone.operational.sourceStates.empty") :
          data.records.value.length >= rules.recordReadLimit ? `${rules.recordReadLimit}+` : String(data.records.value.length);
      }
      if (isMinor !== false) return t("phone.metricsSummary.restricted");
      if (!data?.health.ok) return t("phone.operational.sourceStates.unknown");
      if (!data.healthEnabled) return t("phone.metricsSummary.off");
      return health ? `${health.value.toLocaleString(i18n.language)} ${health.unit}` : t("phone.operational.sourceStates.empty");
    };
    return <View style={styles.stack}>
      {!compactDisplay ? <>
        <Text variant="heading">{t("phone.operational.title")}</Text>
        <Text variant="caption" numberOfLines={2} style={styles.dashboardScope}>{t("phone.operational.scope")}</Text>
      </> : null}
      {priority ? <PixelSurface variant="frame" contentStyle={styles.lead}>
        <Text variant="caption" style={styles.accent}>{t("phone.todayLabel")}</Text>
        <Text variant="heading">{priority.evidence ?? t(`phone.priority.${priority.kind}.title`)}</Text>
        <Text variant="caption" style={styles.muted}>{t(`phone.priority.${priority.kind}.detail`)}</Text>
        {priority.route ? <PhoneAction label={t(priority.kind === "startInterview" ? "phone.internal.startNote" : `phone.priority.${priority.kind}.action`)} onPress={() => go(priority.route === "/me/now" ? "/capture" : priority.route!)} /> : null}
      </PixelSurface> : !loading ? <Text variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : null}
      <Text variant="heading">{t("phone.operational.atGlance")}</Text>
      <View style={styles.metricGrid}>{rules.metricOrder.map((id) => <PixelPressable key={id} variant="inset" rootStyle={styles.metric} onPress={() => setExpandedMetric((current) => current === id ? null : id)} accessibilityLabel={`${t(`phone.metricsSummary.${id}.title`)}: ${metricValue(id)}`} accessibilityState={{ expanded: expandedMetric === id }} contentStyle={styles.metricContent}>
        <Text variant="caption" style={styles.muted}>{t(`phone.metricsSummary.${id}.title`)}</Text>
        <Text variant="body" style={styles.metricValue}>{metricValue(id)}</Text>
        <Text variant="caption" style={styles.muted}>{t(`phone.metricsSummary.${id}.scope`)}</Text>
        {expandedMetric === id ? <Text variant="caption" style={styles.muted}>{t(`phone.metricsSummary.${id}.method`)}</Text> : null}
      </PixelPressable>)}</View>
      <Text variant="heading">{t("phone.operational.outlook")}</Text>
      <PixelSurface variant="frame" contentStyle={styles.routine}>
        <Text variant="body">{t("phone.operational.recordTrend")}</Text>
        {trend && data?.records.ok && data.records.value.length === 0 ? <Text variant="caption" style={styles.muted}>{t("phone.operational.sourceStates.empty")}</Text> : trend ? <View style={styles.chart}>{trend.days.map((day) => <View key={day.key} style={styles.chartDay}>
          <Text variant="caption" style={styles.centered}>{day.count}</Text>
          <View style={styles.chartTrack}><View style={[styles.chartBar, { height: day.count ? Math.max(4, Math.round(42 * day.count / maxTrend)) : 0 }]} /></View>
          <Text variant="caption" style={styles.centered}>{day.date.toLocaleDateString(i18n.language, { weekday: "short" })}</Text>
        </View>)}</View> : <Text variant="caption" style={styles.muted}>{t("phone.readError")}</Text>}
        <Text variant="caption" style={styles.muted}>{t(trend?.limited ? "phone.operational.recordTrendLimited" : "phone.operational.recordTrendScope")}</Text>
      </PixelSurface>
      <PixelSurface variant="frame" contentStyle={styles.routine}>
        <Text variant="body">{t("phone.weekAhead")}</Text>
        <Text variant="caption" style={styles.muted}>{t("phone.weekAheadScope")}</Text>
        {data?.routines.ok && data.routines.value.length === 0 ? <Text variant="caption" style={styles.muted}>{t("phone.operational.sourceStates.empty")}</Text> : week.length ? <View style={styles.week}>{week.map((day) => <PixelPressable key={day.key} rootStyle={styles.weekDay} accessibilityLabel={`${day.date.toLocaleDateString(i18n.language, { month: "short", day: "numeric" })}: ${t("phone.weekAheadCount", { count: day.count })}`} onPress={() => go("/reminders")} contentStyle={styles.weekDayContent}>
          <Text variant="caption" style={styles.centered}>{day.date.toLocaleDateString(i18n.language, { weekday: "short" })}</Text>
          <Text variant="caption" style={day.count ? styles.accent : styles.muted}>{day.count}</Text>
        </PixelPressable>)}</View> : <Text variant="caption" style={styles.muted}>{t("phone.readError")}</Text>}
      </PixelSurface>
      <PixelPressable fullWidth onPress={() => setShowEvidence((value) => !value)} accessibilityState={{ expanded: showEvidence }} accessibilityLabel={t(showEvidence ? "phone.operational.hideEvidence" : "phone.operational.showEvidence")} contentStyle={styles.smallAction}>
        <Text variant="body">{t(showEvidence ? "phone.operational.hideEvidence" : "phone.operational.showEvidence")}</Text>
      </PixelPressable>
      {showEvidence ? <View style={styles.stack}>
      <View style={styles.sectionHeading}>
        <Text variant="heading">{t("phone.agenda")}</Text>
        <PhoneAction label={t("phone.allRoutines")} glyph="schedule" onPress={() => go("/reminders")} />
      </View>
      {data && (!data.routines.ok || !data.completions.ok) ? <Text variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : agenda.length === 0 ?
        <Text variant="body" style={styles.muted}>{t("phone.emptyAgenda")}</Text> : agenda.slice(0, 3).map((item) => <PixelSurface key={item.id} variant="frame" contentStyle={styles.routine}>
          <Text variant="caption" style={styles.accent}>{item.completed ? t("phone.completed") : item.reminder_time?.slice(0, 5) ?? t("phone.anytime")}</Text>
          <Text variant="body">{item.title}</Text>
          {item.reason ? <Text variant="caption" style={styles.muted}>{item.reason.slice(0, 180)}</Text> : null}
          <View style={styles.actions}>
            <PhoneAction label={t("phone.openTask")} onPress={() => go(routineActionRoute(item.domain_id))} />
            {!item.completed ? <PhoneAction label={t(busy === item.id ? "phone.saving" : "phone.markDone")} glyph="check" disabled={busy !== null || loading} onPress={() => { void complete(item.id); }} /> : null}
          </View>
        </PixelSurface>)}
      {writeError ? <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.saveError")}</Text> : null}
      {week.some((day) => day.count > 0) ? <View style={styles.stack}>
        <Text variant="heading">{t("phone.weekAhead")}</Text>
        <Text variant="caption" style={styles.muted}>{t("phone.weekAheadScope")}</Text>
        <View style={styles.week}>{week.map((day) => <PixelPressable key={day.key} rootStyle={styles.weekDay} accessibilityLabel={`${day.date.toLocaleDateString(i18n.language, { month: "short", day: "numeric" })}: ${t("phone.weekAheadCount", { count: day.count })}`} onPress={() => go("/reminders")} contentStyle={styles.weekDayContent}>
          <Text variant="caption" style={styles.centered}>{day.date.toLocaleDateString(i18n.language, { weekday: "short" })}</Text>
          <Text variant="caption" style={day.count ? styles.accent : styles.muted}>{day.count}</Text>
        </PixelPressable>)}</View>
      </View> : null}
      <Text variant="heading">{t("phone.myWords")}</Text>
      {data && !data.interviews.ok ? <Text variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : interviews[0] ?
        <PixelPressable fullWidth onPress={() => go(`/record/${encodeURIComponent(interviews[0].id)}`)} accessibilityLabel={t("phone.openEvidence")} contentStyle={styles.evidence}>
          <Text variant="body">{interviews[0].body?.trim().slice(0, 220)}</Text>
          <Text variant="caption" style={styles.muted}>{t("phone.interviewSource", { date: date(interviews[0].created_at) })}</Text>
        </PixelPressable> : <View style={styles.stack}>
          <Text variant="body" style={styles.muted}>{t("phone.emptyInterview")}</Text>
          <PhoneAction label={t("phone.internal.startNote")} glyph="bubble" onPress={() => go("/capture")} />
        </View>}
      <Text variant="heading">{t("phone.lifeAreas")}</Text>
      <Text variant="caption" style={styles.muted}>{t("phone.areaScope")}</Text>
      <View style={styles.grid}>{LIFE_AREAS.map((area) => <PixelPressable key={area} onPress={() => go(`/star/${area}`)} rootStyle={styles.area} contentStyle={styles.areaContent} accessibilityLabel={t(`phone.areas.${area}`)}>
        <Text variant="caption">{t(`phone.areas.${area}`)}</Text>
        <Text variant="heading" style={styles.accent}>{data?.records.ok ? countAreaRecords(data.records.value, area) : "?"}</Text>
      </PixelPressable>)}</View>
      {health ? <PixelPressable fullWidth onPress={() => go("/star/health")} accessibilityLabel={t("phone.openActivity")} contentStyle={styles.evidence}>
        <Text variant="caption" style={styles.accent}>{t("phone.latestActivity")}</Text>
        <Text variant="body">{t(`phone.metrics.${health.metric_type}`, { defaultValue: health.metric_type })} · {health.value.toLocaleString(i18n.language)} {health.unit}</Text>
        <Text variant="caption" style={styles.muted}>{health.source} · {date(health.started_at, true)}</Text>
      </PixelPressable> : null}
      </View> : null}
    </View>;
  }

  function tools() {
    if (phoneApp === "notifications") {
      const selected = noticeCenter.notices.find((item) => item.id === selectedNoticeId);
      const ko = i18n.language.toLowerCase().startsWith("ko");
      return <View style={styles.stack}>
        <Text variant="heading">{t("phone.apps.notifications")}</Text>
        {selected ? <PixelSurface variant="frame" contentStyle={styles.noticeDetail}>
            <Text variant="caption" style={styles.accent}>{ko ? selected.listMeta.ko : selected.listMeta.en}</Text>
            <Text variant="body">{ko ? selected.title.ko : selected.title.en}</Text>
            {renderableBlocks(selected.body, ko).map((block, index) => <Text key={`${selected.id}-${index}`} variant="caption" style={styles.muted}>
              {block.kind === "bullet" ? "• " : ""}{ko ? block.text.ko : block.text.en}
            </Text>)}
          </PixelSurface> : null}
      </View>;
    }
    if (phoneApp === "more") return <View style={styles.stack}>
      <Text variant="heading">{t("phone.moreTitle")}</Text>
      <View style={styles.appGrid}>
        <Pressable testID="phone-avatar-palette" accessibilityRole="button" accessibilityLabel={t("phone.apps.avatarPalette")} onPress={() => go("/avatar-palette")} style={[styles.appTile, { height: appTileHeight }]}>
          <Image source={PHONE_UI_ART.tile} contentFit="fill" pointerEvents="none" style={[styles.tileArt, PIXEL_IMAGE]} />
          <Image source={PHONE_APP_ICONS.avatarPalette} contentFit="contain" pointerEvents="none" style={[styles.appIcon, { width: appIconSize, height: appIconSize }, PIXEL_IMAGE]} />
          <Text variant="caption" numberOfLines={1} style={styles.appLabel}>{t("phone.apps.avatarPaletteShort")}</Text>
        </Pressable>
      </View>
      <PhoneAction label={t("phone.moreApps.records")} glyph="article" onPress={() => go("/records")} />
      <PhoneAction label={t("phone.moreApps.wiki")} onPress={() => go("/wiki")} />
      <PhoneAction label={t("phone.moreApps.capture")} glyph="add" onPress={() => go("/capture")} />
      <PhoneAction label={t("tools.reading.label")} onPress={() => go("/reading")} />
      <PhoneAction label={t("tools.sideProject.label")} onPress={() => go("/side-project")} />
    </View>;
    return <View style={styles.launcherStack}>
      <View style={styles.launcherHeading}>
        <Text variant="heading" style={styles.launcherTitle}>{t("phone.toolsTitle")}</Text>
        <Text variant="caption" style={styles.launcherHint}>{t("phone.toolsHint")}</Text>
      </View>
      <View style={styles.appGrid}>{APP_ORDER.map((id) => {
        const disabled = id === "community" && isMinor !== false;
        const open = () => {
          if (id === "notifications") { scrollY.current = 0; setPhoneApp("notifications"); return; }
          if (id === "more") { showPage(2); return; }
          if (id === "settings") { go("/settings"); return; }
          const route = TOOLS.find((item) => item.id === id)?.route;
          if (route) go(route);
        };
        return <Pressable key={id} accessibilityRole="button" accessibilityLabel={t(`phone.apps.${id}`)} disabled={disabled} onPress={open} style={[styles.appTile, { height: appTileHeight }]}>
          <Image source={PHONE_UI_ART.tile} contentFit="fill" pointerEvents="none" style={[styles.tileArt, PIXEL_IMAGE]} />
          <Image source={PHONE_APP_ICONS[id]} contentFit="contain" pointerEvents="none" style={[styles.appIcon, { width: appIconSize, height: appIconSize }, PIXEL_IMAGE]} />
          <Text variant="caption" numberOfLines={2} style={[styles.appLabel, disabled && styles.appLabelDisabled]}>{t(`phone.apps.${id}`)}</Text>
          {id === "notifications" && unreadCount > 0 ? <View style={styles.badge}><Text variant="caption" style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text></View> : null}
        </Pressable>;
      })}</View>
    </View>;
  }

  function noticeRow(item: ProductNotice) {
    const ko = i18n.language.toLowerCase().startsWith("ko");
    return <PixelPressable fullWidth onPress={() => {
      setSelectedNoticeId(item.id);
      if (noticeCenter.isUnread(item.id)) void noticeCenter.markSeen(item.id);
    }} accessibilityLabel={ko ? item.title.ko : item.title.en} contentStyle={styles.noticeRow}>
      <PixelGlyph name="notifications" size={20} color={m3.color.primary} />
      <View style={styles.noticeCopy}>
        <Text variant="body">{ko ? item.title.ko : item.title.en}</Text>
        <Text variant="caption" style={styles.muted}>{ko ? item.listMeta.ko : item.listMeta.en}{noticeCenter.isUnread(item.id) ? ` · ${t("phone.noticeUnread")}` : ""}</Text>
      </View>
    </PixelPressable>;
  }

  const unreadCount = noticeCenter.notices.filter((item) => noticeCenter.isUnread(item.id)).length;
  const noticeListOpen = !insideRoute && tab === "tools" && phoneApp === "notifications" && !selectedNoticeId;
  const internalActive = !!insideRoute || phoneApp === "notifications" || exitPrompt;
  const wikiListOpen = insideRoute === "/wiki";
  const wikiDetailOpen = wikiDetailId !== null;
  const phoneRows: (ProductNotice | WikiPageRow | number)[] = noticeListOpen
    ? (noticeCenter.hydrated ? noticeCenter.notices : [])
    : wikiListOpen ? [0, ...(!wikiLoading && !wikiFailed ? filteredWikiPages : [])]
    : wikiDetailOpen ? [0, ...(!wikiDetailLoading && !wikiDetailFailed && wikiPage?.user_id === ownerId && wikiPage.id === wikiDetailId ? wikiBacklinks : [])]
    : [0];
  const wikiRow = (page: WikiPageRow) => <PixelPressable fullWidth onPress={() => go(`/wiki/page/${encodeURIComponent(page.id)}`)} accessibilityLabel={t("wiki:openPage", { title: page.title || page.slug })} contentStyle={styles.evidence}>
    <Text variant="body" numberOfLines={2}>{page.title || page.slug}</Text>
    <Text variant="caption" style={styles.muted}>{t("wiki:savedAs", { name: page.slug })}</Text>
  </PixelPressable>;
  // The display shrinks with the bezel; the launcher must fit all three rows
  // above its fixed internal dock on smaller phones, not hide the last labels.
  const appTileHeight = Math.max(48, Math.min(67, Math.floor(((frame?.screen.height ?? 512) - 300) / 3)));
  const appIconSize = Math.max(25, Math.min(36, appTileHeight - 29));
  return <DeepSpaceScreen active="ops" header="none" variant="fullbleed" showSharedSky transparentBackdrop={transparentBackdrop}>
    <View pointerEvents="none" style={styles.phoneBackdrop}><PixelScrim style={styles.phoneScrimImage} /></View>
    <Animated.View {...(museumOpen ? {} : phonePan.panHandlers)} testID="dashboard-phone" style={[styles.phone, { transform: [{ translateY: dismissY }] }]} onLayout={({ nativeEvent: { layout } }) => {
      setFrameSize((current) => current.width === layout.width && current.height === layout.height
        ? current : { width: layout.width, height: layout.height });
    }}>
      {frame ? <>
      <Image
        source={require("../../../assets/images/secondb-cellphone-screen.png")}
        contentFit="fill"
        accessible={false}
        pointerEvents="none"
        style={[styles.artwork, frame.artwork]}
      />
      <View style={[styles.display, frame.screen]}>
      <View style={styles.statusBar}>
        <View style={styles.brandGroup}>
          <Image source={PHONE_UI_ART.brand} contentFit="contain" style={[styles.headerIcon, PIXEL_IMAGE]} accessible={false} />
          <Text variant="body" style={styles.brandText}>PolaScope</Text>
        </View>
        <View style={styles.dateGroup}>
          <Text variant="caption" style={styles.dateText}>{date(new Date().toISOString())}</Text>
          <Image source={PHONE_UI_ART.sun} contentFit="contain" style={[styles.headerIcon, PIXEL_IMAGE]} accessible={false} />
        </View>
      </View>
      {!compactDisplay && !internalActive && tab === "tools" ? <View style={styles.heroBanner} accessible={false}>
        <Image source={PHONE_UI_ART.hero} contentFit="cover" pointerEvents="none" style={[StyleSheet.absoluteFill, PIXEL_IMAGE]} />
        <View style={styles.heroCopy}>
          <Text variant="body" style={styles.heroTitle}>{t("phone.bannerTitle")}</Text>
          <Text variant="caption" style={styles.heroSubtitle}>{t("phone.bannerSubtitle")}</Text>
        </View>
      </View> : null}
      {internalActive && !contentOwnsBack ? <PhoneAction label={selectedNoticeId ? t("phone.noticeListBack") : t("phone.internal.back")} glyph="arrow_back" onPress={backInside} /> : null}
      {!internalActive ? <View style={styles.tabs}>{TABS.map((item, index) => <PixelPressable key={item} rootStyle={styles.tab} onPress={() => showPage(index)} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} background={tab === item ? m3.color.primaryContainer : m3.color.surfaceContainer} contentStyle={styles.tabContent}>
        <Image source={item === "dashboard" ? PHONE_UI_ART.dashboard : PHONE_UI_ART.apps} contentFit="contain" style={[styles.tabIcon, PIXEL_IMAGE]} accessible={false} />
        <Text variant="caption" style={styles.tabLabel}>{t(`phone.tabs.${item}`)}</Text>
      </PixelPressable>)}</View> : null}
      {!internalActive ? <View style={styles.pageControls} accessibilityLabel={t("phone.pageControls")}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("phone.previousPage")} disabled={pageIndex === 0} onPress={() => showPage(pageIndex - 1)} style={styles.pageArrow}>
          {pageIndex > 0 ? <Image source={PHONE_UI_ART.previous} contentFit="contain" style={[styles.pageIcon, PIXEL_IMAGE]} accessible={false} /> : null}
        </Pressable>
        <View style={styles.pageDots}>{[0, 1, 2].map((index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={t("phone.pageNumber", { number: index + 1 })} accessibilityState={{ selected: pageIndex === index }} onPress={() => showPage(index)} style={styles.pageDotButton}>
          <Image source={pageIndex === index ? PHONE_UI_ART.currentPage : PHONE_UI_ART.otherPage} contentFit="contain" style={[styles.pageDot, PIXEL_IMAGE]} accessible={false} />
        </Pressable>)}</View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("phone.nextPage")} disabled={pageIndex === 2} onPress={() => showPage(pageIndex + 1)} style={styles.pageArrow}>
          {pageIndex < 2 ? <Image source={PHONE_UI_ART.next} contentFit="contain" style={[styles.pageIcon, PIXEL_IMAGE]} accessible={false} /> : null}
        </Pressable>
      </View> : null}
      {!museumOpen && loading ? <Text accessibilityLiveRegion="polite" variant="caption" style={styles.readStatus}>{t("phone.loading")}</Text> : null}
      {!museumOpen && (failed || partial) ? <View style={styles.errorRow}><Text variant="caption" style={styles.flexText}>{t("phone.partialError")}</Text><PhoneAction label={t("phone.retry")} glyph="refresh" onPress={() => setRefresh((value) => value + 1)} /></View> : null}
      <View style={styles.pageBody} {...(museumOpen ? {} : pagePan.panHandlers)}>
      {museumOpen ? <MuseumPhoneContent width={frame.screen.width} onBack={backInside} backLabel={t("phone.appsBack")} /> : <FlatList
        key={`${tab}-${phoneApp}-${insideRoute ?? "home"}-${exitPrompt ? "exit" : "open"}-${selectedNoticeId ? "detail" : "list"}`}
        testID="dashboard-phone-scroll"
        onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        data={phoneRows}
        showsVerticalScrollIndicator={false}
        keyExtractor={(item) => typeof item === "number" ? `${tab}-screen` : item.id}
        ListHeaderComponent={noticeListOpen ? <View style={styles.stack}>
          <Text variant="heading">{t("phone.apps.notifications")}</Text>
          {!noticeCenter.hydrated ? <Text variant="caption" style={styles.muted}>{t("phone.noticeLoading")}</Text> : null}
        </View> : null}
        ListEmptyComponent={noticeListOpen && noticeCenter.hydrated ? <Text variant="caption" style={styles.muted}>{t("phone.noticeEmpty")}</Text> : null}
        renderItem={({ item }) => noticeListOpen ? noticeRow(item as ProductNotice) : (wikiListOpen || wikiDetailOpen) && typeof item !== "number" ? wikiRow(item as WikiPageRow) : exitPrompt ? <View style={styles.stack}>
          <Text variant="heading">{t("phone.internal.exitTitle")}</Text>
          <Text variant="caption" style={styles.muted}>{t("phone.internal.exitHint")}</Text>
          <PhoneAction label={t("phone.returnToStars")} glyph="arrow_forward" onPress={closePhone} />
          <PhoneAction label={t("phone.internal.cancel")} glyph="arrow_back" onPress={() => setExitPrompt(false)} />
        </View> : insideRoute ? internalPage(insideRoute) : tab === "dashboard" ? dashboard() : tools()}
        contentContainerStyle={styles.content}
      />}
      </View>
      {!museumOpen ? <View style={styles.phoneDock} accessibilityLabel={t("phone.navLabel")}>
        {PHONE_NAV.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={t(`phone.nav.${item}`)} onPress={() => {
          if (item === "home") { showPage(0); return; }
          go(item === "note" ? "/records" : item === "add" ? "/capture" : item === "search" ? "/wiki" : "/profile");
        }} style={[styles.navButton, item === "add" && styles.navAdd]}>
          <Image source={PHONE_NAV_ICONS[item]} contentFit="contain" style={[item === "add" ? styles.navAddIcon : styles.navIcon, PIXEL_IMAGE]} accessible={false} />
          {item !== "add" ? <Text variant="caption" style={[styles.navText, item === "home" && tab === "dashboard" && styles.navActive]}>{t(`phone.nav.${item}`)}</Text> : null}
        </Pressable>)}
      </View> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(internalActive || tab === "tools" ? "phone.nav.home" : "phone.internal.closePhone")}
        onPress={() => { if (internalActive || tab === "tools") showPage(0); else setExitPrompt(true); }}
        style={[styles.homeButton, frame.homeButton]}
      />
      </> : null}
    </Animated.View>
    <CrisisRouter visible={crisisVisible} hotline={i18n.language.toLowerCase().startsWith("ko") ? isMinor ? "KR_1388" : "KR_109" : "GLOBAL_988"} onClose={() => setCrisisVisible(false)} />
  </DeepSpaceScreen>;
}

const styles = StyleSheet.create({
  phoneText: { color: m3.color.onSurface },
  phoneBackdrop: { ...StyleSheet.absoluteFill, zIndex: 0 },
  // RN Web keeps a repeated 4px tile at its intrinsic size without explicit bounds.
  phoneScrimImage: { width: "100%", height: "100%" },
  phone: { flex: 1, width: "100%", maxWidth: 460, alignSelf: "center", overflow: "hidden", zIndex: 1 },
  artwork: { position: "absolute" },
  display: { position: "absolute", overflow: "hidden" },
  homeButton: { position: "absolute" },
  statusBar: { height: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, paddingHorizontal: 10 },
  brandGroup: { flexDirection: "row", alignItems: "center", gap: 3 },
  brandText: { color: m3.color.onSurface, fontFamily: "Galmuri11Bold", fontSize: 13 },
  dateGroup: { flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1 },
  dateText: { color: m3.color.onSurfaceVariant, fontFamily: "Galmuri11", fontSize: 10, flexShrink: 1 },
  headerIcon: { width: 21, height: 21 },
  heroBanner: { height: 83, marginHorizontal: 8, marginBottom: 7, borderWidth: 1, borderColor: m3.color.outline, overflow: "hidden", backgroundColor: m3.color.surfaceContainer },
  heroCopy: { flex: 1, justifyContent: "center", alignItems: "flex-end", paddingRight: 11, paddingLeft: 92, gap: 3 },
  heroTitle: { color: m3.color.onSurface, fontFamily: "Galmuri11Bold", fontSize: 13 },
  heroSubtitle: { color: m3.color.onSurface, fontFamily: "Galmuri11", fontSize: 10 },
  tabs: { flexDirection: "row", gap: 5, paddingHorizontal: 9 },
  tab: { flex: 1, minWidth: 0 },
  tabContent: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 4 },
  tabIcon: { width: 17, height: 17 },
  tabLabel: { color: m3.color.onSurface, fontFamily: "Galmuri11", fontSize: 11 },
  pageControls: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 9 },
  pageArrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  pageIcon: { width: 14, height: 14 },
  pageDots: { flexDirection: "row", alignItems: "center", gap: 1 },
  pageDotButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  pageDot: { width: 11, height: 11 },
  pageBody: { flex: 1, minHeight: 0 },
  content: { paddingHorizontal: 9, paddingTop: 5, paddingBottom: 12, gap: 10 },
  phoneDock: { height: 53, marginHorizontal: 8, marginBottom: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-around", borderWidth: 1, borderColor: m3.color.outline, backgroundColor: m3.color.surfaceContainerLowest },
  navButton: { minWidth: 44, minHeight: 48, flex: 1, alignItems: "center", justifyContent: "center", gap: 0 },
  navIcon: { width: 27, height: 27 },
  navAdd: { flex: 1.15 },
  navAddIcon: { width: 49, height: 49 },
  navText: { color: m3.color.onSurfaceVariant, fontFamily: "Galmuri11", fontSize: 10, lineHeight: 14 },
  navActive: { color: m3.color.primary },
  stack: { gap: 12 },
  launcherStack: { gap: 5 },
  hero: { padding: 16, gap: 12 },
  lead: { padding: 16, gap: 10 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "46%", flexGrow: 1, minWidth: 130 },
  metricContent: { padding: 10, gap: 6, minHeight: 102 },
  metricValue: { color: m3.color.primary, lineHeight: 24, paddingBottom: 2 },
  chart: { flexDirection: "row", gap: 4, alignItems: "flex-end" },
  chartDay: { flex: 1, minWidth: 0, alignItems: "center", gap: 4 },
  chartTrack: { width: "100%", height: 44, justifyContent: "flex-end", backgroundColor: m3.color.surfaceContainer },
  chartBar: { width: "100%", backgroundColor: m3.color.primary },
  smallAction: { paddingHorizontal: 10, minHeight: 44, justifyContent: "center" },
  highlight: { padding: 14, gap: 6, minHeight: 88 },
  highlightValue: { lineHeight: 24, paddingBottom: 2 },
  week: { flexDirection: "row", gap: 3 },
  weekDay: { flex: 1, minWidth: 0 },
  weekDayContent: { minHeight: 64, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 1 },
  accent: { color: m3.color.primary },
  muted: { color: m3.color.onSurfaceVariant, lineHeight: 20, paddingBottom: 2 },
  routine: { padding: 12, gap: 8 },
  sectionHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  actionText: { flexShrink: 1, lineHeight: 20, paddingBottom: 2 },
  evidence: { padding: 14, gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  area: { width: "30%", flexGrow: 1, minWidth: 80 },
  areaContent: { minHeight: 72, alignItems: "center", justifyContent: "center", gap: 6 },
  launcherHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 28, gap: 4 },
  launcherTitle: { fontSize: 14, flexShrink: 1 },
  launcherHint: { color: m3.color.onSurfaceVariant, fontSize: 9, flexShrink: 1, textAlign: "right", maxWidth: 91 },
  appGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 3 },
  appTile: { position: "relative", width: "24%", height: 67, alignItems: "center", justifyContent: "center", paddingTop: 3 },
  tileArt: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, width: "100%", height: "100%" },
  appIcon: { width: 36, height: 36 },
  appLabel: { color: m3.color.onSurface, fontFamily: "Galmuri11", fontSize: 9, lineHeight: 11, textAlign: "center", maxWidth: "95%", minHeight: 20 },
  appLabelDisabled: { color: m3.color.onSurfaceVariant },
  badge: { position: "absolute", top: 2, right: 2, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", backgroundColor: m3.color.error },
  badgeText: { color: m3.color.onError, fontFamily: "Galmuri11Bold", fontSize: 9 },
  noticeRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, padding: 10 },
  noticeCopy: { flex: 1, gap: 3 },
  noticeDetail: { padding: 12, gap: 10 },
  centered: { textAlign: "center", lineHeight: 20, paddingBottom: 2 },
  flexText: { flex: 1, flexShrink: 1 },
  readStatus: { paddingHorizontal: 12, paddingVertical: 8, color: m3.color.onSurfaceVariant },
  errorRow: { flexDirection: "row", gap: 8, padding: 12, alignItems: "center" },
  dashboardScope: { color: m3.color.onSurfaceVariant, fontSize: 12, lineHeight: 18, paddingBottom: 2 },
  searchInput: { minHeight: 44, borderWidth: 1, borderColor: m3.color.outline, backgroundColor: m3.color.surfaceContainer, paddingHorizontal: 10, fontSize: 13 },
  noteInput: { minHeight: 112, borderWidth: 1, borderColor: m3.color.outline, backgroundColor: m3.color.surfaceContainer, padding: 10, fontSize: 13, textAlignVertical: "top" },
  focusClock: { textAlign: "center", color: m3.color.primary, fontVariant: ["tabular-nums"] },
});
