import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAddressTerm } from "@/lib/persona/use-address";
import {
  Stack,
  Redirect,
  usePathname,
  useSegments,
  // ⚠ 라우터의 **네비게이션 테마**다. 화면 팔레트(`@/lib/theme/ThemeContext`)와
  //   다른 물건이라 이름을 갈라 부른다. 아래 ThemedStack 주석 참조.
  ThemeProvider as NavThemeProvider,
  DarkTheme as NavDarkTheme,
} from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppState } from "react-native";

import "../../global.css";
import { initI18n } from "@/lib/i18n";
import {
  captureEvent,
  getAnalyticsConsentRevision,
  initAnalytics,
  pageView,
  setAnalyticsConsent,
} from "@/lib/analytics";
import { AuthProvider, useAuth } from "@/lib/auth/AuthContext";
import { armWebRecoveryPendingFromLocation } from "@/lib/auth/recovery-proof-store";
import { requiresGuardianConsent, resolveJurisdiction } from "@/lib/auth/consent-age";
import { getSupabaseClient } from "@/lib/supabase/client";
import { flushAuditWriteOutbox } from "@/lib/llm/audit-write-outbox";
import { ageInYears } from "@/lib/supabase/auth";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { BackArrow } from "@/components/ui/BackArrow";
import { BackgroundTaskDock, CompletionToast, SecondbHeadTrackProvider } from "@/components/deepspace";
import { PremiumTabBar } from "@/components/premium";
import { pixelStackTransition } from "@/lib/motion/pixel-physical";
import { fontAssets } from "@/theme/typography";
import { ThemeProvider, useThemePalette } from "@/lib/theme/ThemeContext";
import { hydrateFirstStarChatNudge } from "@/lib/onboarding/state";

// Expo Router uses a route's named `ErrorBoundary` export as that segment's
// render-error fallback. Exporting it from the root layout makes it the app-wide
// boundary: any render error below the root shows the fallback, never a blank
// crash. The fallback renders outside this layout's providers by design — see
// RootErrorBoundary.tsx (handoff queue B, post-2026-06-26 crash hardening).
export { ErrorBoundary } from "@/components/ui/RootErrorBoundary";

// Native-only crash reporting. Web keeps its own @sentry/browser path in
// src/lib/analytics; jest/node and web never load the React Native SDK, guarded by
// the RN-runtime check (mirroring nativeIntroStorage below). Sentry.init installs the
// native crash handlers on its own, so this captures native + JS crashes once the app
// is rebuilt with the SDK in the binary. Source-map symbolication (the Sentry metro
// plugin + SENTRY_AUTH_TOKEN upload) is a deliberate follow-up; raw crashes report now.
function initNativeCrashReporting(): void {
  const nav = globalThis.navigator as { product?: string } | undefined;
  if (nav?.product !== "ReactNative") return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = require("@sentry/react-native") as typeof import("@sentry/react-native");
    Sentry.init({ dsn, sendDefaultPii: false, tracesSampleRate: 0.1 });
  } catch {
    // RN SDK not in the binary yet (pre-rebuild) — no-op.
  }
}

