/**
 * Shared deep-space chrome (design/prototype.dc.html): top-right profile/settings
 * icons + SecondbStatusHeader + a five-tab dock, wrapping each screen's body. The
 * dock MAPS to real routes (router navigation) — tapping 담기/세컨비/나/IDEN lands
 * on /capture, /secondb, /core-brain, /iden, each of which renders its deep-space
 * design body inside this same wrapper. So the chrome is persistent and the nav is
 * real (not demo view-switching).
 *
 * Rendered only in the deep-space build. The deep-space-shell-a11y guard pins the
 * profile/settings/character accessibilityLabel pattern to THIS file.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";

import { deepSpace } from "@/lib/theme/tokens";
import { SecondbStatusHeader } from "./SecondbStatusHeader";
import type { SecondbMood } from "./SecondbHead";
import { DeepSpaceDock, type DeepSpaceTab } from "./DeepSpaceDock";

// Dock tab → real route. The home tab returns to index (the constellation shell).
const TAB_ROUTE: Record<DeepSpaceTab, Href> = {
  home: "/",
  capture: "/capture",
  chat: "/secondb",
  lens: "/core-brain",
  iden: "/iden",
};

const VIEW_MOOD: Record<DeepSpaceTab, SecondbMood> = {
  home: "positive",
  capture: "neutral",
  chat: "neutral",
  lens: "positive",
  iden: "neutral",
};

const TABS: DeepSpaceTab[] = ["home", "capture", "chat", "lens", "iden"];

export function DeepSpaceScreen({ active, children }: { active: DeepSpaceTab; children: ReactNode }) {
  const { t, i18n } = useTranslation("home");
  const isKo = i18n.language === "ko";

  // a11y labels stay inline isKo ternaries (deep-space-shell-a11y guard pins this
  // pattern + bans non-ASCII string literals in accessibilityLabel).
  const profileLabel = isKo ? "나 · 프로필" : "Me · profile";
  const settingsLabel = isKo ? "설정" : "Settings";
  const characterLabel = isKo ? "세컨드 브레인 캐릭터" : "Second Brain character";

  const dockItems = TABS.map((key) => ({
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
        text={t("ds.head." + active + ".text")}
        tip={t("ds.head." + active + ".tip")}
        mood={VIEW_MOOD[active]}
        accessibilityLabel={characterLabel}
      />

      <View style={styles.body}>{children}</View>

      <DeepSpaceDock
        active={active}
        items={dockItems}
        onChange={(tab) => {
          if (tab !== active) router.replace(TAB_ROUTE[tab]);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: deepSpace.bg },
  icons: { flexDirection: "row", justifyContent: "flex-end", gap: 10, paddingTop: 8, paddingHorizontal: 18 },
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
