import { useCallback, useEffect } from "react";
import { BackHandler, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";

import { SbStarfield } from "@/components/deep-space/SbStarfield";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable, PixelSurface } from "@/components/pixel";
import { m3TextStyle } from "@/components/m3/typeface";
import { useFontStyle } from "@/lib/settings/readable-font";
import { registerOwnBack } from "@/lib/nav/own-back";
import { m3 } from "@/lib/theme/m3";

export default function NotFound() {
  const { t } = useTranslation("notFound");

  // m3TextStyle() reads the current preference synchronously. Subscribing here
  // makes the fallback update immediately when readable body copy is enabled.
  useFontStyle();

  // Replace, rather than push: returning from home must not reopen the bad URL.
  // Expo Router also resolves this root against app.json's web baseUrl.
  const goHome = useCallback(() => router.replace("/"), []);

  useEffect(() => {
    // The root overlay normally supplies a back-to-home chip on unknown paths.
    // This screen owns that recovery action, so keep exactly one affordance.
    const unregisterOwnBack = registerOwnBack();
    if (Platform.OS !== "android") return unregisterOwnBack;

    // A cold Android deep link has no safe stack entry to pop. Hardware Back
    // therefore follows the same canonical recovery as the visible button.
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goHome();
      return true;
    });

    return () => {
      subscription.remove();
      unregisterOwnBack();
    };
  }, [goHome]);

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View pointerEvents="none" style={styles.sky}>
        <SbStarfield cosmic />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <PixelSurface variant="frame" style={styles.panel} contentStyle={styles.panelContent}>
          <PixelGlyph name="link" color={m3.accent.starCore} size={48} />

          <Text style={[m3TextStyle("displayLarge"), styles.code]}>{t("hero.eyebrow")}</Text>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.3}
            style={[m3TextStyle("headlineSmall"), styles.title]}
          >
            {t("hero.title")}
          </Text>
          <Text
            maxFontSizeMultiplier={1.7}
            style={[m3TextStyle("bodyLarge"), styles.subtitle]}
          >
            {t("hero.subtitle")}
          </Text>

          <PixelPressable
            onPress={goHome}
            accessibilityLabel={t("actions.home")}
            accessibilityHint={t("actions.homeHint")}
            background={m3.color.primary}
            style={styles.homeAction}
            contentStyle={styles.homeActionContent}
          >
            <PixelGlyph name="house" color={m3.color.onPrimary} size={24} />
            <Text style={[m3TextStyle("labelLarge"), styles.homeLabel]}>
              {t("actions.home")}
            </Text>
          </PixelPressable>
        </PixelSurface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m3.accent.cosmicBase },
  sky: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s8,
  },
  panel: { width: "100%", maxWidth: 358, alignSelf: "center" },
  panelContent: {
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s8,
  },
  code: { color: m3.color.primary, textAlign: "center" },
  title: { color: m3.color.onSurface, textAlign: "center" },
  subtitle: {
    color: m3.color.onSurfaceVariant,
    textAlign: "center",
    marginBottom: m3.spacing.s4,
  },
  homeAction: { minWidth: 240 },
  homeActionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
  },
  homeLabel: { color: m3.color.onPrimary, textAlign: "center" },
});
