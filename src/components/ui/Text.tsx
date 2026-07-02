import { Text as RNText, type TextProps as RNTextProps, Platform } from "react-native";

import { semantic, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { m3 } from "@/lib/theme/m3";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { useFontStyle } from "@/lib/settings/readable-font";
import { useThemePalette } from "@/lib/theme/ThemeContext";

type Variant = "display" | "heading" | "body" | "caption" | "subtle";

export interface TextProps extends RNTextProps {
  variant?: Variant;
  color?: keyof typeof semantic;
  /**
   * Render a Press Start 2P (pixelEn) eyebrow/label. Unlike a hardcoded
   * fontFamily, this still honors the readable-font swap for low-vision users
   * (readable mode overrides it to the readable sans) and the font-scale cap.
   */
  pixelEn?: boolean;
}

const VARIANT_STYLE: Record<Variant, { fontSize: number; fontWeight: "400" | "500" | "600" | "700" | "800" }> = {
  display: { fontSize: typography.sizes.display, fontWeight: "800" },
  heading: { fontSize: typography.sizes.xl, fontWeight: "700" },
  body: { fontSize: typography.sizes.md, fontWeight: "400" },
  caption: { fontSize: typography.sizes.sm, fontWeight: "500" },
  subtle: { fontSize: typography.sizes.xs, fontWeight: "400" },
};

// rev2 M3 track (REV2-MIGRATION P1/P2-cont): the deep-space build retires pixel
// chrome — display/heading/caption render Pretendard, and pixelEn micro-labels
// render Roboto Mono (m3.font.mono). The legacy track (EXPO_PUBLIC_UI=legacy
// rollback) keeps the cosmic-pixel fonts unchanged. isDeepSpaceUI() is
// build-constant, so this resolves once per bundle, not per render.
const DS_M3 = isDeepSpaceUI();

const VARIANT_FONT: Record<Variant, string | undefined> = {
  display: DS_M3 ? fontFamilies.readable : fontFamilies.pixelKo,
  heading: DS_M3 ? fontFamilies.readable : fontFamilies.pixelKo,
  body: fontFamilies.readable,
  caption: DS_M3 ? fontFamilies.readable : fontFamilies.pixelKo,
  subtle: fontFamilies.readable,
};

export function Text({ variant = "body", color, style, maxFontSizeMultiplier, pixelEn = false, ...rest }: TextProps) {
  const v = VARIANT_STYLE[variant];
  // useThemePalette returns the same-shape palette for the active mode
  // (dark default / light when the user toggles). Every <Text/> across
  // the app picks the right tone automatically without per-screen edits.
  const palette = useThemePalette();
  // P2-10: the readable-font preference swaps the pixel variants to the
  // readable sans for low-vision users. body/subtle are already readable.
  const { fontStyle } = useFontStyle();
  const fontFamily = fontStyle === "readable"
    ? fontFamilies.readable
    : pixelEn
      ? (DS_M3 ? m3.font.mono : fontFamilies.pixelEn)
      : VARIANT_FONT[variant];

  // Set logical font scale limits based on variant.
  // Large headers shouldn't scale up as much as body text to avoid breaking layout.
  const defaultMultiplier = (variant === "display" || variant === "heading") ? 1.3 : 1.7;

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? defaultMultiplier}
      {...rest}
      style={[
        { color: palette[color ?? "text"], fontSize: v.fontSize, fontWeight: v.fontWeight, fontFamily },
        rest.numberOfLines !== undefined && Platform.OS === "android" && { paddingBottom: 1.5 },
        style,
      ]}
    />
  );
}
