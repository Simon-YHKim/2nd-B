import { useEffect } from "react";
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Hold here until the phytoncide fonts resolve. On native the OS splash is
  // still up; on web there is none, so render the branded loading screen
  // instead of a blank frame. On a font error we still proceed so the app is
  // never permanently blocked.
  if (!fontsLoaded && !fontError) return <LoadingScreen />;

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
            <Stack.Screen name="+not-found" />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