// This runs before AuthProvider creates the lazy Supabase client. On web it
// broadcasts a provisional cross-tab lock before auth-js mutates shared session
// storage for a reset callback; non-callback routes are a no-op.
armWebRecoveryPendingFromLocation();
initI18n();
initNativeCrashReporting();
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const fadeTransition = pixelStackTransition("fade");

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // The first-star chat nudge is persisted to AsyncStorage but nothing read it
  // back, so on native it re-armed on every cold start and re-nudged users who
  // had already been through it. Load it once, here, before any quant screen can
  // consume it. Fire-and-forget: the helper never throws and the worst case is
  // one extra nudge.
  useEffect(() => {
    void hydrateFirstStarChatNudge();
  }, []);

  // Brief minimal loader during font resolution. The branded cell-team
  // intro now lives inside IntroGate (gated on auth) — unauthenticated
  // visitors should land on /sign-in immediately, NOT see the loader.
  if (!fontsLoaded && !fontError) return <InlineLoader />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider>
          <AuthProvider>
            <ThemedStatusBar />
            <AnalyticsConsentSync />
            <AddressTermSync />
            <AuditWriteOutboxSync />
            {/* Big SecondB head follows touch on every screen (auto by size >= 80);
                bubbling onTouch* so it never steals taps. Dock + Toast are global
                overlays for the background-task loading system. */}
            <SecondbHeadTrackProvider>
            <IntroGate>
              {/* O-23 Stage③: the Stack mounts every route in BOTH UI modes (the
                  flag only swaps which component `index` renders — see index.tsx —
                  and adds the deep-space /graph alias). This is the nav-contract
                  architecture: no feature is dropped by the deep-space track. */}
              <ThemedStack>
              <Stack.Screen name="index" />
              <Stack.Screen name="graph" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="journal" />
              <Stack.Screen name="audit" />
              <Stack.Screen name="persona" />
              <Stack.Screen name="capture" />
              <Stack.Screen name="inbox" />
              <Stack.Screen name="focus" />
              <Stack.Screen name="srs" />
              <Stack.Screen name="formats" />
              <Stack.Screen name="secondb" />
              <Stack.Screen name="community" />
              <Stack.Screen name="community/[room]" />
              <Stack.Screen name="community/join/[token]" />
              <Stack.Screen name="jarvis" />
              <Stack.Screen name="plans" />
              <Stack.Screen name="subscription" />
              <Stack.Screen name="wiki" options={fadeTransition} />
              <Stack.Screen name="manual" />
              <Stack.Screen name="museum" />
              <Stack.Screen name="big-five" />
              <Stack.Screen name="insights" />
              <Stack.Screen name="trends" />
              <Stack.Screen name="attachment" />
              <Stack.Screen name="permissions" />
              <Stack.Screen name="research" />
              <Stack.Screen name="trinity" />
              <Stack.Screen name="mbti" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="privacy" />
              <Stack.Screen name="account" />
              <Stack.Screen name="import" />
              <Stack.Screen name="interview" />
              {/* Village detail + center: crossfade so the graph→village
                  transition reads as the zoomed island resolving into the
                  screen, and BACK doesn't hard-cut to a re-popping graph. The
                  five Pattern Cores route to /records + /wiki; the center to
                  /core-brain. (/imagine is now a redirect into Divergent mode.) */}
              <Stack.Screen name="records" options={fadeTransition} />
              <Stack.Screen name="core-brain" options={fadeTransition} />
              <Stack.Screen name="+not-found" />
              </ThemedStack>
              <BackArrow />
              <AppTabBar />
              <BackgroundTaskDock />
              <CompletionToast />
            </IntroGate>
            </SecondbHeadTrackProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Wraps <Stack> so its contentStyle.backgroundColor tracks the theme
 *  toggle without forcing every screen to set its own bg. */
