import { useEffect } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import "../../global.css";
import { initI18n } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { fontAssets } from "@/theme/typography";

// Initialize at module load so the i18next instance exists during SSR/SSG
// (static export renders without running effects).
initI18n();

// Keep the splash screen up until the phytoncide fonts are ready.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Hold the (already-visible) splash until fonts resolve. On a font error we
  // still proceed so the app is never permanently blocked.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0B0E0C" } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="journal" />
            <Stack.Screen name="audit" />
            <Stack.Screen name="persona" />
            <Stack.Screen name="+not-found" />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
