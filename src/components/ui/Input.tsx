import { useState } from "react";
import { TextInput, type TextInputProps, StyleSheet } from "react-native";

import { radii, spacing, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { useThemePalette } from "@/lib/theme/ThemeContext";

export type InputProps = TextInputProps;

export function Input(props: InputProps) {
  const palette = useThemePalette();
  const [focused, setFocused] = useState(false);
  const { style, onFocus, onBlur, accessibilityLabel, placeholder, ...rest } = props;
  const resolvedAccessibilityLabel =
    accessibilityLabel ?? (typeof placeholder === "string" ? placeholder : undefined);
  return (
    <TextInput
      {...rest}
      placeholder={placeholder}
      accessibilityLabel={resolvedAccessibilityLabel}
      placeholderTextColor={palette.textSubtle}
      selectionColor={palette.brand}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        styles.base,
        {
          backgroundColor: palette.surface,
          borderColor: focused ? palette.brand : palette.border,
          color: palette.text,
          shadowColor: focused ? palette.brand : "transparent",
          shadowOpacity: focused ? 0.32 : 0,
          textAlignVertical: props.multiline ? "top" : "auto",
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radii.md,
    fontFamily: fontFamilies.sans,
    fontSize: typography.sizes.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
