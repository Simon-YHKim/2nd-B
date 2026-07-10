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
import { useEffect, type ReactNode } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname, type Href } from "expo-router";

import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3, type M3Persona } from "@/lib/theme/m3";
import { MdNavBar, MdTopAppBar } from "@/components/m3";
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
  variant = "fullbleed",
  title,
  onBack,
  action,
  children,
}: {
  active: DeepSpaceTab;
  /** rev2 persona tint for the status-header head (chat surface). Unset = canonical cyan. */
  personaTint?: M3Persona;
  /** rev2 (sb-app §4) TARGET rule: the companion header belongs to capture/chat
   *  and the wiki graph (which FLOATS it) only — every converted rev2 screen
   *  passes "none"; home renders its own big head + bubble. NOTE the default
   *  stays "companion", so legacy fullbleed screens not yet converted still show
   *  it — strip those cohort by cohort with their shell conversion, not here. */
  header?: "companion" | "none" | "floating";
  /** rev2 (sb-app §4): every non-immersive screen floats as a radius-24 "window"
   *  over the shared sky (padding 12/12/14, surface bg, 1px starlight rim).
   *  museumLike = full-bleed cosmic surface with a translucent top scrim +
   *  top app bar floating over it (museum/exhibit/star; blur approximated —
   *  expo-blur would be a native dep and break the OTA runtime pin). */
  variant?: "fullbleed" | "windowed" | "museumLike";
  /** Windowed sub-screens: M3 top app bar title + back (TopAppBar). */
  title?: string;
  onBack?: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation("home");

  // Character a11y label resolves through i18next so every shipped locale gets its
  // own string (the deep-space-shell-a11y guard pins the t() call + bans non-ASCII
  // string literals in accessibilityLabel).
  const characterLabel = t("character.a11y");

  // rev2 back() (sb-app): hardware back on a non-home ROOT tab returns to the
  // constellation home instead of exiting the app. Screens with their own back
  // guards register later and therefore run first (LIFO); sub-screens keep the
  // default pop behavior — both when `active` is not in TABS AND when a
  // sub-screen reuses a tab's `active` for dock highlight (e.g. /capture-full
  // with active="capture"): only the tab's ROOT route gets the home-back rule.
  const pathname = usePathname();
  useEffect(() => {
    if (active === "home" || !TABS.includes(active)) return;
    if (pathname !== TAB_ROUTE[active]) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      router.replace("/");
      return true;
    });
    return () => sub.remove();
  }, [active, pathname]);

  // rev2 NavBar: uniform 64×32 pills + 24dp icons (no center emphasis).
  const dockItems = TABS.map((key) => ({
    key,
    label: t("ds.dock." + key),
    accessibilityLabel: t("ds.dock." + key),
    icon: (color: string) => <TabIcon tab={key} color={color} size={24} />,
  }));

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* rev2 shared constellation wallpaper (sb-app SbStarfield + SB_COSMIC),
          seed-locked so every screen sits under the same sky. */}
      <View pointerEvents="none" style={styles.spaceWash}>
        <SbStarfield cosmic />
      </View>
      {variant === "museumLike" ? (
        // rev2 museumLike (sb-app §4): the screen paints its own full-bleed
        // sky; a single top scrim spans the title zone so the sky reads as one
        // continuous wash, with the M3 top app bar floating inside it.
        <View style={styles.body}>
          <View style={styles.museumBody}>{children}</View>
          <View pointerEvents="box-none" style={styles.museumScrim}>
            {title && onBack ? <MdTopAppBar title={title} onBack={onBack} action={action} /> : null}
          </View>
        </View>
      ) : variant === "windowed" ? (
        // rev2 windowed layout: the screen floats as a radius-24 window over
        // the shared sky; the companion header (capture/chat) or the M3 top
        // app bar (sub-screens) sits INSIDE the window.
        <View style={styles.windowWrap}>
          <View style={styles.window}>
            {header === "companion" ? (
              <SecondbStatusHeader
                text={t("ds.head." + active + ".text")}
                tip={t("ds.head." + active + ".tip")}
                mood={VIEW_MOOD[active]}
                persona={personaTint}
                accessibilityLabel={characterLabel}
              />
            ) : title && onBack ? (
              <MdTopAppBar title={title} onBack={onBack} action={action} />
            ) : null}
            <View style={styles.windowBody}>{children}</View>
          </View>
        </View>
      ) : (
        <>
          {header === "companion" ? (
            <SecondbStatusHeader
              text={t("ds.head." + active + ".text")}
              tip={t("ds.head." + active + ".tip")}
              mood={VIEW_MOOD[active]}
              persona={personaTint}
              accessibilityLabel={characterLabel}
            />
          ) : null}
          <View style={styles.body}>
            {children}
            {header === "floating" ? (
              // rev2 records: the graph stays full-bleed and the companion
              // FLOATS over it (sb-app: absolute overlay, taps pass through
              // the wrapper so the graph keeps its gestures).
              <View pointerEvents="box-none" style={styles.floatingHeader}>
                <SecondbStatusHeader
                  text={t("ds.head." + active + ".text")}
                  tip={t("ds.head." + active + ".tip")}
                  mood={VIEW_MOOD[active]}
                  persona={personaTint}
                  accessibilityLabel={characterLabel}
                />
              </View>
            ) : null}
          </View>
        </>
      )}

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
  floatingHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 6 },
  // Content clears the ~56dp bar zone (no blur, so "under the scrim" would
  // just be hidden; clearance matches the visual outcome).
  museumBody: { flex: 1, paddingTop: 60 },
  // sb-app museumLike top scrim: rgba(8,11,20,.9) + hairline + soft drop —
  // stageFloor at .92 approximates the blurred wash without a native blur dep.
  museumScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 7,
    backgroundColor: withAlpha(m3.accent.stageFloor, 0.92),
    borderBottomWidth: 1,
    borderBottomColor: m3.color.outlineVariant,
    elevation: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
  },
  // sb-app windowed: padding '12px 12px 14px' around a radius-24 surface card
  // with a 1px starlight rim; the sky stays visible around it.
  windowWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
  },
  window: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: m3.color.surface,
    borderWidth: 1,
    borderColor: withAlpha(m3.accent.windowRim, 0.16),
    elevation: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
  },
  windowBody: { flex: 1, minHeight: 0 },
});
