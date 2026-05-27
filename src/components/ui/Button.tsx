import { Pressable, type PressableProps, StyleSheet } from "react-native";

import { radii, spacing, typography } from "@/lib/theme/tokens";
import { useThemePalette } from "@/lib/theme/ThemeContext";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "danger";

export interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: Variant;
  loading?: boolean;
}

export function Button({ label, variant = "primary", loading, disabled, style, ...rest }: ButtonProps) {
  const palette = useThemePalette();
  const isDisabled = disabled || loading;
  // Same variants, but the bg/fg colours track the active theme so a
  // light-mode primary stays high-contrast on the light background.
  const bg: Record<Variant, string> = {
    primary: palette.brand,
    secondary: palette.surfaceAlt,
    danger: palette.danger,
  };
  const fg: Record<Variant, string> = {
    primary: palette.background,
    secondary: palette.text,
    danger: "#ffffff",
  };
  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={[
        styles.base,
        { backgroundColor: bg[variant], opacity: isDisabled ? 0.5 : 1 },
        style as never,
      ]}
    >
      <Text style={{ color: fg[variant], fontSize: typography.sizes.md, fontWeight: "600" }}>
        {loading ? "…" : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
