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

// ── 비활성 상태 (PIXEL-CLAY 절대 규칙 4) ──
//
// 전에는 `disabled: { opacity: 0.38 }` 한 줄이었다. 그 한 줄이 2026-08-27
// 화면 실측에서 **네 라우트에 여섯 번** 나타났다 (/plans 3 · /northstar 1 ·
// /capture 1 · /reasoning 1). 꼬리 28건 중 가장 값싼 지점이라 여기부터 닫는다.
//
// 합성은 `m3.disabled` 가 한다. 이 파일이 직접 하지 않는 이유는 경계 때문이다:
// `m3-primitives.test.ts` 가 M3 프리미티브의 `theme/tokens` import 를 막는다.
const DISABLED_CONTAINER: Record<MdButtonVariant, ViewStyle> = {
  filled: { backgroundColor: m3.disabled.primary },
  tonal: { backgroundColor: m3.disabled.secondaryContainer },
  outlined: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: m3.disabled.outline,
  },
  text: { backgroundColor: "transparent", paddingHorizontal: m3.spacing.s3 },
  elevated: { backgroundColor: m3.disabled.surfaceContainerLow, ...m3.elevation.level1 },
};

const DISABLED_FG: Record<MdButtonVariant, string> = {
  filled: m3.disabled.onPrimary,
  tonal: m3.disabled.onSecondaryContainer,
  outlined: m3.disabled.onSurface,
  text: m3.disabled.onSurface,
  elevated: m3.disabled.onSurface,
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
  // 비활성일 때 전경도 미리 합성한 색을 쓴다. 전에는 컨테이너의 불투명도가
  // 글자까지 함께 덮었으므로, 컨테이너만 바꾸고 글자를 그대로 두면
  // 비활성이 활성보다 또렷해진다. 규칙은 지키고 뜻은 뒤집히는 셈이다.
  const fg = isDisabled ? DISABLED_FG[variant] : FG[variant];
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
      style={[
        styles.base,
        isDisabled ? DISABLED_CONTAINER[variant] : CONTAINER[variant],
        style,
      ]}
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
  stateLayer: { borderRadius: m3.shape.full, opacity: m3.state.pressed },
});
