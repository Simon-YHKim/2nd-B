import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, BackHandler, FlatList, PanResponder, Platform, Pressable, StyleSheet, TextInput, View, type ImageStyle } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { PixelRoundRect } from "@/components/pixel/PixelRoundRect";
import { Text as BaseText, type TextProps } from "@/components/ui/Text";
import { captureAccountOwnerLease } from "@/lib/auth/account-epoch";
import { loadDashboard } from "@/lib/dashboard/load";
import { LIFE_AREAS, type DashboardData } from "@/lib/dashboard/model";
import { buildBoard } from "@/lib/dashboard/board/build";
import { DEFAULT_REFRESH_SETTINGS, getRefreshSettings, nextRefreshAt, shouldRefreshAfterResume } from "@/lib/dashboard/refresh-cadence";
import { fitPhoneArtwork } from "@/lib/dashboard/phone-frame";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { PHONE_APP_ICONS, type PhoneAppId } from "./phone-app-assets";
import { canBeginPhoneDismiss, shouldCompletePhoneDismiss } from "@/lib/dashboard/phone-dismiss";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { phoneIos } from "@/lib/theme/phone-ios";
import { useNoticeCenter } from "@/app/notices";
import { renderableBlocks } from "@/lib/notices/markdown";
import { createRecord } from "@/lib/records/create";
import { filterPhoneWikiPages } from "@/lib/wiki/phone-search";
import { getBacklinks, getWikiPageById, listWikiPages } from "@/lib/wiki/queries";
import type { WikiPageRow } from "@/lib/wiki/types";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import { OpsPhoneContent, type OpsPhoneScreen } from "@/screens/deepspace/ops/PhoneOpsContent";
import { MuseumPhoneContent } from "@/screens/deepspace/museum/MuseumTimelineScreen";
import { PhoneEmbedProvider, splitPhoneRoute, type PhoneEmbedNav } from "@/lib/nav/phone-embed";
import { resolvePhoneScreen } from "./phone-screens";
import { BoardDock, BoardPageView, type BoardEvents } from "./board/BoardParts";
import { DailySummary } from "./board/DailySummary";
import { BoardShelf } from "./board/BoardShelf";
import { TranscribeSkeleton } from "./board/TranscribeSkeleton";
import { IosButton, IosGroup, IosLargeTitle, IosLead, IosRow } from "./board/IosParts";
import { healthBlankValues } from "@/lib/dashboard/board/summary-flow";
import type { ProductNotice } from "@/lib/notices/types";

type Tab = "dashboard" | "tools";
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
  { id: "avatarPalette", route: "/avatar-palette" },
];
const APP_ORDER: PhoneAppId[] = [
  "notifications", "assistant", "focus", "reminders",
  "money", "growth", "meals", "museum",
  // Simon 2026-10-07: the More page folded into the grid - the palette takes the More tile's place.
  "community", "relationships", "settings", "avatarPalette",
];
const OPS_PHONE_ROUTES: Record<string, OpsPhoneScreen> = {
  "/ops": "ops",
  "/reading": "reading",
  "/reminders": "reminders",
  "/ledger": "ledger",
  "/milestones": "milestones",
  "/meals": "meals",
  "/side-project": "side-project",
};
/** A query route whose target the phone draws as its own page: a wiki citation
 *  (/wiki?focusPageId=) opens the phone's page view. */
function phonePage(route: string): string {
  const { path, params } = splitPhoneRoute(route);
  if (path === "/wiki" && params.focusPageId) return `/wiki/page/${encodeURIComponent(params.focusPageId)}`;
  // /persona (and the dormant /mbti that points at it) is a redirect to Polaris;
  // its <Redirect> would move the app, not the phone.
  if (path === "/persona" || path === "/mbti") return "/core-brain";
  return route;
}
/** A hosted screen replacing itself with one of these leaves the phone (sign-out). */
const AUTH_EXIT_PATHS = new Set(["/sign-in", "/sign-up", "/onboarding"]);
/** 1쪽 · 2쪽 · 앱. 더보기 쪽은 앱 바둑판에 합쳤다(Simon 2026-10-07). */
const PAGES = [0, 1, 2] as const;
const LAST_PAGE = PAGES.length - 1;
/** The phone's home button and a hosted screen's 'home' open the apps page (Simon 2026-10-07). */
const APPS_PAGE = 2;
const PIXEL_IMAGE = Platform.OS === "web" ? { imageRendering: "pixelated" } as ImageStyle : undefined;

// Pixel iPhone (Simon 2026-10-07): the phone's own screens use iOS light defaults drawn with stepped corners and
// Galmuri. Text inside the phone does not inherit the app theme's colour.
function Text({ style, ...rest }: TextProps) {
  return <BaseText {...rest} style={[styles.phoneText, style]} />;
}

/** An action in the phone's own screens: an iOS button. */
function PhoneAction({ label, onPress, glyph, disabled = false }: {
  label: string; onPress: () => void; glyph?: AnyGlyphName; disabled?: boolean;
}) {
  return <IosButton label={label} glyph={glyph} disabled={disabled} onPress={onPress} />;
}

/** The iOS nav bar's back: a blue chevron and label, top left. */
function NavBack({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.navBack}>
    <PixelGlyph name="chevron_left" size={16} color={phoneIos.blue} />
    <Text variant="body" style={styles.navBackText}>{label}</Text>
  </Pressable>;
}

