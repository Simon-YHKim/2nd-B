// MdCard - Material 3 card surface (rev2 migration, P1b). filled / outlined /
// elevated. Non-interactive by default; pass `onPress` to make it a button.
// Consumes m3.* tokens only.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, View, type ViewStyle } from "react-native";

import { m3 } from "@/lib/theme/m3";

export type MdCardVariant = "filled" | "outlined" | "elevated";

export interface MdCardProps {
  variant?: MdCardVariant;
  children?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const CARD: Record<MdCardVariant, ViewStyle> = {
  filled: { backgroundColor: m3.color.surfaceContainerHighest },
  outlined: { backgroundColor: m3.color.surface, borderWidth: 1, borderColor: m3.color.outlineVariant },
  elevated: { backgroundColor: m3.color.surfaceContainerLow, ...m3.elevation.level1 },
};

export function MdCard({ variant = "filled", children, onPress, accessibilityLabel, style }: MdCardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, CARD[variant], pressed && styles.pressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, CARD[variant], style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: m3.shape.medium, padding: m3.spacing.s4 },
  pressed: { opacity: 0.9 },
});
