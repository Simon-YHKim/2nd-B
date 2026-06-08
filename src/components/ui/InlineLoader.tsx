// Branded inline loader for in-screen / inter-route loading (graph-ux #3).
// Shows the cosmic backdrop + a framed pixel indicator so route
// transitions and per-screen auth/data waits read as *our* loading screen,
// not a bare system spinner on a blank page. Self-contained: no font or
// provider dependency (safe to render before context is ready).

import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { PixelLoaderGlyph } from "@/components/ui/PixelLoaderGlyph";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic } from "@/lib/theme/tokens";

export function InlineLoader({ message }: { message?: string } = {}) {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel={message ?? "불러오는 중"}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="il-violet" cx="50%" cy="44%" r="46%">
            <Stop offset="0" stopColor={cosmic.soulViolet} stopOpacity="0.18" />
            <Stop offset="1" stopColor={cosmic.soulViolet} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={cosmic.space950} />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#il-violet)" />
        <Circle cx="50%" cy="44%" r="22" fill="none" stroke={cosmic.soulViolet} strokeOpacity={0.5} strokeWidth={2} />
        <Circle cx="50%" cy="44%" r="6" fill={cosmic.signalMint} />
      </Svg>
      <View style={styles.pixelFrame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <PixelLoaderGlyph />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cosmic.space950,
  },
  pixelFrame: {
    marginTop: 120,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    borderRadius: gameboy.radius,
    backgroundColor: gameboy.screen,
    padding: gameboy.grid,
    ...pixelShadowStyle(),
  },
});
