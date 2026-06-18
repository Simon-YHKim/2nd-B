/**
 * O-23 Stage② — deep-space home shell (D-23 architecture C).
 *
 * Rendered only when EXPO_PUBLIC_UI=deep-space; the legacy gameboy track is
 * untouched. STEP 3/4 (design handoff 2026-06-17) turns the shell into the
 * integrated experience from design/prototype.dc.html: a SecondbStatusHeader at
 * the top, a five-tab dock at the bottom, and the dock views in between — home
 * (북극성 + 7 stars constellation), 담기, 세컨비, 나 (Big Five lens, with
 * empty/error/filled states), IDEN. The constellation's star brightness is the
 * user's real ladder progress.
 *
 * The top-right profile/settings icons stay (the only entry to those routes from
 * the shell, and pinned by the deep-space-shell-a11y guard). Internal views are
 * a faithful demo; real store/Gemini wiring is TODO per view. One message + one
 * graphic per screen (Simon standing rule). Android hardware-back steps a sub-view
 * back to home before exiting (ANDROID_QA §4).
 */
import { useEffect, useState } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";

import { deepSpace } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { loadStarLevels } from "@/lib/persona/load-star-levels";
import { type StarId } from "@/lib/persona/stars";
import type { LadderLevel } from "@/lib/persona/brightness";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { useOnboardingComplete } from "@/lib/onboarding/state";
import { SecondbStatusHeader } from "./SecondbStatusHeader";
import type { SecondbMood } from "./SecondbHead";
import { ConstellationHome } from "./ConstellationHome";
import { CaptureView, ChatView, IdenView, LensView } from "./DeepSpaceViews";
import { DeepSpaceDock, type DeepSpaceTab } from "./DeepSpaceDock";

// Per-view status-header mood (prototype heads map): home/lens read positive
// (mint), the rest neutral (soul violet).
const VIEW_MOOD: Record<DeepSpaceTab, SecondbMood> = {
  home: "positive",
  capture: "neutral",
  chat: "neutral",
  lens: "positive",
  iden: "neutral",
};

export function DeepSpaceShell() {
  const { t, i18n } = useTranslation("home");
  const isKo = i18n.language === "ko";
  const { userId, hasProfile, loading } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  const [view, setView] = useState<DeepSpaceTab>("home");
  const [starLevels, setStarLevels] = useState<Partial<Record<StarId, LadderLevel>>>({});

  // a11y labels stay inline isKo ternaries (deep-space-shell-a11y guard pins
  // this pattern + bans non-ASCII string literals in accessibilityLabel).
  const profileLabel = isKo ? "나 · 프로필" : "Me · profile";
  const settingsLabel = isKo ? "설정" : "Settings";
  const characterLabel = isKo ? "세컨드 브레인 캐릭터" : "Second Brain character";

  // Cheap, no-Gemini read so the constellation shows real star brightness.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadStarLevels(userId)
      .then(({ starLevels: levels }) => {
        if (active) setStarLevels(levels);
      })
      .catch(() => {
        // Offline / no data yet: leave stars dim rather than error.
      });
    return () => {
      active = false;
    };
  }, [userId]);

  // Android hardware back: a sub-view returns to home; home falls through to the
  // OS default (exit). Re-registered on view change so it reads the live view.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (view !== "home") {
        setView("home");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [view]);

  // Early returns run AFTER the hooks above so hook order stays stable.
  if (loading) return <InlineLoader />;
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (onboardingComplete === null) return <InlineLoader />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;

  const dockItems = (["home", "capture", "chat", "lens", "iden"] as DeepSpaceTab[]).map((key) => ({
    key,
    label: t("ds.dock." + key),
    accessibilityLabel: t("ds.dock." + key),
  }));

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.icons}>
        <Pressable
          style={({ pressed }) => [styles.icon, pressed && styles.iconPressed]}
          onPress={() => router.push("/profile")}
          accessibilityRole="button"
          accessibilityLabel={profileLabel}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Circle cx={12} cy={8} r={4} fill={deepSpace.text} />
            <Path d="M4 20.5c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z" fill={deepSpace.text} />
          </Svg>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.icon, pressed && styles.iconPressed]}
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel={settingsLabel}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58ZM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z"
              fill={deepSpace.text}
            />
          </Svg>
        </Pressable>
      </View>

      <SecondbStatusHeader
        text={t("ds.head." + view + ".text")}
        tip={t("ds.head." + view + ".tip")}
        mood={VIEW_MOOD[view]}
        accessibilityLabel={characterLabel}
      />

      <View style={styles.body}>
        {view === "home" ? (
          <ConstellationHome
            starLevels={starLevels}
            isKo={isKo}
            hint={t("ds.home.hint")}
            polarisLabel={t("ds.home.polaris")}
            onStarPress={() => setView("lens")}
            onPolarisPress={() => setView("iden")}
          />
        ) : view === "capture" ? (
          <CaptureView />
        ) : view === "chat" ? (
          <ChatView />
        ) : view === "lens" ? (
          <LensView />
        ) : (
          <IdenView />
        )}
      </View>

      <DeepSpaceDock active={view} items={dockItems} onChange={setView} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: deepSpace.bg },
  icons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    paddingTop: 8,
    paddingHorizontal: 18,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPressed: { borderColor: deepSpace.accent, backgroundColor: deepSpace.cardPressed },
  body: { flex: 1 },
});