function ThemedStack({ children }: { children: React.ReactNode }) {
  const palette = useThemePalette();
  const transition = pixelStackTransition();
  // ⚠ **`contentStyle` 만으로는 뒤가 안 칠해진다.**
  //
  // 그건 각 화면의 내용 컨테이너만 칠한다. 그 바깥의 네비게이션 루트 뷰는
  // 라우터의 **기본 테마**를 쓰는데, 그 기본값이 `rgb(242, 242, 242)`(밝은 회색)다.
  // 그래서 어두운 앱 뒤에 전면(390x820) 밝은 판이 **두 겹** 깔려 있었다.
  //
  // 실측으로 걸렸다: 채점기 B축(캐논 램프 면적)에서 `#f2f2f2` 하나가 여섯 화면
  // 전부에서 **12.3~12.4%** 를 먹고 있었다. 화면마다 값이 같아서 화면 탓이 아니라
  // 셸 탓임이 드러났다. 눈으로는 잘 안 보인다 — 앱이 그 위를 거의 다 덮기 때문에
  // 로딩 순간·전환 틈·오버스크롤에서만 새어 나온다.
  //
  // 팔레트는 항상 어두운 값이다(아래 ForceDark 주석). `card` 도 같이 맞춰야
  // 헤더·카드 기본값이 흰색으로 남지 않는다.
  const navTheme = useMemo(
    () => ({
      ...NavDarkTheme,
      colors: { ...NavDarkTheme.colors, background: palette.background, card: palette.background },
    }),
    [palette.background],
  );
  return (
    <NavThemeProvider value={navTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          ...transition,
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        {children}
      </Stack>
    </NavThemeProvider>
  );
}

/** Locale-aware premium bottom tab bar (shows only on primary routes). */
function AppTabBar() {
  const { i18n } = useTranslation();
  return <PremiumTabBar locale={i18n.language === "ko" ? "ko" : "en"} />;
}


/**
 * App content is always dark — every screen is wrapped in PremiumAppShell's
 * ForceDark and useThemePalette returns the dark palette even in Light mode
 * (the "village stays dark" design rule). So status-bar icons must always be
 * light to stay visible; tying them to `mode` rendered dark-on-dark in Light.
 */
function ThemedStatusBar() {
  return <StatusBar style="light" />;
}

/**
 * Gates the Stack on auth + intro state.
 *
 *   auth resolving       → InlineLoader (brief, dark)
 *   no auth              → render Stack (lands on /sign-in via /index redirect)
 *   auth + intro pending → LoadingScreen plays cell-team build
 *   auth + intro done    → render Stack (the main app)
 *
 * The cell-team intro now plays at the post-sign-in handoff: 'cells
 * building your second brain' literally welcomes you in. Returning
 * authenticated users on cold launch see it as 'reloading your brain'.
 */
const INTRO_SEEN_KEY = "secondB_intro_played_v1";

// P2-9 (persona sim): the seen-flag was sessionStorage-only, which simply
// does not exist on native — every cold start replayed the >=2.5s tap-gated
// intro, a real tax on the 60-90 second between-jobs sessions. Web keeps the
// once-per-tab-session behavior ("reloading your brain" on a fresh tab);
// native persists once-per-device via AsyncStorage (onboarding/state.ts
// pattern). The hydrate is async, so IntroGate also checks it in an effect.
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function nativeIntroStorage(): AsyncStorageLike | null {
  const nav = globalThis.navigator as { product?: string } | undefined;
  if (nav?.product !== "ReactNative") return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

function introAlreadyPlayed(): boolean {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

async function introAlreadyPlayedNative(): Promise<boolean> {
  const store = nativeIntroStorage();
  if (!store) return false;
  try {
    return (await store.getItem(INTRO_SEEN_KEY)) === "1";
  } catch {
    return false;
  }
}

function markIntroPlayed(): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* ignore — private mode */
  }
  void nativeIntroStorage()
    ?.setItem(INTRO_SEEN_KEY, "1")
    .catch(() => {
      /* best-effort */
    });
}

function IntroGate({ children }: { children: React.ReactNode }) {
  const {
    userId,
    loading,
    hasProfile,
    profileProbeFailed,
    recoveryUserId,
    recoveryReady,
    recoveryPendingGlobal,
  } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  // Play the cell-team intro only once per tab session. On re-entry (tab
  // switch back, navigating home, a fresh auth event) we go straight to the
  // app instead of re-showing the loader that waits for a tap — that was the
  // "infinite loading on re-entry" report.
  const [introDone, setIntroDone] = useState(introAlreadyPlayed);
  // Native (P2-9): the seen-flag persists in AsyncStorage; hydrate it once.
  // A returning user skips the intro instead of paying 2.5s + a tap on every
  // cold start. Web is unaffected (the native store is null there).
  useEffect(() => {
    if (introDone) return;
    let cancelled = false;
    void introAlreadyPlayedNative().then((seen) => {
      if (seen && !cancelled) setIntroDone(true);
    });
    return () => {
      cancelled = true;
    };
    // Hydrate exactly once on mount — introDone is read but deliberately not
    // a dependency (it only flips one way and the effect self-noops then).
  }, []);

  // Cold start must not render an ordinary app route until the persisted
  // Supabase session and recovery marker have been reconciled. `introDone`
  // intentionally bypasses later profile re-probes, so this separate one-shot
  // readiness signal closes the restart window without re-showing the intro.
  if (!recoveryReady) return <InlineLoader />;

  // Recovery provenance survives restart and owns navigation globally. Exact
  // pathname matching also catches pushes to another route inside `(auth)`;
  // a group-level exemption would let /sign-in escape the mandatory reset.
  if ((recoveryUserId || recoveryPendingGlobal) && pathname !== "/reset-password") {
    return <Redirect href="/reset-password" />;
  }

  // Global C10 + PIPA-consent gate (re-audit 2026-06-03: per-screen gating was
  // leaky — inbox/wiki kept slipping through). An authenticated session with NO
  // public.users row (the OAuth-before-/complete-profile state, hasProfile===
  // false) must not reach ANY feature screen, since every one may invoke Gemini
  // before the age gate + consent are collected. Redirect to /complete-profile.
  // The (auth) group (sign-in/up, complete-profile, oauth-callback) is exempt so
  // the user can actually finish. /onboarding is ALSO exempt: it is a content-only
  // welcome carousel (no Gemini/feature path) that, under login-first entry (#1000),
  // runs right AFTER /complete-profile; yanking the just-completed user off it inside
  // the post-refresh stale-hasProfile window re-opened the E2E-2 /onboarding <->
  // /complete-profile "Maximum update depth exceeded" loop. The profile gate still
  // holds: "/" (DeepSpaceShell) forces hasProfile===false to /complete-profile
  // before onboarding, and onboarding exits back through "/". Per-screen redirects
  // stay as defense-in-depth.
  // F4: `!profileProbeFailed` — a TRANSIENT profile-probe failure publishes
  // hasProfile===false; do not eject a registered user to /complete-profile (DOB +
  // consent re-entry) on a network blip. The genuine no-profile state (a real server
  // answer, profileProbeFailed===false) still redirects. AuthContext re-probes.
  if (
    !loading &&
    userId &&
    hasProfile === false &&
    !profileProbeFailed &&
    segments[0] !== "(auth)" &&
    segments[0] !== "onboarding"
  ) {
    return <Redirect href="/complete-profile" />;
  }

  // Never swap the Stack for the intro while the user is INSIDE the (auth)
  // group (E2E-3 cold-start variant): signUpWithEmail fires SIGNED_IN
  // mid-submit, and on native introDone is false on every cold start
  // (sessionStorage is web-only), so this gate used to replace the sign-up
  // form with the LoadingScreen from the parent — destroying the typed
  // email/DOB/consent and any failure toast, which the screen's own
  // guard-hold cannot prevent. The intro still plays at the designed
  // hand-off: the post-auth arrival at "/" flips segments out of (auth).
  if (segments[0] === "(auth)") return <>{children}</>;

  // Once the intro has played this session, just render the app/children —
  // auth re-resolves quietly without re-gating the UI.
  if (introDone) return <>{children}</>;

  // Unauthenticated visitors skip the cell intro entirely once auth resolves —
  // they should land on /sign-in immediately, not watch a loader.
  if (!loading && !userId) return <>{children}</>;

  // Otherwise show the cell-team intro. Crucially, `ready` is driven by the
  // REAL auth/profile resolution (`!loading`) instead of a hardcoded true —
  // so the loader genuinely reflects loading: it keeps typing while we resolve
  // the session and only invites the tap once we're actually ready.
  return (
    <LoadingScreen
      ready={!loading}
      onContinue={() => {
        markIntroPlayed();
        setIntroDone(true);
      }}
    />
  );
}

// M1 (round-4): gate product analytics on the SERVER decision, not the
// localStorage cache (initAnalytics no longer auto-loads from it). Once auth
// resolves, load GA4/Clarity only when the user's stored
// external_analytics pref is on and the server birth date confirms age 18+.
// Missing/contradictory age data fails closed. A minor's privacy lock
// (0033/0038) already forces external_analytics false server-side, so this is
// defense-in-depth against a stale/forged client cache. Route analytics use
// Expo Router FILE segments ("/record/[id]"), never live ids or entry text.
// Renders nothing; analytics never hard-fails the app.
function AnalyticsConsentSync(): null {
  const { userId, isMinor, loading, recoveryUserId, recoveryPendingGlobal } = useAuth();
  const segments = useSegments();
  const routePath = segments.length > 0 ? `/${segments.join("/")}` : "/";
  const [consentSyncVersion, setConsentSyncVersion] = useState(0);
  const lastTrackedPageRef = useRef<string | null>(null);

  useEffect(() => {
    // Revoke synchronously before any server round-trip. This prevents a
    // previous adult account's grant from surviving into auth loading, a new
    // account, or an unresolved/minor age state.
    setAnalyticsConsent(false, { isMinor: true, confirmedAdult: false });
    lastTrackedPageRef.current = null;
    if (loading || recoveryUserId || recoveryPendingGlobal) return;
    // AuthProvider must create the web Supabase client and subscribe before
    // any module starts a query. Otherwise auth-js can emit PASSWORD_RECOVERY
    // from a cold URL before the listener exists, reducing recovery to an
    // indistinguishable persisted session. Initialization stays fail-closed;
    // the server-derived consent decision below may enable product analytics.
    void initAnalytics();
    if (!userId) {
      setConsentSyncVersion((version) => version + 1);
      return;
    }
    if (isMinor !== false) {
      setConsentSyncVersion((version) => version + 1);
      return;
    }
    const expectedRevision = getAnalyticsConsentRevision();
    let cancelled = false;
    void (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from("users")
          .select("privacy_prefs,birth_date")
          .eq("id", userId)
          .maybeSingle();
        const ext =
          (data?.privacy_prefs as { external_analytics?: boolean } | null)?.external_analytics === true;
        const age = data?.birth_date ? ageInYears(data.birth_date as string) : null;
        const underDigitalConsentAge = age !== null && requiresGuardianConsent(age, resolveJurisdiction());
        // AuthContext also derives isMinor from birth_date. Require BOTH views
        // to say "adult"; missing or contradictory data stays blocked.
        const under18 = age === null || age < 18 || isMinor !== false;
        if (!cancelled) {
          setAnalyticsConsent(
            ext,
            {
              isMinor: under18,
              confirmedAdult: !under18,
              underDigitalConsentAge,
            },
            { expectedRevision },
          );
          setConsentSyncVersion((version) => version + 1);
        }
      } catch {
        if (!cancelled) {
          setAnalyticsConsent(
            false,
            { isMinor: true, confirmedAdult: false },
            { expectedRevision },
          );
          setConsentSyncVersion((version) => version + 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isMinor, loading, recoveryPendingGlobal, recoveryUserId]);

  useEffect(() => {
    const pageKey = `${userId ?? "signed-out"}:${routePath}`;
    if (lastTrackedPageRef.current === pageKey) return;
    if (captureEvent(pageView({ path: routePath }))) {
      lastTrackedPageRef.current = pageKey;
    }
  }, [routePath, userId, consentSyncVersion]);

  return null;
}

// `{{who}}` 공급자. 로케일 문자열이 사용자를 이름으로 부르는데("허슬케이님의
// 영역"), 그 값을 화면마다 넘기지 않고 i18next defaultVariables 로 한 번에
// 채운다. 이름이 없으면 폴백(당신)이라 문장이 깨지지 않는다.
function AddressTermSync(): null {
  const { userId, recoveryUserId, recoveryPendingGlobal } = useAuth();
  const { i18n } = useTranslation();
  useAddressTerm(recoveryUserId || recoveryPendingGlobal ? null : userId, i18n.language);
  return null;
}

function AuditWriteOutboxSync(): null {
  const { userId, loading, recoveryUserId, recoveryPendingGlobal } = useAuth();
  useEffect(() => {
    if (loading || !userId || recoveryUserId || recoveryPendingGlobal) return;

    const flush = () => {
      void flushAuditWriteOutbox(userId);
    };

    flush();
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") flush();
    });
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("online", flush);
      return () => {
        appStateSub.remove();
        window.removeEventListener("online", flush);
      };
    }
    return () => {
      appStateSub.remove();
    };
  }, [loading, recoveryPendingGlobal, recoveryUserId, userId]);
  return null;
}
