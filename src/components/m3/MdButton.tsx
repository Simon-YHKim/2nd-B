// MdButton - Material 3 button (rev2 migration, P1b). Presentational; consumes
// m3.* tokens only. Five M3 variants. Stadium corner (m3.shape.full) per the
// approved rev2 direction (DESIGN.md carries an explicit M3-track exception).
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { m3 } from "@/lib/theme/m3";

import { m3TextStyle } from "./typeface";

export type MdButtonVariant = "filled" | "tonal" | "outlined" | "text" | "elevated";

export interface MdButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: MdButtonVariant;
  icon?: ReactNode;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const CONTAINER: Record<MdButtonVariant, ViewStyle> = {
  filled: { backgroundColor: m3.color.primary },
  tonal: { backgroundColor: m3.color.secondaryContainer },
  outlined: { backgroundColor: "transparent", borderWidth: 1, borderColor: m3.color.outline },
  text: { backgroundColor: "transparent", paddingHorizontal: m3.spacing.s3 },
  elevated: { backgroundColor: m3.color.surfaceContainerLow, ...m3.elevation.level1 },
};

const FG: Record<MdButtonVariant, string> = {
  filled: m3.color.onPrimary,
  tonal: m3.color.onSecondaryContainer,
  outlined: m3.color.primary,
  text: m3.color.primary,
  elevated: m3.color.primary,
};

export function MdButton({
  label,
  variant = "filled",
  icon,
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
  ...rest
}: MdButtonProps) {
  const isDisabled = disabled || loading;
  const fg = FG[variant];
  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.base, CONTAINER[variant], isDisabled && styles.disabled, style]}
    >
      {({ pressed }) => (
        <>
          {pressed && !isDisabled ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.stateLayer, { backgroundColor: fg }]} />
          ) : null}
          {loading ? (
            <ActivityIndicator size="small" color={fg} />
          ) : (
            <>
              {icon}
              <Text style={[m3TextStyle("labelLarge"), { color: fg }]} numberOfLines={1}>
                {label}
              </Text>
            </>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: m3.spacing.s6,
    borderRadius: m3.shape.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
  },
  disabled: { opacity: 0.38 },
  stateLayer: { borderRadius: m3.shape.full, opacity: m3.state.pressed },
});
