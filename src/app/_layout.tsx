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
import { semantic } from "@/lib/theme/tokens";
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
function IntroGate({ children }: { children: React.ReactNode }) {
  const { userId, loading } = useAuth();
  const [introDone, setIntroDone] = useState(false);

  if (loading) return <InlineLoader />;
  if (!userId) return <>{children}</>;
  if (!introDone) {
    return <LoadingScreen ready={true} onContinue={() => setIntroDone(true)} />;
  }
  return <>{children}</>;
}
