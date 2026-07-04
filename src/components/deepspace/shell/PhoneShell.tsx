// PhoneShell — the reusable deep-space screen shell (sb-app.jsx structure).
//
// Every screen is wrapped in this: the shared seeded starfield sits BEHIND, the
// live status bar on TOP, the children in the middle, and the 5-tab nav at the
// bottom. Three layout classes match the prototype's classifier:
//   - immersive  (home, records): full-bleed; the screen paints its own field.
//   - museumLike (museum, exhibit, star): full-bleed + a blurred top scrim.
//   - windowed   (everything else): children float in a radius-24 "window" card
//     over the shared sky (padding 12/12/14, the exact sb-app shadow).
//
// On immersive/museum the status bar overlays the field (absolute) so the sky
// reads as one continuous wash; on windowed it sits in normal flow above the card.

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";

import { SbIcon } from "./SbIcon";
import { SbNavBar } from "./SbNavBar";
import { SbStarfield } from "./SbStarfield";
import { SbStatusBar } from "./SbStatusBar";

export type PhoneShellVariant = "immersive" | "museumLike" | "windowed";

export interface PhoneShellProps {
  variant: PhoneShellVariant;
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  showNav?: boolean;
  /** Force the active nav tab (else derived from the current route). */
  activeNav?: string;
}

// sb-app data-window: 0 20px 52px rgba(0,0,0,.5), 0 0 0 1px rgba(150,180,230,.16).
// RN takes a single shadow; the 1px rim is a hairline border in windowRim.
const WINDOW_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.5,
  shadowRadius: 26,
  shadowOffset: { width: 0, height: 20 },
  elevation: 16,
} as const;

function TopBar({ title, showBack, onBack }: { title?: string; showBack?: boolean; onBack?: () => void }) {
  if (!title && !showBack) return null;
  return (
    <View style={styles.topBar}>
      {showBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="뒤로" style={styles.backBtn}>
          <SbIcon name="arrow_back" size={24} color={m3.color.onSurface} />
        </Pressable>
      ) : (
        <View style={styles.backSpace} />
      )}
      {title ? (
        <Text numberOfLines={1} style={styles.topTitle}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

export function PhoneShell({
  variant,
  children,
  title,
  showBack,
  onBack,
  showNav = true,
  activeNav,
}: PhoneShellProps) {
  const fullBleed = variant === "immersive" || variant === "museumLike";

  return (
    <View style={styles.root}>
      {/* shared constellation wallpaper — behind every screen */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <SbStarfield cosmic />
      </View>

      {/* status bar — overlays the field on full-bleed screens, in-flow otherwise */}
      {fullBleed ? (
        <View style={styles.statusOverlay} pointerEvents="box-none">
          <SbStatusBar onHome />
        </View>
      ) : null}

      {variant === "windowed" ? (
        <View style={styles.windowPad}>
          <View style={styles.windowCard}>
            <SbStatusBar />
            <TopBar title={title} showBack={showBack} onBack={onBack} />
            <View style={styles.windowBody}>{children}</View>
          </View>
        </View>
      ) : (
        <View style={styles.fullBody}>{children}</View>
      )}

      {/* museum-like: a single blurred top scrim so the sky reads continuous */}
      {variant === "museumLike" ? (
        <View style={styles.museumScrim} pointerEvents="box-none">
          <TopBar title={title} showBack={showBack} onBack={onBack} />
        </View>
      ) : null}

      {showNav ? <SbNavBar active={activeNav} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m3.accent.cosmicBase },
  statusOverlay: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 8 },
  fullBody: { flex: 1, minHeight: 0 },
  windowPad: { flex: 1, minHeight: 0, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 14 },
  windowCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: m3.color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(m3.accent.windowRim, 0.16),
    ...WINDOW_SHADOW,
  },
  windowBody: { flex: 1, minHeight: 0 },
  museumScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 7,
    paddingTop: 34,
    backgroundColor: withAlpha(m3.accent.stageFloor, 0.9),
    borderBottomWidth: 1,
    borderBottomColor: m3.color.outlineVariant,
  },
  topBar: { flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 },
  backBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  backSpace: { width: 8 },
  topTitle: {
    fontFamily: m3.font.plain,
    fontSize: m3.type.titleLarge.size,
    fontWeight: "500",
    color: m3.color.onSurface,
    flex: 1,
  },
});
