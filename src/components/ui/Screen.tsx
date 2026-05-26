import type { ReactNode } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { semantic, spacing } from "@/lib/theme/tokens";

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
  return (
    <SafeAreaView style={[styles.safe, style]}>
      <View style={[styles.inner, innerStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: semantic.background },
  inner: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
});
