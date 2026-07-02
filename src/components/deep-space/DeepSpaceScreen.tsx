/**
 * Shared deep-space chrome — a 1:1 clone of design/prototype.dc.html's frame:
 * SecondbStatusHeader at the top, the screen body, and the primary dock at the
 * bottom. No extra chrome (the design home has no top-right icons). The OS status
 * bar is handled by the safe-area inset.
 *
 * The dock MAPS to real routes (router, SCREEN_TREE_SPEC §0.2): 담기→/capture,
 * 알아가기→/index, 비서→/ops, 나→/account, + 중앙 세컨비→/secondb — so the chrome
 * is persistent and the nav is real.
 *
 * Rendered only in the deep-space build. The deep-space-shell-a11y guard pins the
 * character accessibilityLabel pattern to THIS file.
 */
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";

import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import type { M3Persona } from "@/lib/theme/m3";
import { MdNavBar } from "@/components/m3";
import { SecondbStatusHeader } from "./SecondbStatusHeader";
import { SbStarfield } from "./SbStarfield";
import type { SecondbMood } from "./SecondbHead";
import { TabIcon, type DeepSpaceTab } from "./DeepSpaceDock";

const TAB_ROUTE: Record<DeepSpaceTab, Href> = {
  home: "/",
  capture: "/capture",
  chat: "/secondb",
  ops: "/ops",
  account: "/account",
  wiki: "/wiki",
  lens: "/core-brain",
  iden: "/iden",
  settings: "/settings",
};

const VIEW_MOOD: Record<DeepSpaceTab, SecondbMood> = {
  home: "positive",
  capture: "neutral",
  chat: "neutral",
  ops: "neutral",
  account: "positive",
  wiki: "neutral",
  lens: "positive",
  iden: "neutral",
  settings: "neutral",
};

// Primary order (rev2 SoT, sb-data NAV): 별자리 · 담기 · [중앙 세컨비] · 위키 · 설정.
// 비서(ops) moves out of the dock — reached via the home head-tap menu (sb-home)
// and deep links; 나(account) stays reachable via profile / settings / back-arrow.
const TABS: DeepSpaceTab[] = ["home", "capture", "chat", "wiki", "settings"];

export function DeepSpaceScreen({
  active,
  personaTint,
  header = "companion",
  children,
}: {
  active: DeepSpaceTab;
  /** rev2 persona tint for the status-header head (chat surface). Unset = canonical cyan. */
  personaTint?: M3Persona;
  /** rev2 (sb-app §4): the companion header belongs to capture/chat/records only —
   *  home renders its own big head + bubble, so it passes "none". */
  header?: "companion" | "none";
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation("home");
  const isKo = i18n.language === "ko";

  // Character a11y label stays an inline isKo ternary (deep-space-shell-a11y guard
  // pins this pattern + bans non-ASCII string literals in accessibilityLabel).
  const characterLabel = isKo ? "세컨드 브레인 캐릭터" : "Second Brain character";

  const dockItems = TABS.map((key) => ({
    key,
    label: t("ds.dock." + key),
    accessibilityLabel: t("ds.dock." + key),
    icon: (color: string) => <TabIcon tab={key} color={color} />,
    center: key === "chat",
  }));

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* rev2 shared constellation wallpaper (sb-app SbStarfield + SB_COSMIC),
          seed-locked so every screen sits under the same sky. */}
      <View pointerEvents="none" style={styles.spaceWash}>
        <SbStarfield cosmic />
      </View>
      {header === "companion" ? (
        <SecondbStatusHeader
          text={t("ds.head." + active + ".text")}
          tip={t("ds.head." + active + ".tip")}
          mood={VIEW_MOOD[active]}
          persona={personaTint}
          accessibilityLabel={characterLabel}
        />
      ) : null}

      <View style={styles.body}>{children}</View>

      <MdNavBar
        active={active}
        items={dockItems}
        onSelect={(tab) => {
          if (tab !== active) router.replace(TAB_ROUTE[tab as DeepSpaceTab]);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: deepSpace.bgEdge },
  spaceWash: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  body: {
    flex: 1,
    backgroundColor: withAlpha(deepSpace.bgEdge, 0.5),
  },
});
