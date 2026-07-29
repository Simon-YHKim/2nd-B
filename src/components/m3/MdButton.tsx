// MdButton - Material 3 button (rev2 migration, P1b). Presentational; consumes
// m3.* tokens only. Five M3 variants. Stadium corner (m3.shape.full) per the
// approved rev2 direction (DESIGN.md carries an explicit M3-track exception).
//
// Pressable children note (#680, 2단계): Fabric Android drops FUNCTION-FORM
// Pressable props at runtime while the source still reads fine. #680 closed the
// function-form STYLE case; this component carried the unguarded sibling -
// function-as-CHILDREN ({({pressed}) => ...}) - which is what erased the
// onboarding Get started touch target (rc2 emulator QA, docs/qa/rc2-260721) and
// was patched screen-locally in #1128. The press state now comes from
// onPressIn/onPressOut local state, so the children tree is STATIC and every
// one of this button's call sites is safe at once. Do not reintroduce a
// function child or a function style here.
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  type GestureResponderEvent,
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
  onPressIn,
  onPressOut,
  ...rest
}: MdButtonProps) {
  const isDisabled = disabled || loading;
  const fg = FG[variant];
  // M3 pressed state layer without a function child. onPressOut also fires when
  // the gesture is cancelled (drag-off), so the layer cannot stick on.
  const [pressed, setPressed] = useState(false);
  const showStateLayer = pressed && !isDisabled;
  const handlePressIn = (e: GestureResponderEvent) => {
    setPressed(true);
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    setPressed(false);
    onPressOut?.(e);
  };
  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      // Android's own state layer. Additive: it cannot remove a touch target,
      // and it keeps parity with MdCard / MdChip / MdNavBar.
      android_ripple={isDisabled ? undefined : { color: fg }}
      style={[styles.base, CONTAINER[variant], isDisabled && styles.disabled, style]}
    >
      {showStateLayer ? (
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
