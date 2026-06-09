import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { semantic, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { useThemePalette } from "@/lib/theme/ThemeContext";

type Variant = "display" | "heading" | "body" | "caption" | "subtle";

export interface TextProps extends RNTextProps {
  variant?: Variant;
  color?: keyof typeof semantic;
}

const VARIANT_STYLE: Record<Variant, { fontSize: number; fontWeight: "400" | "500" | "600" | "700" | "800" }> = {
  display: { fontSize: typography.sizes.display, fontWeight: "800" },
  heading: { fontSize: typography.sizes.xl, fontWeight: "700" },
  body: { fontSize: typography.sizes.md, fontWeight: "400" },
  caption: { fontSize: typography.sizes.sm, fontWeight: "500" },
  subtle: { fontSize: typography.sizes.xs, fontWeight: "400" },
};

const VARIANT_FONT: Record<Variant, string | undefined> = {
  display: fontFamilies.pixelKo,
  heading: fontFamilies.pixelKo,
  body: fontFamilies.readable,
  caption: fontFamilies.pixelKo,
  subtle: fontFamilies.readable,
};

export function Text({ variant = "body", color, style, maxFontSizeMultiplier, ...rest }: TextProps) {
  const v = VARIANT_STYLE[variant];
  // useThemePalette returns the same-shape palette for the active mode
  // (dark default / light when the user toggles). Every <Text/> across
  // the app picks the right tone automatically without per-screen edits.
  const palette = useThemePalette();
  
  // Set logical font scale limits based on variant.
  // Large headers shouldn't scale up as much as body text to avoid breaking layout.
  const defaultMultiplier = (variant === "display" || variant === "heading") ? 1.3 : 1.7;

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? defaultMultiplier}
      {...rest}
      style={[
        { color: palette[color ?? "text"], fontSize: v.fontSize, fontWeight: v.fontWeight, fontFamily: VARIANT_FONT[variant] },
        style,
      ]}
    />
  );
}
