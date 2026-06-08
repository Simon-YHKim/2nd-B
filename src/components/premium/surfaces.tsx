// Premium surfaces — top bar, glass panels/cards, buttons, inputs (Part 1).
// Glassy dark panels with accent borders, mint primary + violet secondary
// CTAs, all reading from cosmic.* so the village identity stays consistent.

import { type ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
  type StyleProp,
} from "react-native";

import { Text } from "@/components/ui/Text";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, semantic, spacing, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

/** Compact 2nd-Brain brand chip used at the top-left of premium screens. */
export function BrandChip({ size = 44 }: { size?: number }) {
  return (
    <View style={[styles.brandChip, { width: size, height: size }]}>
      <Text style={styles.brandChipMain}>2B</Text>
      <Text style={styles.brandChipSub}>Brain</Text>
    </View>
  );
}

/** Premium top bar: brand chip · centered title/subtitle · right slot. */
export function PremiumTopBar({
  title,
  subtitle,
  right,
  brand = true,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  brand?: boolean;
}) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topBarSide}>{brand ? <BrandChip /> : null}</View>
      <View style={styles.topBarCenter}>
        <Text variant="heading" style={styles.topBarTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subtle" color="textSubtle" numberOfLines={2} style={styles.topBarSub}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.topBarSide, styles.topBarRight]}>{right}</View>
    </View>
  );
}

/** Glassy dark panel. `accent` adds a left border. */
export function PremiumPanel({
  children,
  accent,
  style,
}: {
  children: ReactNode;
  accent?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        style,
        styles.panel,
        accent ? { borderLeftWidth: gameboy.borderWidth, borderLeftColor: accent } : null,
      ]}
    >
      {children}
    </View>
  );
}

