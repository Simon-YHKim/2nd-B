// MdCard - Material 3 card surface (rev2 migration, P1b). filled / outlined /
// elevated. Non-interactive by default; pass `onPress` to make it a button.
// Consumes m3.* tokens only.
//
// Pressable layout note (#680): Fabric Android drops function-form Pressable
// styles, so the card visuals live on a wrapper View and the inner Pressable
// carries only a STATIC padding style (with android_ripple for touch feedback)
// - the same proven pattern as SbNavBar and ConstellationHome.
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
      <View style={[styles.shell, CARD[variant], style]}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          android_ripple={{ color: m3.color.surfaceVariant }}
          style={styles.press}
        >
          {children}
        </Pressable>
      </View>
    );
  }
  return <View style={[styles.card, CARD[variant], style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: m3.shape.medium, padding: m3.spacing.s4 },
  // interactive split: radius / bg / border on the shell, padding on the bare
  // touch surface so taps cover the whole card face.
  shell: { borderRadius: m3.shape.medium, overflow: "hidden" },
  press: { padding: m3.spacing.s4 },
});
