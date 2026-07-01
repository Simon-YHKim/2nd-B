// Field - Material 3 outlined text field (rev2 migration, P1b). Wraps a RN
// TextInput; the outline + label recolour on focus / error. Consumes m3.*
// tokens only. Input text uses Pretendard (KR body); the label uses M3 chrome.
import { useState } from "react";
import { StyleSheet, type StyleProp, Text, TextInput, type TextInputProps, View, type ViewStyle } from "react-native";

import { m3 } from "@/lib/theme/m3";

import { m3TextStyle } from "./typeface";

export interface FieldProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: boolean;
  supportingText?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  error = false,
  supportingText,
  containerStyle,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...rest
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? m3.color.error : focused ? m3.color.primary : m3.color.outline;
  const labelColor = error ? m3.color.error : focused ? m3.color.primary : m3.color.onSurfaceVariant;
  const supportColor = error ? m3.color.error : m3.color.onSurfaceVariant;
  return (
    <View style={containerStyle}>
      <View style={[styles.box, { borderColor }]}>
        {label ? (
          <Text style={[m3TextStyle("bodySmall"), { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
        <TextInput
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityLabel={accessibilityLabel ?? label}
          placeholderTextColor={m3.color.onSurfaceVariant}
          style={[styles.input, { color: m3.color.onSurface, fontFamily: m3.font.brand }]}
        />
      </View>
      {supportingText ? (
        <Text style={[m3TextStyle("bodySmall"), styles.support, { color: supportColor }]} numberOfLines={2}>
          {supportingText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: m3.shape.extraSmall,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
    minHeight: 56,
    justifyContent: "center",
  },
  input: { fontSize: 16, padding: 0, margin: 0 },
  support: { marginTop: m3.spacing.s1, marginHorizontal: m3.spacing.s4 },
});
