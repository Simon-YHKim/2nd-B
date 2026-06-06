import { StyleSheet, Switch, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";

export function PreferenceSwitch({
  value,
  disabled,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
}: {
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  return (
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ false: semantic.border, true: semantic.brand }}
      thumbColor={semantic.text}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled }}
    />
  );
}

export function PreferenceToggleRow({
  label,
  description,
  value,
  disabled,
  muted,
  lockedLabel,
  accessibilityHint,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  muted?: boolean;
  lockedLabel?: string;
  accessibilityHint?: string;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <View style={styles.labelRow}>
          <Text variant="body" color={muted ? "textMuted" : "text"}>
            {label}
          </Text>
          {lockedLabel ? (
            <Text variant="subtle" color="textSubtle" style={styles.lockedTag}>
              {lockedLabel}
            </Text>
          ) : null}
        </View>
        {description ? (
          <Text variant="subtle" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
      <PreferenceSwitch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint ?? description}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  copy: { flex: 1, gap: 2 },
  labelRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  lockedTag: {
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
  },
});
