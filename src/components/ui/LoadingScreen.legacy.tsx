// Branded loading screen — logo + spinner on the phytoncide background.
// Deliberately self-contained: it depends on no provider (SafeAreaProvider,
// AuthProvider) and no custom font, so it can render BOTH inside the root
// layout (before providers mount, while fonts load) AND inside screens
// (while auth resolves). Keep it that way.

import { View, Image, ActivityIndicator, StyleSheet } from "react-native";

import { colors, spacing } from "@/theme";

// Premium loading orb from the refine asset pack.
const logo = require("../../../public/assets/2ndb-production-premium-v1/graph/islands/core_center_premium_hq.png");

export function LoadingScreen() {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="2nd-Brain 불러오는 중">
      <Image source={logo} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator color={colors.pine} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    gap: spacing["2xl"],
  },
  logo: { width: 168, height: 168 },
});
