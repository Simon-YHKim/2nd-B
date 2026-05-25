import { TextInput, type TextInputProps, StyleSheet } from "react-native";
import { radii, semantic, spacing, typography } from "@/lib/theme/tokens";

export type InputProps = TextInputProps;

export function Input(props: InputProps) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={semantic.textSubtle}
      style={[styles.input, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    color: semantic.text,
    fontSize: typography.sizes.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
