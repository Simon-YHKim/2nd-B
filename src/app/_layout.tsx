import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import "../../global.css";
import { initI18n } from "@/lib/i18n";
import { initAnalytics } from "@/lib/analytics";
import { AuthProvider, useAuth } from "@/lib/auth/AuthContext";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { BackArrow } from "@/components/ui/BackArrow";
import { PremiumTabBar } from "@/components/premium";
import { fontAssets } from "@/theme/typography";
import { ThemeProvider, useTheme, useThemePalette } from "@/lib/theme/ThemeContext";

initI18n();
void initAnalytics();
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

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
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <ThemedStatusBar />
            <IntroGate>
              <ThemedStack>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="journal" />
              <Stack.Screen name="audit" />
              <Stack.Screen name="persona" />
              <Stack.Screen name="capture" />
              <Stack.Screen name="inbox" />
              <Stack.Screen name="formats" />
              <Stack.Screen name="jarvis" />
              <Stack.Screen name="wiki" />
              <Stack.Screen name="manual" />
              <Stack.Screen name="big-five" />
              <Stack.Screen name="insights" />
              <Stack.Screen name="attachment" />
              <Stack.Screen name="permissions" />
              <Stack.Screen name="research" />
              <Stack.Screen name="trinity" />
              <Stack.Screen name="mbti" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="privacy" />
              <Stack.Screen name="import" />
              <Stack.Screen name="interview" />
              <Stack.Screen name="+not-found" />
              </ThemedStack>
              <BackArrow />
              <AppTabBar />
            </IntroGate>
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
  return (
    <Stack
      screenOptions={{
        headerShown: false,
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

/** StatusBar style follows the active mode. */
function ThemedStatusBar() {
  const { mode } = useTheme();
  return <StatusBar style={mode === "dark" ? "light" : "dark"} />;
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

function introAlreadyPlayed(): boolean {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markIntroPlayed(): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* ignore — private mode / native */
  }
}

function IntroGate({ children }: { children: React.ReactNode }) {
  const { userId, loading } = useAuth();
  // Play the cell-team intro only once per tab session. On re-entry (tab
  // switch back, navigating home, a fresh auth event) we go straight to the
  // app instead of re-showing the loader that waits for a tap — that was the
  // "infinite loading on re-entry" report.
  const [introDone, setIntroDone] = useState(introAlreadyPlayed);

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
