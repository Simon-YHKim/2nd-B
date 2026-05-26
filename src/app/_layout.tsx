import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import "../../global.css";
import { initI18n } from "@/lib/i18n";
import { initAnalytics } from "@/lib/analytics";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { fontAssets } from "@/theme/typography";
import { semantic } from "@/lib/theme/tokens";

// Initialize at module load so the i18next instance exists during SSR/SSG
// (static export renders without running effects).
initI18n();
// Analytics is fire-and-forget — no-op when no keys configured, never
// blocks UI. Runs on web only (initAnalytics guards Platform.OS).
void initAnalytics();

// Keep the splash screen up until the phytoncide fonts are ready.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  // The intro plays once per session (page load). Once the user taps to
  // dismiss the dolly-zoom, this flips true and the Stack mounts.
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Show the branded intro until BOTH the fonts have resolved AND the
  // user has tapped through the pulse stage. On a font error we still
  // unblock so the app is never permanently stuck.
  if (!introDone) {
    return (
      <LoadingScreen
        ready={fontsLoaded || !!fontError}
        onContinue={() => setIntroDone(true)}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          {/* Light phytoncide theme -- dark status bar content. */}
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: semantic.background },
            }}
          >
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
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
