import type { ReactNode } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { semantic, spacing } from "@/lib/theme/tokens";
import { useThemePalette } from "@/lib/theme/ThemeContext";

export function Screen({
  children,
  style,
  innerStyle,
}: {
  children: ReactNode;
  /** Override the safe-area container style (e.g. backgroundColor). */
  style?: StyleProp<ViewStyle>;
  /** Override the inner padded container style. */
  innerStyle?: StyleProp<ViewStyle>;
}) {
  // The active palette tracks the ThemeContext toggle. Falls back to the
  // static `semantic` default (dark sky) when no ThemeProvider is mounted
  // — keeps StyleSheet's frozen-color contract for callers that haven't
  // adopted the hook yet.
  const palette = useThemePalette();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }, style]}>
      <View style={[styles.inner, innerStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: semantic.background },
  inner: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
});