/** Card = panel with an optional title/eyebrow header. */
export function PremiumCard({
  title,
  eyebrow,
  accent = cosmic.soulViolet,
  right,
  children,
  style,
}: {
  title?: string;
  eyebrow?: string;
  accent?: string;
  right?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PremiumPanel accent={accent} style={style}>
      {title || eyebrow || right ? (
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            {eyebrow ? (
              <Text variant="caption" color="textMuted" style={styles.eyebrow}>
                {eyebrow}
              </Text>
            ) : null}
            {title ? (
              <Text variant="heading" style={styles.cardTitle}>
                {title}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </PremiumPanel>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

const BTN_BG_REST: Record<BtnVariant, string> = {
  primary: gameboy.power,
  secondary: cosmic.space700,
  ghost: withAlpha(cosmic.mistGray, 0.08),
  danger: semantic.zoneRed,
};
const BTN_BG_HOVER: Record<BtnVariant, string> = {
  primary: gameboy.accent,
  secondary: cosmic.space800,
  ghost: withAlpha(cosmic.signalBlue, 0.16),
  danger: semantic.zoneRed,
};
const BTN_FG: Record<BtnVariant, string> = {
  primary: gameboy.screen,
  secondary: gameboy.ink,
  ghost: gameboy.ink,
  danger: gameboy.ink,
};
const BTN_DISABLED_BG = withAlpha(cosmic.mistGray, 0.16);
const BTN_DISABLED_BORDER = withAlpha(cosmic.mistGray, 0.46);
const BTN_DISABLED_FG = withAlpha(cosmic.moonWhite, 0.58);
const PRESSED_OFFSET = 2;

function textInputAccessibilityLabel(props: TextInputProps): string | undefined {
  return props.accessibilityLabel ?? (typeof props.placeholder === "string" ? props.placeholder : undefined);
}

export interface PremiumButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: BtnVariant;
  icon?: ReactNode;
  loading?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PremiumButton({
  label,
  variant = "primary",
  icon,
  loading,
  disabled,
  full,
  style,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  accessibilityRole,
  accessibilityState,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: PremiumButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isDisabled = disabled || loading;
  // Merge caller a11y intent (e.g. selected on segmented controls) with the
  // button's own disabled/busy ownership instead of overwriting it.
  const a11yRole = accessibilityRole ?? "button";
  const fullStyle: ViewStyle | null = full ? { alignSelf: "stretch", width: "100%" } : null;
  const resolvedAccessibilityLabel = accessibilityLabel ?? label;
  const colorStyle: ViewStyle = isDisabled
    ? {
        backgroundColor: BTN_DISABLED_BG,
        borderColor: BTN_DISABLED_BORDER,
        shadowColor: BTN_DISABLED_BORDER,
      }
    : {
        backgroundColor: hovered || focused ? BTN_BG_HOVER[variant] : BTN_BG_REST[variant],
        borderColor: focused ? gameboy.accent : gameboy.border,
        shadowColor: focused ? gameboy.accent : gameboy.border,
      };
  const buttonStyle: StyleProp<ViewStyle> = [
    style,
    fullStyle,
    styles.btn,
    colorStyle,
  ];
  const foregroundColor = isDisabled ? BTN_DISABLED_FG : BTN_FG[variant];
  const buttonContent = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={foregroundColor} style={styles.btnIcon} />
      ) : icon ? (
        <View style={styles.btnIcon}>{icon}</View>
      ) : null}
      <Text style={[styles.btnLabel, { color: foregroundColor }]}>
        {label}
      </Text>
    </>
  );

  if (isDisabled) {
    return (
      <View
        accessibilityRole={a11yRole}
        accessibilityState={{ ...accessibilityState, disabled: true, busy: !!loading }}
        accessibilityLabel={resolvedAccessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessible
        style={buttonStyle}
      >
        {buttonContent}
      </View>
    );
  }

  return (
    <Pressable
      {...rest}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onHoverIn={(event) => {
        setHovered(true);
        rest.onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        rest.onHoverOut?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        rest.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        rest.onBlur?.(event);
      }}
      accessibilityRole={a11yRole}
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: false, busy: false }}
      style={({ pressed }) => [
        style,
        fullStyle,
        styles.btn,
        colorStyle,
        pressed ? styles.btnPressed : null,
      ]}
    >
      {buttonContent}
    </Pressable>
  );
}

/** Big full-width call-to-action (the dominant button on a screen). */
export function PremiumCTA({
  label,
  variant = "primary",
  icon,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  variant?: "primary" | "secondary";
  icon?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <PremiumButton
      label={label}
      variant={variant}
      icon={icon}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      full
      style={styles.cta}
    />
  );
}

/** Small square pixel icon button (top bar actions, etc.). */
export function PixelIconButton({
  children,
  onPress,
  accessibilityLabel,
  accent = cosmic.soulViolet,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  accent?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.iconBtn,
        { shadowColor: accent },
        pressed ? styles.iconBtnPressed : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

function GameBoyTextInput(props: TextInputProps) {
  const [focused, setFocused] = useState(false);
  const { style, onFocus, onBlur, ...rest } = props;

  return (
    <TextInput
      placeholderTextColor={cosmic.quietGray}
      selectionColor={gameboy.accent}
      cursorColor={gameboy.accent}
      {...rest}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      accessibilityLabel={textInputAccessibilityLabel(props)}
      style={[
        styles.input,
        props.multiline ? styles.textarea : null,
        style,
        styles.inputFrame,
        focused ? styles.inputFocused : null,
      ]}
    />
  );
}

export function PremiumInput(props: TextInputProps) {
  return <GameBoyTextInput {...props} />;
}

export function PremiumTextarea(props: TextInputProps) {
  return <GameBoyTextInput {...props} multiline />;
}

const styles = StyleSheet.create({
  brandChip: {
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    backgroundColor: withAlpha(cosmic.signalMint, 0.08),
    alignItems: "center",
    justifyContent: "center",
    ...pixelShadowStyle(gameboy.border),
  },
  brandChipMain: {
    color: cosmic.signalMint,
    fontFamily: fontFamilies.pixelKo,
    fontWeight: "800",
    fontSize: 16,
    lineHeight: 18,
  },
  brandChipSub: {
    color: cosmic.mistGray,
    fontFamily: fontFamilies.pixelKo,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    borderRadius: gameboy.radius,
    backgroundColor: gameboy.screen,
    ...pixelShadowStyle(),
  },
  topBarSide: { width: 64, justifyContent: "center" },
  topBarRight: { alignItems: "flex-end" },
  topBarCenter: { flex: 1, minWidth: 0, alignItems: "center" },
  topBarTitle: { textAlign: "center", fontFamily: fontFamilies.pixelKo },
  topBarSub: { textAlign: "center", marginTop: 2 },
  panel: {
    backgroundColor: cosmic.panelBg,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.lg,
    gap: spacing.sm,
    ...pixelShadowStyle(),
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  eyebrow: { fontFamily: fontFamilies.pixelKo, letterSpacing: 0, textTransform: "uppercase" },
  cardTitle: { fontFamily: fontFamilies.pixelKo, fontSize: 18, letterSpacing: 0 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    ...pixelShadowStyle(),
  },
  btnPressed: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    transform: [{ translateX: PRESSED_OFFSET }, { translateY: PRESSED_OFFSET }],
  },
  btnIcon: {},
  btnLabel: {
    fontFamily: fontFamilies.pixelKo,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0,
    textAlign: "center",
  },
  cta: { paddingVertical: spacing.lg },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(cosmic.space800, 0.48),
    ...pixelShadowStyle(),
  },
  iconBtnPressed: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    transform: [{ translateX: PRESSED_OFFSET }, { translateY: PRESSED_OFFSET }],
  },
  input: {
    minHeight: 46,
    color: cosmic.moonWhite,
    fontFamily: fontFamilies.readable,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputFrame: {
    backgroundColor: gameboy.screen,
    borderColor: gameboy.border,
    borderWidth: 1,
    borderRadius: gameboy.radius,
  },
  inputFocused: {
    borderColor: gameboy.accent,
    borderWidth: gameboy.borderWidth,
  },
  textarea: { minHeight: 110, textAlignVertical: "top" },
});
