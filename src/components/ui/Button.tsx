import { Pressable, type PressableProps, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { cosmic, radii, spacing, typography } from "@/lib/theme/tokens";
import { useThemePalette } from "@/lib/theme/ThemeContext";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "danger";

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, variant = "primary", loading, disabled, style, ...rest }: ButtonProps) {
  const palette = useThemePalette();
  const isDisabled = disabled || loading;
  const bg: Record<Variant, string> = {
    primary: palette.brand,
    secondary: "rgba(167,139,250,0.14)",
    danger: "rgba(255,122,144,0.16)",
  };
  const border: Record<Variant, string> = {
    primary: palette.brand,
    secondary: "rgba(167,139,250,0.52)",
    danger: palette.danger,
  };
  const fg: Record<Variant, string> = {
    primary: palette.background,
    secondary: palette.text,
    danger: palette.danger,
  };
  const glow: Record<Variant, string> = {
    primary: palette.brand,
    secondary: cosmic.soulViolet,
    danger: palette.danger,
  };
  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg[variant],
          borderColor: border[variant],
          shadowColor: glow[variant],
        },
        variant === "primary" ? styles.primaryGlow : styles.softGlow,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? { backgroundColor: "rgba(141,152,184,0.08)", borderColor: palette.border, shadowOpacity: 0 } : null,
        style,
      ]}
    >
      <Text numberOfLines={1} style={[styles.label, { color: isDisabled ? palette.textSubtle : fg[variant] }]}>
        {loading ? "…" : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryGlow: {
    shadowOpacity: 0.36,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  softGlow: {
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  label: {
    fontSize: typography.sizes.md,
    fontWeight: "700",
    letterSpacing: 0,
  },
});