/** iOS status bar (iPhone SE: carrier left, time centre, battery right), drawn in rects. */
function StatusBar({ ink, time }: { ink: string; time: string }) {
  return <View style={styles.statusBar} accessible={false}>
    <View style={styles.statusSide}>
      <View style={styles.signal}>{[4, 6, 8, 10].map((height) => <View key={height} style={[styles.signalBar, { height, backgroundColor: ink }]} />)}</View>
      <Text variant="caption" style={[styles.carrier, { color: ink }]}>PolaScope</Text>
    </View>
    <Text variant="caption" style={[styles.statusTime, { color: ink }]}>{time}</Text>
    <View style={[styles.statusSide, styles.statusRight]}>
      <View style={[styles.battery, { borderColor: ink }]}><View style={[styles.batteryLevel, { backgroundColor: ink }]} /></View>
      <View style={[styles.batteryTip, { backgroundColor: ink }]} />
    </View>
  </View>;
}

/** Home wallpaper: colour bands (pixel banding, no gradient). */
function Wallpaper() {
  return <View pointerEvents="none" style={styles.wallpaper}>
    {phoneIos.wallpaper.map((color) => <View key={color} style={[styles.band, { backgroundColor: color }]} />)}
  </View>;
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
  // 하루 관리판 두 쪽(PS-DASH-001 v2.2): 1쪽 = 오늘 처리할 것, 2쪽 = 상태(Q-261007-31).
  const [boardPage, setBoardPage] = useState<1 | 2>(1);
  const [phoneApp, setPhoneApp] = useState<"notifications" | null>(app === "notifications" ? "notifications" : null);
  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null);
  const [screenStack, setScreenStack] = useState<string[]>([]);
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
  // A tag carried by /capture?tag= (Discover), saved with the note and shown on the page.
  const [captureTag, setCaptureTag] = useState<string | null>(null);
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
  const [refreshSettings, setRefreshSettingsState] = useState(DEFAULT_REFRESH_SETTINGS);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  // The status bar shows the time, as an iPhone does.
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const frame = fitPhoneArtwork(frameSize.width, frameSize.height);
  const reducedMotion = useReducedMotionPref();
  const dismissY = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const viewHeight = useRef(0);
  const scrollBottomGap = useRef(Number.POSITIVE_INFINITY);
  const dismissing = useRef(false);
  const mounted = useRef(true);
  const captureBusyRef = useRef(false);
  const scheduledReadPending = useRef(false);
  const insideRoute = screenStack[screenStack.length - 1] ?? null;
  const museumOpen = insideRoute === "/museum";
  const phoneScreen = insideRoute ? resolvePhoneScreen(insideRoute) : null;
  // Museum and the hosted full screens (phone-screens.tsx) own the display:
  // their own scroll, gestures and header Back. The phone's list, pan
  // gestures, status rows and dock step aside for them.
  const ownsDisplay = museumOpen || phoneScreen !== null;
  // Those screens and the Ops screens draw their own header Back wired to
  // backInside, so the phone's Back row would be a second one. Back lives in
  // one place.
  // S-01 하루 요약은 자기 [닫기]를 가진다.
  const contentOwnsBack = ownsDisplay || insideRoute === "/board/summary" || (insideRoute !== null && OPS_PHONE_ROUTES[insideRoute] !== undefined);
  const wikiDetailId = insideRoute?.startsWith("/wiki/page/")
    ? decodeURIComponent(insideRoute.slice("/wiki/page/".length)) : null;
  const go = useCallback((target: string) => {
    // Phone-originated navigation stays in the supplied phone display. The
    // independent routes keep their own existing entry points unchanged.
    if (typeof document !== "undefined") (document.activeElement as HTMLElement | null)?.blur?.();
    const route = phonePage(target);
    const { path, params } = splitPhoneRoute(route);
    scrollY.current = 0;
    setRecordQuery("");
    if (path === "/wiki") setWikiQuery("");
    // "Save this" from chat (/capture?text=) arrives with the words filled in.
    if (path === "/capture" && params.text) setDraft(params.text);
    if (path === "/capture") setCaptureTag(params.tag ?? null);
    setScreenStack((current) => [...current, route]);
  }, []);
  // Pages (Simon 2026-10-07, PS-DASH-001 v2.2): the board's two pages come first, then the apps.
  const pageIndex = tab === "dashboard" ? boardPage - 1 : APPS_PAGE;
  const showPage = useCallback((index: number) => {
    if (index < 0 || index > LAST_PAGE) return;
    scrollY.current = 0;
    setSelectedNoticeId(null);
    setScreenStack([]);
    setTab(index <= 1 ? "dashboard" : "tools");
    setBoardPage(index === 1 ? 2 : 1);
    setPhoneApp(null);
  }, []);
  // Back steps out one level at a time and stops at the first page. It never leaves the phone:
  // leaving is the up or down swipe only (Simon 2026-10-07), so the old "close the phone?" prompt is gone.
  const backInside = useCallback(() => {
    scrollY.current = 0;
    if (selectedNoticeId) { setSelectedNoticeId(null); return; }
    if (screenStack.length) { setScreenStack((current) => current.slice(0, -1)); return; }
    if (phoneApp) { setPhoneApp(null); return; }
    if (tab === "tools") { setTab("dashboard"); return; }
    if (boardPage === 2) setBoardPage(1);
  }, [selectedNoticeId, screenStack.length, phoneApp, tab, boardPage]);
  // Android Back handlers claimed by hosted screens (useHardwareBack), newest
  // last. The phone's one listener asks them before stepping back itself.
  const claimedBack = useRef<Array<() => boolean>>([]);
  const claimBack = useCallback((handler: () => boolean) => {
    claimedBack.current = [...claimedBack.current, handler];
    return () => {
      const at = claimedBack.current.lastIndexOf(handler);
      if (at >= 0) claimedBack.current = [...claimedBack.current.slice(0, at), ...claimedBack.current.slice(at + 1)];
    };
  }, []);
  // Navigation for hosted screens. Everything opened from the phone stays in
  // the phone (Simon 2026-09-30); a route the phone cannot draw yet shows its
  // "not yet connected" page. A screen's "home" opens the phone's apps page -
  // leaving the phone is the swipe only (Simon 2026-10-07) - and a replace to the
  // auth screens (sign-out) leaves it.
  const embedNav = useMemo<PhoneEmbedNav>(() => ({
    push: (route) => {
      const { path } = splitPhoneRoute(route);
      if (path === "/") showPage(APPS_PAGE);
      else if (AUTH_EXIT_PATHS.has(path)) router.replace(route as Href);
      else go(route);
    },
    replace: (route) => {
      const { path } = splitPhoneRoute(route);
      if (path === "/") { showPage(APPS_PAGE); return; }
      if (AUTH_EXIT_PATHS.has(path)) { router.replace(route as Href); return; }
      scrollY.current = 0;
      setScreenStack((current) => [...current.slice(0, -1), route]);
    },
    back: backInside,
    params: splitPhoneRoute(insideRoute ?? "").params,
    displayWidth: frame?.screen.width,
    claimBack,
  }), [backInside, claimBack, frame?.screen.width, go, insideRoute, showPage]);
  useFocusEffect(useCallback(() => {
    if (museumOpen) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      for (let i = claimedBack.current.length - 1; i >= 0; i -= 1) if (claimedBack.current[i]()) return true;
      backInside();
      return true;
    });
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
      !dismissing.current && canBeginPhoneDismiss(gesture.dy, gesture.dx, scrollY.current, scrollBottomGap.current),
    onMoveShouldSetPanResponder: (_event, gesture) =>
      !dismissing.current && canBeginPhoneDismiss(gesture.dy, gesture.dx, scrollY.current, scrollBottomGap.current),
    onPanResponderGrant: () => { dismissY.stopAnimation(); },
    onPanResponderMove: (_event, gesture) => {
      dismissY.setValue(Math.min(frameSize.height, Math.max(-frameSize.height, gesture.dy)));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (!shouldCompletePhoneDismiss(gesture.dy, gesture.vy)) { settlePhone(); return; }
      if (insideRoute || phoneApp) { backInside(); settlePhone(); return; }
      dismissing.current = true;
      // The phone leaves the way it was pushed: down, or up.
      Animated.timing(dismissY, {
        toValue: (gesture.dy < 0 ? -1 : 1) * (frameSize.height || 700),
        duration: reducedMotion ? 0 : 240,
        easing: pixelStepsFor(240),
        useNativeDriver: Platform.OS !== "web",
      }).start(({ finished }) => { if (finished && mounted.current) closePhone(); });
    },
    onPanResponderTerminate: settlePhone,
  }), [backInside, closePhone, dismissY, frameSize.height, insideRoute, phoneApp, reducedMotion, settlePhone]);
  const pagePan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      !insideRoute && Math.abs(gesture.dx) > 30 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) > 55) showPage(pageIndex + (gesture.dx < 0 ? 1 : -1));
    },
  }), [insideRoute, pageIndex, showPage]);
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
  const interviews = data?.interviews.ok ? data.interviews.value.filter((item) => item.body?.trim()) : [];
  const board = useMemo(() => buildBoard(data, new Date(), isMinor), [data, isMinor]);
  // The buttons change only the screen until the W0 contract stores them (발주 2).
  const boardEvents = useMemo<BoardEvents>(() => ({
    go,
    openSummary: () => go("/board/summary"),
    suggestion: (_id, choice) => { if (choice === "add") go("/reminders"); },
    queue: () => undefined,
    spend: (_id, choice) => { if (choice === "add") go("/ledger"); },
    custom: () => undefined,
  }), [go]);
  // 순서 · 숨기기 · 다시 켜기는 W0 가 저장할 곳을 줄 때 이어진다(지금 계약은 canReorder false).
  const shelfEvents = useMemo(() => ({ go, show: () => undefined, hide: () => undefined, move: () => undefined }), [go]);
  const partial = data && Object.values(data).some((value) => value && typeof value === "object" && "ok" in value && !value.ok);

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
        tags: captureTag ? [captureTag] : undefined,
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

  function internalPage(stackRoute: string) {
    // Query routes draw the same page; /records?tags= filters it, and
    // /record/<id>?origin= opens the record.
    const { path: route, params: routeParams } = splitPhoneRoute(stackRoute);
    const tagFilter = routeParams.tags ? routeParams.tags.split(",") : null;
    const opsScreen = OPS_PHONE_ROUTES[route];
    if (opsScreen) return <OpsPhoneContent screen={opsScreen} onBack={backInside} onNavigate={go} />;
    // S-01 하루 요약(PS-DASH-001 v2.2). 건강 빈칸은 이 기기의 P-06 값으로 채운다(흐름 2).
    // S-03 위젯 관리 · S-02 녹음 전사 골격(PS-DASH-001 v2.2). 판단은 계약(board.shelf)이 한다.
    if (route === "/board/widgets") return <View style={styles.stack}>
      <IosLargeTitle>{t("phone.board.shelf.title")}</IosLargeTitle>
      <BoardShelf board={board} events={shelfEvents} />
    </View>;
    if (route === "/board/transcribe") return <TranscribeSkeleton adult={isMinor === false} />;
    if (route === "/board/summary") return <DailySummary summary={board.summary} muted={false} reducedMotion={reducedMotion} go={go} onClose={backInside}
      healthValues={healthBlankValues(board, (metric) => metric.unit === "count" ? metric.value.toLocaleString(i18n.language) : t("phone.board.health.minutes", { value: metric.value.toLocaleString(i18n.language) }))} />;
    const records = data?.records.ok ? data.records.value : [];
    const recordFailed = !!data && !data.records.ok;
    const area = route.startsWith("/star/") ? route.slice(6) : null;
    const title = route === "/focus" ? t("phone.apps.focus") :
      route === "/museum" ? t("phone.apps.museum") :
      route === "/profile" ? t("phone.nav.profile") :
      route === "/capture" ? t("phone.nav.add") :
      route === "/wiki" || route.startsWith("/wiki/page/") ? t("phone.moreApps.wiki") :
      route === "/search" ? t("phone.nav.search") :
      route === "/records" ? t("phone.nav.note") :
      area && LIFE_AREAS.some((item) => item === area) ? t(`phone.areas.${area}`) :
      route.startsWith("/record/") ? t("phone.moreApps.records") : t("phone.moreTitle");
    const searchList = route === "/records" || route === "/search";
    const filtered = records.filter((record) => (!area || record.tags?.includes(`domain:${area}`)) &&
      (!tagFilter || tagFilter.some((tag) => record.tags?.includes(tag))) &&
      (!recordQuery || record.body?.toLocaleLowerCase().includes(recordQuery.toLocaleLowerCase())));
    const selected = route.startsWith("/record/") ? [...records, ...interviews].find((record) => record.id === decodeURIComponent(route.slice(8))) : null;
    return <View style={styles.stack}>
      <IosLargeTitle>{title}</IosLargeTitle>
      {route === "/capture" ? <PixelRoundRect fill={phoneIos.cell} style={styles.card}>
        <Text variant="caption" style={styles.muted}>{t("phone.internal.captureScope")}</Text>
        {captureTag ? <Text variant="caption" style={styles.accent}>{`#${captureTag}`}</Text> : null}
        <TextInput accessibilityLabel={t("phone.internal.noteInput")} multiline value={draft} onChangeText={setDraft} placeholder={t("phone.internal.noteInput")} placeholderTextColor={phoneIos.label2} style={[styles.noteInput, styles.phoneText]} />
        <View style={styles.actions}>
          <PhoneAction label={captureBusy ? t("phone.saving") : t("phone.internal.saveNote")} glyph="check" disabled={!draft.trim() || captureBusy} onPress={() => { void savePhoneNote(); }} />
        </View>
        {captureState === "saved" ? <Text accessibilityRole="alert" variant="caption" style={styles.accent}>{t("phone.internal.saved")}</Text> : null}
        {captureState === "failed" ? <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.saveError")}</Text> : null}
      </PixelRoundRect> : null}
      {route === "/focus" ? <PixelRoundRect fill={phoneIos.cell} style={styles.card}>
        <Text variant="heading" style={styles.focusClock}>{`${String(Math.floor(focusSeconds / 60)).padStart(2, "0")}:${String(focusSeconds % 60).padStart(2, "0")}`}</Text>
        <Text variant="caption" style={[styles.muted, styles.centered]}>{t("phone.internal.focusLocal")}</Text>
        <View style={[styles.actions, styles.actionsCentered]}>
          <PhoneAction label={t(focusRunning ? "phone.internal.pause" : "phone.internal.start")} glyph="timer" onPress={() => setFocusRunning((value) => !value)} />
          <PhoneAction label={t("phone.internal.reset")} glyph="refresh" onPress={() => { setFocusRunning(false); setFocusSeconds(25 * 60); }} />
        </View>
      </PixelRoundRect> : null}
      {route === "/wiki" ? <View style={styles.stack}>
        <View style={styles.actions}><PhoneAction label={t("phone.internal.wikiGraph")} glyph="bubble_chart" onPress={() => go("/wiki/graph")} /></View>
        <PixelRoundRect corner="small" fill={phoneIos.fill} style={styles.searchField}>
          <TextInput accessibilityLabel={t("wiki:searchPieces")} value={wikiQuery} onChangeText={setWikiQuery} placeholder={t("wiki:searchPieces")} placeholderTextColor={phoneIos.label2} style={[styles.searchInput, styles.phoneText]} />
        </PixelRoundRect>
        {wikiLoading ? <Text variant="caption" style={styles.muted}>{t("wiki:loading")}</Text> : null}
        {wikiFailed ? <View style={styles.stack}>
          <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text>
          <View style={styles.actions}><PhoneAction label={t("phone.retry")} glyph="refresh" onPress={() => setWikiRefresh((value) => value + 1)} /></View>
        </View> : null}
        {!wikiLoading && !wikiFailed && wikiOwnerId === ownerId && wikiPages.length === 0 ? <Text variant="caption" style={styles.muted}>{t("wiki:empty")}</Text> : null}
        {!wikiLoading && !wikiFailed && wikiOwnerId === ownerId && wikiPages.length > 0 && filteredWikiPages.length === 0 ? <Text variant="caption" style={styles.muted}>{t("wiki:noMatch", { query: wikiQuery.trim() })}</Text> : null}
      </View> : null}
      {route.startsWith("/wiki/page/") ? <View style={styles.stack}>
        {wikiDetailLoading ? <Text variant="caption" style={styles.muted}>{t("wiki:loading")}</Text> : null}
        {wikiDetailFailed ? <View style={styles.stack}>
          <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text>
          <View style={styles.actions}><PhoneAction label={t("phone.retry")} glyph="refresh" onPress={() => setWikiRefresh((value) => value + 1)} /></View>
        </View> : null}
        {!wikiDetailLoading && !wikiDetailFailed && wikiPage?.user_id === ownerId && wikiPage.id === wikiDetailId ? <PixelRoundRect fill={phoneIos.cell} style={styles.card}>
          <Text variant="heading" style={styles.cardTitle}>{wikiPage.title || wikiPage.slug}</Text>
          <Text variant="caption" style={styles.muted}>{t("wiki:savedAs", { name: wikiPage.slug })}</Text>
          <Text variant="body">{wikiPage.body_md || t("wiki:emptyBody")}</Text>
          <Text variant="caption" style={styles.muted}>{t("wiki:backlinks")} ({wikiBacklinks.length})</Text>
          {wikiBacklinksFailed ? <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : null}
        </PixelRoundRect> : null}
        {!wikiDetailLoading && !wikiDetailFailed && wikiPage === null ? <Text variant="caption" style={styles.muted}>{t("wiki:empty")}</Text> : null}
      </View> : null}
      {searchList ? <PixelRoundRect corner="small" fill={phoneIos.fill} style={styles.searchField}>
        <TextInput accessibilityLabel={t("phone.internal.searchRecords")} value={recordQuery} onChangeText={setRecordQuery} placeholder={t("phone.internal.searchRecords")} placeholderTextColor={phoneIos.label2} style={[styles.searchInput, styles.phoneText]} />
      </PixelRoundRect> : null}
      {searchList || area ? <View style={styles.stack}>
        <Text variant="caption" style={styles.muted}>{t(area ? "phone.areaScope" : "phone.metricsSummary.records.scope")}</Text>
        {failed ? <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : !data || loading ? <Text variant="caption" style={styles.muted}>{t("phone.loading")}</Text> : recordFailed ?
          <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : filtered.length ? <IosGroup>{filtered.slice(0, 20).map((record) => <IosRow key={record.id}
            title={record.body?.trim().slice(0, 140) || t("phone.internal.untitledRecord")} subtitle={date(record.created_at)}
            accessibilityLabel={record.body?.trim().slice(0, 80) || t("phone.internal.untitledRecord")}
            onPress={() => go(`/record/${encodeURIComponent(record.id)}`)} />)}</IosGroup> : <Text variant="caption" style={styles.muted}>{t("phone.operational.sourceStates.empty")}</Text>}
      </View> : null}
      {route.startsWith("/record/") ? <View style={styles.stack}>
        {failed ? <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : !data || loading ? <Text variant="caption" style={styles.muted}>{t("phone.loading")}</Text> : recordFailed && !selected ?
          <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : selected ? <PixelRoundRect fill={phoneIos.cell} style={styles.card}>
            <Text variant="body">{selected.body?.trim() || t("phone.internal.untitledRecord")}</Text>
            <Text variant="caption" style={styles.muted}>{date(selected.created_at)}</Text>
          </PixelRoundRect> : <Text variant="caption" style={styles.muted}>{t("phone.operational.sourceStates.empty")}</Text>}
      </View> : null}
      {route === "/profile" ? <Text variant="caption" style={styles.muted}>{failed ? t("phone.readError") : !data || loading ? t("phone.loading") : data.records.ok ? t("phone.internal.profileSummary", { count: data.records.value.length }) : t("phone.readError")}</Text> : null}
      {!["/capture", "/focus", "/ops", "/reminders", "/records", "/wiki", "/search", "/profile"].includes(route) && !route.startsWith("/wiki/page/") && !route.startsWith("/star/") && !route.startsWith("/record/") && !area ?
        <Text variant="caption" style={styles.muted}>{t("phone.internal.unavailable")}</Text> : null}
    </View>;
  }

  function dashboard() {
    if (failed) return <PixelRoundRect fill={phoneIos.cell} style={styles.card}>
      <Text variant="body" style={styles.cardTitle}>{t("phone.operational.title")}</Text>
      <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.readError")}</Text>
      <View style={styles.actions}><PhoneAction label={t("phone.retry")} glyph="refresh" onPress={() => setRefresh((value) => value + 1)} /></View>
    </PixelRoundRect>;
    // Simon 2026-10-07 (발주 2 · Q-261007-38): the old widgets are off the dashboard - priority card,
    // my words, today, at a glance, 7-day records, 7-day outlook, life areas, latest activity. The
    // board draws only what the contract says (visible · order · basis).
    return <BoardPageView board={board} page={boardPage} events={boardEvents} />;
  }

  function tools() {
    if (phoneApp === "notifications") {
      const selected = noticeCenter.notices.find((item) => item.id === selectedNoticeId);
      const ko = i18n.language.toLowerCase().startsWith("ko");
      return <View style={styles.stack}>
        <IosLargeTitle>{t("phone.apps.notifications")}</IosLargeTitle>
        {selected ? <PixelRoundRect fill={phoneIos.cell} style={styles.card}>
            <Text variant="caption" style={styles.accent}>{ko ? selected.listMeta.ko : selected.listMeta.en}</Text>
            <Text variant="body" style={styles.cardTitle}>{ko ? selected.title.ko : selected.title.en}</Text>
            {renderableBlocks(selected.body, ko).map((block, index) => <Text key={`${selected.id}-${index}`} variant="caption" style={styles.body2}>
              {block.kind === "bullet" ? "• " : ""}{ko ? block.text.ko : block.text.en}
            </Text>)}
          </PixelRoundRect> : null}
      </View>;
    }
    // iOS home screen: no title or banner above the grid (Simon 2026-10-07, pixel iPhone).
    return <View style={styles.appGrid}>{APP_ORDER.map((id) => {
      const disabled = id === "community" && isMinor !== false;
      const open = () => {
        if (id === "notifications") { scrollY.current = 0; setPhoneApp("notifications"); return; }
        if (id === "settings") { go("/settings"); return; }
        const route = TOOLS.find((item) => item.id === id)?.route;
        if (route) go(route);
      };
      return <Pressable key={id} accessibilityRole="button" accessibilityLabel={t(`phone.apps.${id}`)} disabled={disabled} onPress={open} style={[styles.appTile, { height: appTileHeight }]}>
        <PixelRoundRect fill={disabled ? phoneIos.fill : phoneIos.cell} style={[styles.appFace, { width: appIconSize + 14, height: appIconSize + 14 }]}>
          <Image source={PHONE_APP_ICONS[id]} contentFit="contain" pointerEvents="none" style={[styles.appIcon, { width: appIconSize, height: appIconSize }, PIXEL_IMAGE]} />
        </PixelRoundRect>
        <Text variant="caption" numberOfLines={2} style={[styles.appLabel, disabled && styles.appLabelDisabled]}>{t(`phone.apps.${id}`)}</Text>
        {id === "notifications" && unreadCount > 0 ? <PixelRoundRect corner="pill" fill={phoneIos.red} style={styles.badge}><Text variant="caption" style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text></PixelRoundRect> : null}
      </Pressable>;
    })}</View>;
  }

  function noticeRow(item: ProductNotice) {
    const ko = i18n.language.toLowerCase().startsWith("ko");
    const unread = noticeCenter.isUnread(item.id);
    return <PixelRoundRect fill={phoneIos.cell}>
      <IosRow title={ko ? item.title.ko : item.title.en} accessibilityLabel={ko ? item.title.ko : item.title.en}
        subtitle={`${ko ? item.listMeta.ko : item.listMeta.en}${unread ? ` · ${t("phone.noticeUnread")}` : ""}`}
        lead={<IosLead color={unread ? phoneIos.red : phoneIos.label2} glyph="notifications" />}
        onPress={() => {
          setSelectedNoticeId(item.id);
          if (noticeCenter.isUnread(item.id)) void noticeCenter.markSeen(item.id);
        }} />
    </PixelRoundRect>;
  }

  const unreadCount = noticeCenter.notices.filter((item) => noticeCenter.isUnread(item.id)).length;
  const noticeListOpen = !insideRoute && tab === "tools" && phoneApp === "notifications" && !selectedNoticeId;
  const internalActive = !!insideRoute || phoneApp === "notifications";
  const wikiListOpen = insideRoute === "/wiki";
  const wikiDetailOpen = wikiDetailId !== null;
  const phoneRows: (ProductNotice | WikiPageRow | number)[] = noticeListOpen
    ? (noticeCenter.hydrated ? noticeCenter.notices : [])
    : wikiListOpen ? [0, ...(!wikiLoading && !wikiFailed ? filteredWikiPages : [])]
    : wikiDetailOpen ? [0, ...(!wikiDetailLoading && !wikiDetailFailed && wikiPage?.user_id === ownerId && wikiPage.id === wikiDetailId ? wikiBacklinks : [])]
    : [0];
  const wikiRow = (page: WikiPageRow) => <PixelRoundRect fill={phoneIos.cell}>
    <IosRow title={page.title || page.slug} subtitle={t("wiki:savedAs", { name: page.slug })}
      accessibilityLabel={t("wiki:openPage", { title: page.title || page.slug })} onPress={() => go(`/wiki/page/${encodeURIComponent(page.id)}`)} />
  </PixelRoundRect>;
  // The display shrinks with the bezel; the launcher must fit all three rows
  // on smaller phones, not hide the last labels.
  // With the banner gone (pixel iPhone), a tile is the stepped icon face plus a two-line label.
  const appTileHeight = Math.max(56, Math.min(80, Math.floor(((frame?.screen.height ?? 512) - 230) / 3)));
  const appIconSize = Math.max(24, Math.min(36, appTileHeight - 44));
  // Home pages sit on the wallpaper; the phone's own pages on iOS grouped grey; an app opened in the phone
  // (hosted · assistant · museum) keeps its own dark screen.
  const appScreenOpen = ownsDisplay || (insideRoute !== null && OPS_PHONE_ROUTES[insideRoute] !== undefined);
  const statusInk = internalActive && appScreenOpen ? phoneIos.onWallpaper : phoneIos.statusInk;
  const statusTime = clock.toLocaleTimeString(i18n.language, { hour: "numeric", minute: "2-digit" });
  return <DeepSpaceScreen active="ops" header="none" variant="fullbleed" showSharedSky transparentBackdrop={transparentBackdrop}>
    <View pointerEvents="none" style={styles.phoneBackdrop}><PixelScrim style={styles.phoneScrimImage} /></View>
    <Animated.View {...(ownsDisplay ? {} : phonePan.panHandlers)} testID="dashboard-phone" style={[styles.phone, { transform: [{ translateY: dismissY }] }]} onLayout={({ nativeEvent: { layout } }) => {
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
      <View style={[styles.display, frame.screen, internalActive && !appScreenOpen && styles.displayGrouped]}>
      {!internalActive ? <Wallpaper /> : null}
      <StatusBar ink={statusInk} time={statusTime} />
      {internalActive && !contentOwnsBack ? <NavBack label={selectedNoticeId ? t("phone.noticeListBack") : t("phone.internal.back")} onPress={backInside} /> : null}
      {!ownsDisplay && loading ? <Text accessibilityLiveRegion="polite" variant="caption" style={styles.readStatus}>{t("phone.loading")}</Text> : null}
      {!ownsDisplay && (failed || partial) ? <View style={styles.errorRow}><Text variant="caption" style={[styles.flexText, styles.muted]}>{t("phone.partialError")}</Text><PhoneAction label={t("phone.retry")} glyph="refresh" onPress={() => setRefresh((value) => value + 1)} /></View> : null}
      <View style={styles.pageBody} {...(ownsDisplay ? {} : pagePan.panHandlers)}>
      {museumOpen ? <MuseumPhoneContent width={frame.screen.width} onBack={backInside} backLabel={t("phone.appsBack")} /> : phoneScreen ? <View key={insideRoute} testID="phone-hosted-screen" style={styles.hostedScreen}>
        <PhoneEmbedProvider value={embedNav}>{phoneScreen}</PhoneEmbedProvider>
      </View> : <FlatList
        key={`${tab}-${phoneApp}-${insideRoute ?? "home"}-${selectedNoticeId ? "detail" : "list"}`}
        testID="dashboard-phone-scroll"
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          scrollY.current = contentOffset.y;
          contentHeight.current = contentSize.height;
          viewHeight.current = layoutMeasurement.height;
          scrollBottomGap.current = contentSize.height - layoutMeasurement.height - contentOffset.y;
        }}
        // How far the content can still scroll down, so a push up at the bottom can leave the phone.
        onContentSizeChange={(_width, height) => {
          contentHeight.current = height;
          scrollBottomGap.current = height - viewHeight.current - scrollY.current;
        }}
        onLayout={({ nativeEvent }) => {
          viewHeight.current = nativeEvent.layout.height;
          scrollBottomGap.current = contentHeight.current - nativeEvent.layout.height - scrollY.current;
        }}
        scrollEventThrottle={16}
        data={phoneRows}
        showsVerticalScrollIndicator={false}
        keyExtractor={(item) => typeof item === "number" ? `${tab}-screen` : item.id}
        ListHeaderComponent={noticeListOpen ? <View style={styles.stack}>
          <Text variant="heading">{t("phone.apps.notifications")}</Text>
          {!noticeCenter.hydrated ? <Text variant="caption" style={styles.muted}>{t("phone.noticeLoading")}</Text> : null}
        </View> : null}
        ListEmptyComponent={noticeListOpen && noticeCenter.hydrated ? <Text variant="caption" style={styles.muted}>{t("phone.noticeEmpty")}</Text> : null}
        renderItem={({ item }) => noticeListOpen ? noticeRow(item as ProductNotice) : (wikiListOpen || wikiDetailOpen) && typeof item !== "number" ? wikiRow(item as WikiPageRow) : insideRoute ? internalPage(insideRoute) : tab === "dashboard" ? dashboard() : tools()}
        contentContainerStyle={styles.content}
      />}
      </View>
      {/* Page dots above the dock, as on an iPhone home screen. */}
      {!internalActive ? <View style={styles.pageControls} accessibilityLabel={t("phone.pageControls")}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("phone.previousPage")} disabled={pageIndex === 0} onPress={() => showPage(pageIndex - 1)} style={styles.pageArrow}>
          {pageIndex > 0 ? <PixelGlyph name="chevron_left" size={14} color={phoneIos.dotOn} /> : null}
        </Pressable>
        <View style={styles.pageDots}>{PAGES.map((index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={t("phone.pageNumber", { number: index + 1 })} accessibilityState={{ selected: pageIndex === index }} onPress={() => showPage(index)} style={styles.pageDotButton}>
          <View style={[styles.pageDot, { backgroundColor: pageIndex === index ? phoneIos.dotOn : phoneIos.dotOff }]} />
        </Pressable>)}</View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("phone.nextPage")} disabled={pageIndex === LAST_PAGE} onPress={() => showPage(pageIndex + 1)} style={styles.pageArrow}>
          {pageIndex < LAST_PAGE ? <PixelGlyph name="chevron_right" size={14} color={phoneIos.dotOn} /> : null}
        </Pressable>
      </View> : null}
      {/* 독(PS-DASH-001 v2.2): 담기 · 대화 · 녹음 전사, 홈 쪽마다 고정(iOS 독). */}
      {!internalActive ? <BoardDock dock={board.dock} go={go} /> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        // Simon 2026-10-07: the home button always returns to the phone's apps page. It never closes the phone.
        accessibilityLabel={t("phone.nav.home")}
        onPress={() => showPage(APPS_PAGE)}
        style={[styles.homeButton, frame.homeButton]}
      />
      </> : null}
    </Animated.View>
    <CrisisRouter visible={crisisVisible} hotline={i18n.language.toLowerCase().startsWith("ko") ? isMinor ? "KR_1388" : "KR_109" : "GLOBAL_988"} onClose={() => setCrisisVisible(false)} />
  </DeepSpaceScreen>;
}

