import { Text as RNText, type TextProps as RNTextProps, Platform } from "react-native";

import { semantic, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { m3, type M3TypeRole } from "@/lib/theme/m3";
import { galmuriFor } from "@/components/m3/typeface";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { useFontStyle } from "@/lib/settings/readable-font";
import { useThemePalette } from "@/lib/theme/ThemeContext";

type Variant = "display" | "heading" | "body" | "caption" | "subtle";

export interface TextProps extends RNTextProps {
  variant?: Variant;
  color?: keyof typeof semantic;
  /**
   * Render a micro-label in the pixel mono face (m3.font.mono on deep-space,
   * Press Start 2P on the legacy track). It is chrome, so the readable-font
   * preference leaves it alone (Simon 2026-08-21: readable = reading text
   * only); it still honors the font-scale cap.
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

// PIXEL-CLAY (docs/PIXEL-CLAY-MIGRATION.md; Simon 2026-09-05, app-wide Galmuri):
// every variant renders the Galmuri pixel face on both tracks. This reverses the
// rev2 M3 decision that "retired pixel chrome" (display/heading/caption/body ->
// Pretendard); the SoT §5 names that delta as the one that flipped direction.
//
// Two things make "Galmuri" actually crisp instead of a blurry bitmap:
//   1. Sizes come from the M3 grid (m3.type), not typography.sizes. Galmuri is
//      a bitmap face that is sharp only at integer multiples of its native size
//      (Galmuri9 10px, Galmuri11 12px, Galmuri14 15px; see components/m3/
//      typeface.ts). typography.sizes (12/14/16/25/39) had 4 of 5 variants off
//      the grid. Each variant maps to the M3 role with the nearest on-grid size:
//        display 39 -> 30 (displaySmall, Galmuri14 x2)
//        heading 25 -> 24 (headlineSmall, Galmuri11 x2)
//        body    16 -> 15 (bodyLarge,     Galmuri14 x1)
//        caption 14 -> 12 (labelLarge,    Galmuri11 x1)
//        subtle  12 -> 10 (bodySmall,     Galmuri9  x1)
//      Line height is NOT taken from the role (kept at the RN default as
//      before), so this change moves faces and sizes, not vertical rhythm.
//   2. Weight lives in the face name (Galmuri11Bold), never in fontWeight: a
//      fontWeight on a bitmap face makes the renderer synthesize bold and smear
//      the pixels. galmuriFor() picks the face; pixel mode sends no fontWeight.
//      Readable mode keeps fontWeight because Pretendard gets its weight from
//      the style, not the face.
//
// Readable-font preference (P2-10; Simon 2026-08-21 Q2 = reading text only):
// switching to readable swaps READING text (body, subtle) to Pretendard and
// leaves chrome (display, heading, caption, pixelEn labels) on Galmuri. That is
// the same line m3TextStyle() draws with READING_ROLES; <Text> used to flip
// everything, so the two text systems disagreed. Size stays identical across
// the swap. Guarded by src/components/ui/__tests__/text-pixel-first.test.ts.
//
// DS_M3 stays for pixelEn micro-labels (m3.font.mono on deep-space, Press
// Start 2P on the legacy track). isDeepSpaceUI() is build-constant, so this
// resolves once per bundle, not per render.
const DS_M3 = isDeepSpaceUI();

const VARIANT_ROLE: Record<Variant, M3TypeRole> = {
  display: "displaySmall",
  heading: "headlineSmall",
  body: "bodyLarge",
  caption: "labelLarge",
  subtle: "bodySmall",
};

/** Reading text: the only variants the readable-font preference touches. */
const READING_VARIANTS: ReadonlySet<Variant> = new Set<Variant>(["body", "subtle"]);

/** VARIANT_STYLE weights include 600/800, which no Galmuri face has; fold them. */
function galmuriWeight(w: (typeof VARIANT_STYLE)[Variant]["fontWeight"]): "400" | "500" | "700" {
  if (w === "700" || w === "800") return "700";
  if (w === "500" || w === "600") return "500";
  return "400";
}

export function Text({ variant = "body", color, style, maxFontSizeMultiplier, pixelEn = false, ...rest }: TextProps) {
  const v = VARIANT_STYLE[variant];
  const role = m3.type[VARIANT_ROLE[variant]];
  // useThemePalette returns the same-shape palette for the active mode
  // (dark default / light when the user toggles). Every <Text/> across
  // the app picks the right tone automatically without per-screen edits.
  const palette = useThemePalette();
  const { fontStyle } = useFontStyle();
  const readable = fontStyle === "readable" && READING_VARIANTS.has(variant) && !pixelEn;
  const fontFamily = readable
    ? fontFamilies.readable
    : pixelEn
      ? (DS_M3 ? m3.font.mono : fontFamilies.pixelEn)
      : galmuriFor(role.size, galmuriWeight(v.fontWeight));

  // Set logical font scale limits based on variant.
  // Large headers shouldn't scale up as much as body text to avoid breaking layout.
  const defaultMultiplier = (variant === "display" || variant === "heading") ? 1.3 : 1.7;

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? defaultMultiplier}
      {...rest}
      style={[
        { color: palette[color ?? "text"], fontSize: role.size, fontFamily },
        readable && { fontWeight: v.fontWeight },
        rest.numberOfLines !== undefined && Platform.OS === "android" && { paddingBottom: 1.5 },
        style,
      ]}
    />
  );
}
