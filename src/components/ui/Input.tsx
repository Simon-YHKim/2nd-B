import { TextInput, type TextInputProps, StyleSheet } from "react-native";

import { radii, spacing, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { useThemePalette } from "@/lib/theme/ThemeContext";

export type InputProps = TextInputProps;

export function Input(props: InputProps) {
  const palette = useThemePalette();
  return (
    <TextInput
      {...props}
      placeholderTextColor={palette.textSubtle}
      style={[
        styles.base,
        {
          backgroundColor: palette.surfaceAlt,
          borderColor: palette.border,
          color: palette.text,
        },
        props.style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: radii.md,
    fontFamily: fontFamilies.sans,
    fontSize: typography.sizes.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