const styles = StyleSheet.create({
  phoneText: { color: phoneIos.label },
  phoneBackdrop: { ...StyleSheet.absoluteFill, zIndex: 0 },
  // RN Web keeps a repeated 4px tile at its intrinsic size without explicit bounds.
  phoneScrimImage: { width: "100%", height: "100%" },
  phone: { flex: 1, width: "100%", maxWidth: 460, alignSelf: "center", overflow: "hidden", zIndex: 1 },
  artwork: { position: "absolute" },
  display: { position: "absolute", overflow: "hidden" },
  displayGrouped: { backgroundColor: phoneIos.grouped },
  homeButton: { position: "absolute" },
  wallpaper: { ...StyleSheet.absoluteFill },
  band: { flex: 1 },
  statusBar: { height: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10 },
  statusSide: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  statusRight: { justifyContent: "flex-end", gap: 0 },
  signal: { flexDirection: "row", alignItems: "flex-end", gap: 1, height: 10 },
  signalBar: { width: 2 },
  carrier: { fontFamily: "Galmuri11", fontSize: 11, lineHeight: 14 },
  statusTime: { fontFamily: "Galmuri11Bold", fontSize: 12, lineHeight: 16, textAlign: "center" },
  battery: { width: 22, height: 11, borderWidth: 2, padding: 1 },
  batteryLevel: { flex: 1 },
  batteryTip: { width: 2, height: 4 },
  navBack: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 8, alignSelf: "flex-start" },
  navBackText: { color: phoneIos.blue, fontFamily: "Galmuri11Bold" },
  pageControls: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 9 },
  pageArrow: { width: 44, height: 36, alignItems: "center", justifyContent: "center" },
  pageDots: { flexDirection: "row", alignItems: "center" },
  pageDotButton: { width: 44, height: 36, alignItems: "center", justifyContent: "center" },
  pageDot: { width: 6, height: 6 },
  pageBody: { flex: 1, minHeight: 0 },
  hostedScreen: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 },
  content: { paddingHorizontal: 9, paddingTop: 5, paddingBottom: 12, gap: 10 },
  stack: { gap: 10 },
  card: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  cardTitle: { fontFamily: "Galmuri11Bold" },
  body2: { color: phoneIos.label },
  accent: { color: phoneIos.blue },
  muted: { color: phoneIos.label2, lineHeight: 20, paddingBottom: 2 },
  centered: { textAlign: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionsCentered: { justifyContent: "center" },
  appGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 6, paddingTop: 8 },
  appTile: { position: "relative", width: "24%", alignItems: "center", justifyContent: "flex-start", gap: 4 },
  appFace: { alignItems: "center", justifyContent: "center" },
  appIcon: { width: 36, height: 36 },
  appLabel: { color: phoneIos.label, fontFamily: "Galmuri11Bold", fontSize: 10, lineHeight: 12, textAlign: "center", maxWidth: "98%" },
  appLabelDisabled: { color: phoneIos.label2 },
  badge: { position: "absolute", top: -2, right: 4, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { color: phoneIos.onBlue, fontFamily: "Galmuri11Bold", fontSize: 10, lineHeight: 12 },
  flexText: { flex: 1, flexShrink: 1 },
  readStatus: { paddingHorizontal: 12, paddingVertical: 8, color: phoneIos.label2 },
  errorRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 4, alignItems: "center" },
  searchField: { paddingHorizontal: 10 },
  searchInput: { minHeight: 44, fontSize: 13 },
  noteInput: { minHeight: 112, backgroundColor: phoneIos.grouped, padding: 10, fontSize: 13, textAlignVertical: "top" },
  focusClock: { textAlign: "center", color: phoneIos.blue, fontVariant: ["tabular-nums"], fontFamily: "Galmuri11Bold", fontSize: 40, lineHeight: 48 },
});
