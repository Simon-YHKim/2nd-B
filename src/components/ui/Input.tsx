import { useState } from "react";
import { TextInput, type TextInputProps, StyleSheet, Platform } from "react-native";

import { gameboy } from "@/lib/theme/gameboy-tokens";
import { cosmic, spacing, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export type InputProps = TextInputProps;

export function Input(props: InputProps) {
  const [focused, setFocused] = useState(false);
  const { style, onFocus, onBlur, accessibilityLabel, placeholder, ...rest } = props;
  const resolvedAccessibilityLabel =
    Platform.OS === "web"
      ? accessibilityLabel ?? (typeof placeholder === "string" ? placeholder : undefined)
      : accessibilityLabel;
  return (
    <TextInput
      {...rest}
      placeholder={placeholder}
      accessibilityLabel={resolvedAccessibilityLabel}
      placeholderTextColor={cosmic.quietGray}
      selectionColor={gameboy.accent}
      cursorColor={gameboy.accent}
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
        style,
        {
          backgroundColor: gameboy.screen,
          borderColor: focused ? gameboy.accent : gameboy.border,
          borderWidth: focused ? gameboy.borderWidth : 1,
          color: gameboy.ink,
          textAlignVertical: props.multiline ? "top" : "auto",
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    borderRadius: gameboy.radius,
    fontFamily: fontFamilies.readable,
    fontSize: typography.sizes.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
