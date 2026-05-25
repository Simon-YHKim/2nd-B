import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { semantic, typography } from "@/lib/theme/tokens";

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

export function Text({ variant = "body", color, style, ...rest }: TextProps) {
  const v = VARIANT_STYLE[variant];
  return (
    <RNText
      {...rest}
      style={[
        { color: semantic[color ?? "text"], fontSize: v.fontSize, fontWeight: v.fontWeight },
        style,
      ]}
    />
  );
}
