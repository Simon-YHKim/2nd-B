/**
 * Shared deep-space chrome — a 1:1 clone of design/prototype.dc.html's frame:
 * SecondbStatusHeader at the top, the screen body, and the five-tab dock at the
 * bottom. No extra chrome (the design home has no top-right icons). The OS status
 * bar is handled by the safe-area inset.
 *
 * The dock MAPS to real routes (router): 담기→/capture, 세컨비→/secondb,
 * 나→/core-brain, IDEN→/iden — so the chrome is persistent and the nav is real.
 *
 * Rendered only in the deep-space build. The deep-space-shell-a11y guard pins the
 * character accessibilityLabel pattern to THIS file.
 */
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";

import { deepSpace } from "@/lib/theme/tokens";
import { SecondbStatusHeader } from "./SecondbStatusHeader";
import type { SecondbMood } from "./SecondbHead";
import { DeepSpaceDock, type DeepSpaceTab } from "./DeepSpaceDock";

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

  // Character a11y label stays an inline isKo ternary (deep-space-shell-a11y guard
  // pins this pattern + bans non-ASCII string literals in accessibilityLabel).
  const characterLabel = isKo ? "세컨드 브레인 캐릭터" : "Second Brain character";

  const dockItems = TABS.map((key) => ({
    key,
    label: t("ds.dock." + key),
    accessibilityLabel: t("ds.dock." + key),
  }));

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
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
  body: { flex: 1 },
});
