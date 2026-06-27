import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Redirect, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppState } from "react-native";

import "../../global.css";
import { initI18n } from "@/lib/i18n";
import { initAnalytics, setAnalyticsConsent } from "@/lib/analytics";
import { AuthProvider, useAuth } from "@/lib/auth/AuthContext";
import { requiresGuardianConsent } from "@/lib/auth/consent-age";
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

initI18n();
void initAnalytics();
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
              <Stack.Screen name="jarvis" />
              <Stack.Screen name="plans" />
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
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        ...transition,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      {children}
    </Stack>
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
  const { userId, loading, hasProfile } = useAuth();
  const segments = useSegments();
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

  // Global C10 + PIPA-consent gate (re-audit 2026-06-03: per-screen gating was
  // leaky — inbox/wiki kept slipping through). An authenticated session with NO
  // public.users row (the OAuth-before-/complete-profile state, hasProfile===
  // false) must not reach ANY feature screen, since every one may invoke Gemini
  // before the age gate + consent are collected. Redirect to /complete-profile.
  // The (auth) group (sign-in/up, complete-profile, oauth-callback) is exempt so
  // the user can actually finish. Per-screen redirects stay as defense-in-depth.
  if (!loading && userId && hasProfile === false && segments[0] !== "(auth)") {
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
// resolves, load GA4/Clarity/PostHog only when the user's stored
// external_analytics pref is on, they are not in the 14-17 high-privacy band,
// and their birth date is not below the KR/PIPA self-consent floor. A minor's
// privacy lock (0033/0038) already forces external_analytics false server-side,
// so this is defense-in-depth against a stale/forged client cache. Renders
// nothing; analytics never hard-fails the app.
function AnalyticsConsentSync(): null {
  const { userId, isMinor, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setAnalyticsConsent(false);
      return;
    }
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
        const underDigitalConsentAge = age !== null && requiresGuardianConsent(age, "KR");
        if (!cancelled) setAnalyticsConsent(ext, { isMinor, underDigitalConsentAge });
      } catch {
        if (!cancelled) setAnalyticsConsent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isMinor, loading]);
  return null;
}

function AuditWriteOutboxSync(): null {
  const { userId, loading } = useAuth();
  useEffect(() => {
    if (loading || !userId) return;

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
  }, [loading, userId]);
  return null;
}
