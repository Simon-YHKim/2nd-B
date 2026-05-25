import { Pressable, type PressableProps, StyleSheet } from "react-native";
import { radii, semantic, spacing, typography } from "@/lib/theme/tokens";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "danger";

export interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: Variant;
  loading?: boolean;
}

const BG: Record<Variant, string> = {
  primary: semantic.brand,
  secondary: semantic.surfaceAlt,
  danger: semantic.danger,
};

const FG: Record<Variant, string> = {
  primary: semantic.background,
  secondary: semantic.text,
  danger: "#ffffff",
};

export function Button({ label, variant = "primary", loading, disabled, style, ...rest }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={[
        styles.base,
        { backgroundColor: BG[variant], opacity: isDisabled ? 0.5 : 1 },
        style as any,
      ]}
    >
      <Text style={{ color: FG[variant], fontSize: typography.sizes.md, fontWeight: "600" }}>
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
