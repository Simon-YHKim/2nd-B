// Branded inline loader for in-screen / inter-route loading (graph-ux #3).
// Shows the cosmic backdrop + a glowing pixel orb + mint spinner so route
// transitions and per-screen auth/data waits read as *our* loading screen,
// not a bare system spinner on a blank page. Self-contained: no font or
// provider dependency (safe to render before context is ready).

import { ActivityIndicator, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { semantic } from "@/lib/theme/tokens";

export function InlineLoader({ message }: { message?: string } = {}) {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel={message ?? "불러오는 중"}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="il-violet" cx="50%" cy="44%" r="46%">
            <Stop offset="0" stopColor={semantic.brand} stopOpacity="0.18" />
            <Stop offset="1" stopColor={semantic.brand} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={semantic.background} />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#il-violet)" />
        <Circle cx="50%" cy="44%" r="22" fill="none" stroke={semantic.brand} strokeOpacity={0.5} strokeWidth={2} />
        <Circle cx="50%" cy="44%" r="6" fill={semantic.brand} />
      </Svg>
      <View style={styles.spinner}>
        <ActivityIndicator color={semantic.brand} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: semantic.background,
  },
  spinner: { marginTop: 120 },
});
