// Cosmic Pixel Graph Village — premium background + app shell (Part 1).
//
// Deep cosmic navy with a violet core glow up top, a mint glow lower down,
// and a subtle, static star grain. Built with react-native-svg so it renders
// identically on native + web with no extra bundler config, and stays still
// (reduced-motion safe — no twinkle). The graph village background stays dark
// in every theme mode (constraint #4), so these read from `cosmic.*`
// directly rather than the theme palette.

import type { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePathname } from "expo-router";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop, Circle } from "react-native-svg";

import { cosmic, spacing } from "@/lib/theme/tokens";
import { ForceDark } from "@/lib/theme/ThemeContext";
import { backArrowVisible, isTabPath } from "@/components/ui/BackArrow";
import { TAB_BAR_HEIGHT } from "./tab-bar";
import { starField } from "./star-field";

/** Subtle static star grain, sized to the given box. Decorative. */
export function StarNoiseLayer({ width, height, count = 64 }: { width: number; height: number; count?: number }) {
  const stars = starField(width, height, count);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={cosmic.moonWhite} opacity={s.opacity} />
      ))}
    </Svg>
  );
}

/**
 * Full-bleed cosmic background. Place behind screen content (absolute fill).
 * `glow` toggles the violet/mint nebula glows (on by default).
 */
export function CosmicBackground({ glow = true, stars = true }: { glow?: boolean; stars?: boolean }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="cosmicBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={cosmic.space900} />
            <Stop offset="0.5" stopColor={cosmic.space950} />
            <Stop offset="1" stopColor="#05070F" />
          </LinearGradient>
          <RadialGradient id="violetGlow" cx="50%" cy="22%" r="60%">
            <Stop offset="0" stopColor={cosmic.soulViolet} stopOpacity="0.22" />
            <Stop offset="1" stopColor={cosmic.soulViolet} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="mintGlow" cx="50%" cy="92%" r="55%">
            <Stop offset="0" stopColor={cosmic.signalMint} stopOpacity="0.12" />
            <Stop offset="1" stopColor={cosmic.signalMint} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#cosmicBg)" />
        {glow ? (
          <>
            <Rect x="0" y="0" width={width} height={height} fill="url(#violetGlow)" />
            <Rect x="0" y="0" width={width} height={height} fill="url(#mintGlow)" />
          </>
        ) : null}
      </Svg>
      {stars ? <StarNoiseLayer width={width} height={height} /> : null}
    </View>
  );
}

/**
 * Premium app shell: a dark safe-area frame with the cosmic background
 * behind the screen content. Screens supply their own ScrollView/layout.
 */
export function PremiumAppShell({
  children,
  glow = true,
  stars = true,
  padded = true,
}: {
  children: ReactNode;
  glow?: boolean;
  stars?: boolean;
  /** Add the standard horizontal screen padding (matches the legacy Screen). */
  padded?: boolean;
}) {
  const pathname = usePathname();
  // When the floating back arrow is shown it sits above the content lane;
  // reserve top padding so first headings never collide with it. This also
  // applies to tab destinations, which still render full screen titles.
  const needsArrowHeadroom = backArrowVisible(pathname);
  // Tab screens render under the absolute bottom tab bar; reserve its height so
  // a screen's last element (e.g. the 세컨비 chat composer / send button) isn't
  // hidden behind it. Applies regardless of `padded` (horizontal-only).
  const onTabBar = isTabPath(pathname);

  return (
    <ForceDark>
      <View style={styles.root}>
        <CosmicBackground glow={glow} stars={stars} />
        <SafeAreaView
          style={[
            styles.safe,
            padded ? styles.padded : null,
            padded && needsArrowHeadroom ? styles.arrowHeadroom : null,
            onTabBar ? styles.tabBarClearance : null,
          ]}
        >
          {children}
        </SafeAreaView>
      </View>
    </ForceDark>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cosmic.space950 },
  safe: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  // 40px arrow + breathing room; keeps the back button lane separate from
  // each screen's first title/eyebrow row.
  arrowHeadroom: { paddingTop: 60 },
  // Clears the absolute bottom tab bar (its height) so tab-screen content and
  // bottom inputs aren't covered. SafeAreaView already adds the safe-area
  // inset; this is the bar's own height plus a small gap on top.
  tabBarClearance: { paddingBottom: TAB_BAR_HEIGHT + spacing.lg },
});
