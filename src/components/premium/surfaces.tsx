// Premium surfaces — top bar, glass panels/cards, buttons, inputs (Part 1).
// Glassy dark panels with glowing borders, mint primary + violet secondary
// CTAs, all reading from cosmic.* so the village identity stays consistent.

import type { ReactNode } from "react";
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
import { cosmic, radii, spacing } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

/** 2B / 2ndB brand chip used at the top-left of premium screens. */
export function BrandChip({ size = 44 }: { size?: number }) {
  return (
    <View style={[styles.brandChip, { width: size, height: size }]}>
      <Text style={styles.brandChipMain}>2B</Text>
      <Text style={styles.brandChipSub}>2ndB</Text>
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
        <Text variant="heading" style={styles.topBarTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subtle" color="textSubtle" numberOfLines={1} style={styles.topBarSub}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.topBarSide, styles.topBarRight]}>{right}</View>
    </View>
  );
}

/** Glassy dark panel. `accent` adds a glowing left border; `glow` adds a halo. */
export function PremiumPanel({
  children,
  accent,
  glow = false,
  style,
}: {
  children: ReactNode;
  accent?: string;
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.panel,
        accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null,
        glow ? styles.panelGlow : null,
        style,
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
  glow = false,
  style,
}: {
  title?: string;
  eyebrow?: string;
  accent?: string;
  right?: ReactNode;
  children?: ReactNode;
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PremiumPanel accent={accent} glow={glow} style={style}>
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

const BTN_BG: Record<BtnVariant, string> = {
  primary: cosmic.signalMint,
  secondary: cosmic.space700,
  ghost: "rgba(141,152,184,0.08)",
  danger: "rgba(255,122,144,0.22)",
};
const BTN_BORDER: Record<BtnVariant, string> = {
  primary: cosmic.signalMint,
  secondary: "rgba(141,152,184,0.56)",
  ghost: "rgba(141,152,184,0.46)",
  danger: cosmic.guardRose,
};
const BTN_FG: Record<BtnVariant, string> = {
  primary: cosmic.space950,
  secondary: cosmic.moonWhite,
  ghost: cosmic.moonWhite,
  danger: cosmic.guardRose,
};
const BTN_DISABLED_BG = "rgba(167,139,250,0.20)";
const BTN_DISABLED_BORDER = "rgba(167,139,250,0.48)";
const BTN_DISABLED_FG = "rgba(232,236,248,0.72)";

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
  const isDisabled = disabled || loading;
  // Merge caller a11y intent (e.g. selected on segmented controls) with the
  // button's own disabled/busy ownership instead of overwriting it.
  const a11yRole = accessibilityRole ?? "button";
  const glowColor =
    variant === "primary"
      ? cosmic.signalMint
      : variant === "danger"
        ? cosmic.guardRose
        : cosmic.soulViolet;
  const fullStyle: ViewStyle | null = full ? { alignSelf: "stretch", width: "100%" } : null;
  const resolvedAccessibilityLabel = accessibilityLabel ?? label;
  const colorStyle: ViewStyle = {
    backgroundColor: BTN_BG[variant],
    borderColor: BTN_BORDER[variant],
    shadowColor: glowColor,
  };
  const disabledStyle: ViewStyle | null = isDisabled
    ? { backgroundColor: BTN_DISABLED_BG, borderColor: BTN_DISABLED_BORDER, shadowOpacity: 0 }
    : null;
  const buttonStyle: StyleProp<ViewStyle> = [
    styles.btn,
    fullStyle,
    colorStyle,
    variant !== "ghost" ? styles.btnGlow : null,
    disabledStyle,
    style,
  ];
  const buttonContent = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={isDisabled ? BTN_DISABLED_FG : BTN_FG[variant]} style={styles.btnIcon} />
      ) : icon ? (
        <View style={styles.btnIcon}>{icon}</View>
      ) : null}
      <Text style={[styles.btnLabel, { color: isDisabled ? BTN_DISABLED_FG : BTN_FG[variant] }]}>
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
      accessibilityRole={a11yRole}
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: false, busy: false }}
      style={({ pressed }) => [
        styles.btn,
        fullStyle,
        colorStyle,
        variant !== "ghost" ? styles.btnGlow : null,
        style,
        pressed ? { opacity: 0.82 } : null,
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
        { borderColor: accent },
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function PremiumInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={cosmic.quietGray}
      {...props}
      accessibilityLabel={textInputAccessibilityLabel(props)}
      style={[styles.input, props.style]}
    />
  );
}

export function PremiumTextarea(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={cosmic.quietGray}
      multiline
      {...props}
      accessibilityLabel={textInputAccessibilityLabel(props)}
      style={[styles.input, styles.textarea, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  brandChip: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.5)",
    backgroundColor: "rgba(114,242,199,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandChipMain: {
    color: cosmic.signalMint,
    fontFamily: fontFamilies.sans,
    fontWeight: "800",
    fontSize: 16,
    lineHeight: 18,
  },
  brandChipSub: {
    color: cosmic.mistGray,
    fontFamily: fontFamilies.sans,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  topBarSide: { width: 64, justifyContent: "center" },
  topBarRight: { alignItems: "flex-end" },
  topBarCenter: { flex: 1, alignItems: "center" },
  topBarTitle: { textAlign: "center" },
  topBarSub: { textAlign: "center", marginTop: 2 },
  panel: {
    backgroundColor: cosmic.panelBg,
    borderColor: cosmic.panelBorder,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  panelGlow: {
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  eyebrow: { letterSpacing: 0, textTransform: "uppercase" },
  cardTitle: { fontSize: 18, letterSpacing: 0 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    elevation: 1,
  },
  btnGlow: { shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  btnIcon: {},
  btnLabel: {
    fontFamily: fontFamilies.sans,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0,
    textAlign: "center",
  },
  cta: { paddingVertical: spacing.lg, borderRadius: radii.md },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(167,139,250,0.08)",
  },
  input: {
    minHeight: 46,
    backgroundColor: "rgba(7,10,24,0.72)",
    borderColor: cosmic.panelBorder,
    borderWidth: 1,
    borderRadius: radii.md,
    color: cosmic.moonWhite,
    fontFamily: fontFamilies.sans,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  textarea: { minHeight: 110, textAlignVertical: "top" },
});
